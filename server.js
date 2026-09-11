/**
 * CARLINE HOLD — emergency dismissal display
 * =========================================
 * A separate service on purpose. It shares no code, no database and no
 * deployment with the PreK parent dashboard: different audience (school
 * staff, not one family), different credentials, and a bad deploy on one
 * must never take down the other.
 *
 *   /type      staff   — numeric keypad, appends car numbers to the queue
 *   /staff     staff   — every teacher's phone: the running list, filtered to
 *                        their own class, so they send their kids to the line
 *   /display   either  — the gym screen, read-only
 *   /roster    staff   — car number -> homeroom teacher and grade. No child
 *                        names live anywhere in this system, by decision of the
 *                        school's security review: a number identifies a car,
 *                        and a homeroom tells a teacher it is theirs.
 *   /report    staff   — the after-action record: every number, every time
 *
 * The screen is redundancy for the loudspeaker, never a replacement. If it
 * fails, dismissal falls back to exactly how it works today.
 */
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const gate    = require('./lib/gate');

const app  = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
const ROSTER_FILE = path.join(DATA, 'roster.json');
const HOLD_FILE   = path.join(DATA, 'hold.json');
const LOG_DIR     = path.join(DATA, 'log');   // one archived session per dismissal

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use((req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));
app.get('/healthz', (req, res) => res.json({ ok: true, defaults: gate.usingDefaults() }));

if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

// A Railway volume mounted at /app/data starts EMPTY and masks whatever the
// repo shipped there, so a bundled roster is invisible on a fresh service —
// the screen shows bare numbers and no names. The seed therefore lives
// OUTSIDE the mount, and is copied in exactly once, when the volume is bare.
// After that the volume is the only source of truth and is never overwritten.
const SEED_FILE = path.join(__dirname, 'seed', 'roster.json');
if (!fs.existsSync(ROSTER_FILE) && fs.existsSync(SEED_FILE)) {
    try {
        fs.copyFileSync(SEED_FILE, ROSTER_FILE);
        console.log('Roster seeded from seed/roster.json — edit it at /roster.');
    } catch (err) {
        console.warn('Could not seed roster:', err.message);
    }
}

// The security review removed child names from the record entirely. Any
// roster written before that decision still has them sitting in the volume,
// so strip them once, on boot, rather than merely hiding them in the UI.
(function purgeLegacyNames() {
    try {
        const rows = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
        if (!Array.isArray(rows) || !rows.some(r => r && r.names)) return;
        const clean = rows.map(r => ({
            number: String(r.number || ''),
            // "room" was the old column and usually held the homeroom already.
            teacher: String(r.teacher || r.room || ''),
            grade: String(r.grade || '')
        }));
        fs.writeFileSync(ROSTER_FILE, JSON.stringify(clean, null, 2));
        console.log('Purged child names from ' + rows.length + ' roster rows.');
    } catch (_) { /* no roster yet, or unreadable — the seed will handle it */ }
})();

function readJSON(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function writeJSON(file, value) {
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
    return value;
}

const readRoster = () => readJSON(ROSTER_FILE, []);

// A queue entry is either a car number or a manually typed name. Everything
// downstream — display, staff list, report — only ever needs the one string
// that gets called out, so normalise it here rather than in four places.
const labelOf = (c) => (c && c.number != null && c.number !== '')
    ? String(c.number) : String((c && c.name) || '');
const isManual = (c) => !!(c && c.name);
const readHold   = () => readJSON(HOLD_FILE, { active: false, startedAt: null, calls: [] });

// ==================== SIGN IN ====================

app.get(['/login', '/login.html'], (req, res) => {
    if (gate.roleFromRequest(req)) return res.redirect(302, '/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

const attempts = new Map();
app.post('/api/login', (req, res) => {
    const ip = req.ip || 'unknown', now = Date.now();
    const a = attempts.get(ip) || { n: 0, until: now + 15 * 60 * 1000 };
    if (now > a.until) { a.n = 0; a.until = now + 15 * 60 * 1000; }
    if (a.n >= 8) return res.status(429).json({ error: 'Too many tries. Wait 15 minutes.' });

    const role = gate.roleFromPassword((req.body || {}).password || '');
    if (!role) { a.n++; attempts.set(ip, a); return res.status(401).json({ error: "That password isn't right." }); }

    attempts.delete(ip);
    gate.setCookie(res, role, (req.headers['x-forwarded-proto'] || '').includes('https'));
    res.json({ ok: true, role });
});

// ==== everything below is behind the gate ====
app.use(gate.gate);
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ==================== THE HOLD ====================

app.get('/api/hold', (req, res) => {
    const hold = readHold();
    const roster = readRoster();
    const byNumber = new Map(roster.map(r => [String(r.number), r]));
    res.json({
        active: hold.active,
        startedAt: hold.startedAt,
        // Newest first: the display reads position 0 as "now calling".
        calls: hold.calls.slice().reverse().map(c => {
            const r = byNumber.get(String(c.number));
            return { label: labelOf(c), manual: isManual(c), at: c.at, repeat: !!c.repeat,
                     teacher: (r && r.teacher) || '', grade: (r && r.grade) || '' };
        }),
        // The staff view filters to one homeroom, so it needs the list.
        teachers: [...new Set(roster.map(r => r.teacher).filter(Boolean))].sort(),
        role: req.role
    });
});

app.post('/api/hold/start', gate.requireStaff, (req, res) => {
    res.json(writeJSON(HOLD_FILE, { active: true, startedAt: new Date().toISOString(), calls: [] }));
});

app.post('/api/hold/end', gate.requireStaff, (req, res) => {
    const hold = readHold();
    hold.active = false;
    res.json(writeJSON(HOLD_FILE, hold));
});

// Reset returns the board to a clean idle state — no calls, no clock. It is
// not "end dismissal": the next number typed starts a fresh hold on its own,
// so a reset in the middle of a real event costs nothing but the scrollback.
app.post('/api/hold/reset', gate.requireStaff, (req, res) => {
    const hold = readHold();
    const cleared = hold.calls.length;
    const retracted = (hold.removed || []).length;

    // Archive BEFORE clearing. Reset used to be the only way to end a
    // dismissal and it destroyed the evidence with it; the log is the whole
    // reason a report can exist after everyone has gone home.
    let archived = null;
    if (cleared || retracted) {
        try {
            if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
            const startedAt = hold.startedAt || (hold.calls[0] && hold.calls[0].at) || new Date().toISOString();
            // Filename-safe and sortable, and with no dots or slashes it can
            // never be walked back out of the log directory by a crafted id.
            const id = startedAt.replace(/[:.]/g, '-');
            writeJSON(path.join(LOG_DIR, id + '.json'), {
                id, startedAt, endedAt: new Date().toISOString(),
                calls: hold.calls, removed: hold.removed || []
            });
            archived = id;
        } catch (err) {
            // Never let a logging failure block the reset — the board clearing
            // is the operational need; the log is the paperwork.
            console.warn('Could not archive dismissal:', err.message);
        }
    }

    writeJSON(HOLD_FILE, { active: false, startedAt: null, calls: [], removed: [] });
    res.json({ ok: true, cleared, archived });
});

// ==================== REPORTS ====================

const SAFE_ID = /^[0-9A-Za-z-]{1,40}$/;

/** Attach the roster match to every call, as the display does. */
function decorateReport(r) {
    const roster = readRoster();
    const byNumber = new Map(roster.map(x => [String(x.number), x]));
    const attach = (c) => {
        const m = byNumber.get(String(c.number));
        return { label: labelOf(c), manual: isManual(c), at: c.at, removedAt: c.removedAt,
                 repeat: !!c.repeat,
                 teacher: (m && m.teacher) || '', grade: (m && m.grade) || '' };
    };
    return Object.assign({}, r, {
        calls: (r.calls || []).map(attach),
        removed: (r.removed || []).map(attach)
    });
}

app.get('/api/reports', gate.requireStaff, (req, res) => {
    let files = [];
    try { files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.json')); } catch (_) {}
    const reports = files.sort().reverse().slice(0, 400).map(f => {
        const d = readJSON(path.join(LOG_DIR, f), null);
        if (!d) return null;
        return { id: d.id, startedAt: d.startedAt, endedAt: d.endedAt,
                 count: (d.calls || []).length, retracted: (d.removed || []).length };
    }).filter(Boolean);

    const hold = readHold();
    res.json({
        reports,
        current: { count: hold.calls.length, startedAt: hold.startedAt,
                   retracted: (hold.removed || []).length }
    });
});

app.get('/api/report/:id', gate.requireStaff, (req, res) => {
    const id = String(req.params.id || '');
    if (id === 'current') {
        const hold = readHold();
        return res.json(decorateReport({
            id: 'current', startedAt: hold.startedAt, endedAt: null,
            calls: hold.calls, removed: hold.removed || []
        }));
    }
    if (!SAFE_ID.test(id)) return res.status(400).json({ error: 'Bad report id.' });
    const d = readJSON(path.join(LOG_DIR, id + '.json'), null);
    if (!d) return res.status(404).json({ error: 'No such report.' });
    res.json(decorateReport(d));
});

/** Shared by the keypad and the manual-name entry. */
function pushToQueue(entry, res) {
    const hold = readHold();
    if (!hold.active) { hold.active = true; hold.startedAt = new Date().toISOString(); }

    // Anything already called in THIS dismissal is a duplicate, however long
    // ago. The old rule only looked back 60 seconds and 8 entries, so a car
    // the other typist called five minutes earlier went in again silently —
    // and on the screen a repeat reads as "they missed me the first time".
    // A genuine re-call is still possible; it just has to be deliberate.
    const label = labelOf(entry);
    const force = entry.force === true;
    delete entry.force;

    const prior = hold.calls.filter(c => labelOf(c).toLowerCase() === label.toLowerCase());
    if (prior.length && !force) {
        const last = prior[prior.length - 1];
        return res.json({ duplicate: true, calledAt: last.at, times: prior.length,
                          calls: hold.calls.length });
    }
    if (prior.length) entry.repeat = true;   // flagged in the record

    entry.at = new Date().toISOString();
    hold.calls.push(entry);
    writeJSON(HOLD_FILE, hold);

    // Hand the roster match back so the typist sees whose car they just
    // called. A number with no homeroom behind it is usually a typo, and the
    // only person who can catch it is the one who typed it — the staging
    // screen just shows the number.
    const match = entry.number ? readRoster().find(r => String(r.number) === entry.number) : null;
    res.json({
        ok: true, calls: hold.calls.length, label, manual: isManual(entry),
        repeat: !!entry.repeat,
        teacher: (match && match.teacher) || '', grade: (match && match.grade) || ''
    });
}

app.post('/api/hold/call', gate.requireStaff, (req, res) => {
    const number = String((req.body || {}).number || '').trim();
    if (!/^\d{1,5}$/.test(number)) return res.status(400).json({ error: 'Digits only.' });
    pushToQueue({ number, force: (req.body || {}).force === true }, res);
});

// A pickup with no car number — a grandparent, a rideshare, a neighbour on a
// one-off. The name is typed rather than matched: a teacher in a rainstorm
// cannot be asked to spell a name closely enough for fuzzy matching to be
// safe, so this queues exactly what was typed and the verification stays
// where it belongs, at the car.
app.post('/api/hold/name', gate.requireStaff, (req, res) => {
    const name = String((req.body || {}).name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (name.length < 2) return res.status(400).json({ error: 'Type a name.' });
    if (/^\d+$/.test(name)) return res.status(400).json({ error: 'That is a number — use the keypad.' });
    pushToQueue({ name, force: (req.body || {}).force === true }, res);
});

app.post('/api/hold/undo', gate.requireStaff, (req, res) => {
    const hold = readHold();
    const last = hold.calls[hold.calls.length - 1];
    if (!last) return res.status(409).json({ error: 'Nothing to undo.' });

    // The client says which entry it believes is last. If another typist
    // called a car in the meantime, popping blindly would erase a family
    // that is still sitting in the line. Refuse instead.
    const expected = String((req.body || {}).label || (req.body || {}).number || '').trim();
    if (expected && labelOf(last) !== expected) {
        return res.status(409).json({ error: `${labelOf(last)} was called since — nothing removed.` });
    }

    hold.calls.pop();
    // A retraction is part of the record. An emergency-dismissal log that
    // quietly omits "we called 412 and pulled it back" is a worse record than
    // no log at all, so keep it and show it on the report.
    hold.removed = (hold.removed || []).concat([
        Object.assign({}, last, { removedAt: new Date().toISOString() })
    ]);
    writeJSON(HOLD_FILE, hold);
    res.json({ ok: true, removed: labelOf(last), calls: hold.calls.length });
});

// ==================== ROSTER ====================

app.get('/api/roster', gate.requireStaff, (req, res) => res.json({ roster: readRoster() }));

app.put('/api/roster', gate.requireStaff, (req, res) => {
    const incoming = Array.isArray((req.body || {}).roster) ? req.body.roster : null;
    if (!incoming) return res.status(400).json({ error: 'roster array required.' });
    // Number, homeroom teacher, grade. Nothing else is accepted — a child
    // name posted by an old client or a stale tab is dropped on the floor
    // rather than written to the volume.
    const clean = incoming.slice(0, 2000).map(r => ({
        number: String(r.number || '').trim().slice(0, 5),
        teacher: String(r.teacher || '').trim().slice(0, 40),
        grade: String(r.grade || '').trim().slice(0, 24)
    })).filter(r => /^\d{1,5}$/.test(r.number));
    writeJSON(ROSTER_FILE, clean);
    res.json({ ok: true, count: clean.length });
});

// ==================== PAGES ====================

const page = (file) => (req, res) => res.sendFile(path.join(__dirname, 'public', file));

app.get('/display', page('display.html'));
app.get('/type',   (req, res, next) => req.role === 'staff' ? next() : res.redirect(302, '/login?next=%2Ftype'), page('type.html'));
app.get('/staff',  (req, res, next) => req.role === 'staff' ? next() : res.redirect(302, '/login?next=%2Fstaff'), page('staff.html'));
app.get('/roster', (req, res, next) => req.role === 'staff' ? next() : res.redirect(302, '/login?next=%2Froster'), page('roster.html'));
app.get('/report', (req, res, next) => req.role === 'staff' ? next() : res.redirect(302, '/login?next=%2Freport'), page('report.html'));

// A display-only session has exactly one place to be.
app.get('/', (req, res) => res.redirect(302, req.role === 'staff' ? '/type' : '/display'));
app.get('*', (req, res) => res.redirect(302, '/'));

app.listen(PORT, () => {
    console.log(`Carline Hold on :${PORT}`);
    if (gate.usingDefaults()) console.warn('⚠️  Default passwords in use — set STAFF_PASSWORD and DISPLAY_PASSWORD.');
});
