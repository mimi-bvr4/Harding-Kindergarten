/**
 * Harding Academy Parent Dashboard — server v4
 *
 * Adds:
 *   • /admin — password-protected admin page for school staff
 *   • Document uploads (PDFs, images, Word docs) served from /docs
 *   • GitHub sync: every save is committed to the repo, and the latest
 *     data + documents are pulled from the repo on boot, so content
 *     survives Railway redeploys with zero git knowledge required.
 *
 * Env vars (set in Railway → Variables):
 *   ADMIN_PASSWORD – shared staff password for /admin   (required in prod)
 *   GITHUB_TOKEN   – PAT with contents read/write on the repo
 *   GITHUB_REPO    – default mimi-bvr4/Harding-Kindergarten
 *   GITHUB_BRANCH  – default main
 *   API_KEY        – legacy key for the Gmail Apps Script (still works)
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const github = require('./lib/github-sync');
const siteAuth = require('./lib/site-auth');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'dev-key-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'GoHawks2026';

const DATA_FILE = path.join(__dirname, 'public', 'data', 'dashboard-data.json');
const DOCS_DIR = path.join(__dirname, 'public', 'docs');

// Railway terminates TLS in front of us — needed so Secure cookies are set.
app.set('trust proxy', 1);

// CORS is same-origin only now: the site is private, so no other origin may
// read it with credentials.
app.use(cors({ origin: false }));
app.use(express.json({ limit: '2mb' }));

// Search engines must never index a private school dashboard.
app.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
});
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

// ==== THE GATE — every line below this is password-protected ====
app.use(siteAuth.gate);

app.use(express.static('public'));

if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

// ==================== DATA HELPERS ====================

function readData() {
    let data = {};
    try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (_) {}
    // Ensure newer fields always exist
    if (!Array.isArray(data.documents)) data.documents = [];
    if (!Array.isArray(data.schoolLinks)) data.schoolLinks = [];
    if (typeof data.announcement !== 'string') data.announcement = '';
    if (!Array.isArray(data.classrooms)) data.classrooms = [];
    if (!data.weeklyEmail) data.weeklyEmail = {};
    return data;
}

function writeData(data, commitMessage) {
    data.lastUpdated = new Date().toISOString();
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(DATA_FILE, json);
    // Mirror to GitHub in the background (queued; never blocks the response)
    github.commitData(json, commitMessage);
    return data.lastUpdated;
}

// ==================== ADMIN SESSIONS ====================

const sessions = new Map(); // token -> expiresAt (ms)
const SESSION_TTL = 1000 * 60 * 60 * 24 * 60; // 60 days
const loginAttempts = new Map(); // ip -> { count, resetAt }

function issueToken() {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL);
    return token;
}

function validToken(token) {
    if (!token || !sessions.has(token)) return false;
    if (Date.now() > sessions.get(token)) { sessions.delete(token); return false; }
    return true;
}

function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (validToken(token)) return next();
    // Legacy: allow the Gmail Apps Script key as well
    if (req.headers['x-api-key'] === API_KEY) return next();
    res.status(401).json({ error: 'Please sign in again.' });
}

// The site gate trusts an admin token only if it is a real, live one.
siteAuth.setAdminTokenValidator(validToken);

// ==================== SITE-WIDE SIGN IN ====================

app.get(['/login', '/login.html'], (req, res) => {
    // Already signed in? Don't make them type it again.
    if (siteAuth.roleFromRequest(req)) return res.redirect(302, '/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
    if (now > attempts.resetAt) { attempts.count = 0; attempts.resetAt = now + 15 * 60 * 1000; }
    if (attempts.count >= 10) {
        return res.status(429).json({ error: 'Too many tries. Please wait 15 minutes and try again.' });
    }

    const role = siteAuth.roleFromPassword(String(req.body?.password || ''));
    if (!role) {
        attempts.count++;
        loginAttempts.set(ip, attempts);
        return res.status(401).json({ error: 'That password isn\'t right. Please try again.' });
    }
    loginAttempts.delete(ip);

    siteAuth.setSessionCookie(res, role, req.secure || req.headers['x-forwarded-proto'] === 'https');

    // Staff who used the admin password are signed into /admin at the same time.
    res.json({ ok: true, role, adminToken: role === 'admin' ? issueToken() : undefined });
});

app.post('/api/logout', (req, res) => {
    siteAuth.clearSessionCookie(res);
    sessions.delete(req.headers['x-admin-token']);
    res.json({ ok: true });
});

// ==================== PUBLIC API ====================

app.get('/api/data', (req, res) => {
    try { res.json(readData()); }
    catch (err) { res.status(500).json({ error: 'Failed to read dashboard data' }); }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        version: '5.0.0',
        auth: {
            siteGate: true,
            sitePasswordSet: !siteAuth.usingDefaultSitePassword(),
            adminPasswordSet: !siteAuth.usingDefaultAdminPassword()
        },
        github: { configured: github.configured(), ...github.status }
    });
});

// ==================== ADMIN: AUTH ====================

app.post('/api/admin/login', (req, res) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
    if (now > attempts.resetAt) { attempts.count = 0; attempts.resetAt = now + 15 * 60 * 1000; }
    if (attempts.count >= 10) {
        return res.status(429).json({ error: 'Too many tries. Please wait 15 minutes and try again.' });
    }

    const supplied = String(req.body?.password || '');
    const ok = supplied.length === ADMIN_PASSWORD.length &&
        crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(ADMIN_PASSWORD));

    if (!ok) {
        attempts.count++;
        loginAttempts.set(ip, attempts);
        return res.status(401).json({ error: 'That password isn\'t right. Please try again.' });
    }
    loginAttempts.delete(ip);
    res.json({ token: issueToken() });
});

app.get('/api/admin/session', (req, res) => {
    res.json({ valid: validToken(req.headers['x-admin-token']) });
});

app.post('/api/admin/logout', (req, res) => {
    sessions.delete(req.headers['x-admin-token']);
    res.json({ success: true });
});

// ==================== ADMIN: CONTENT UPDATES ====================

/**
 * One endpoint, explicit actions — the admin page only ever changes the
 * specific fields it's editing, so nothing else can be clobbered.
 */
app.post('/api/admin/update', requireAdmin, (req, res) => {
    const { action } = req.body || {};
    try {
        const data = readData();
        let message = 'Dashboard update (admin page)';

        if (action === 'classroom-note') {
            const c = data.classrooms.find(x => x.id === req.body.classroomId);
            if (!c) return res.status(404).json({ error: 'Classroom not found' });
            c.weeklyExcerpt = String(req.body.note || '').slice(0, 8000);
            message = `Update weekly note: ${c.label}`;

        } else if (action === 'teacher-info') {
            const c = data.classrooms.find(x => x.id === req.body.classroomId);
            if (!c) return res.status(404).json({ error: 'Classroom not found' });
            const t = req.body.teacher || {};
            c.teacher = {
                name: String(t.name || '').slice(0, 120),
                email: String(t.email || '').slice(0, 160),
                room: String(t.room || '').slice(0, 40)
            };
            message = `Update teacher info: ${c.label}`;

        } else if (action === 'classroom-links') {
            const c = data.classrooms.find(x => x.id === req.body.classroomId);
            if (!c) return res.status(404).json({ error: 'Classroom not found' });
            c.resources = sanitizeLinks(req.body.links);
            message = `Update links: ${c.label}`;

        } else if (action === 'school-links') {
            data.schoolLinks = sanitizeLinks(req.body.links);
            message = 'Update school-wide links';

        } else if (action === 'announcement') {
            data.announcement = String(req.body.text || '').slice(0, 1000);
            message = data.announcement ? 'Post announcement' : 'Clear announcement';

        } else if (action === 'document-label') {
            const d = data.documents.find(x => x.id === req.body.id);
            if (!d) return res.status(404).json({ error: 'Document not found' });
            d.label = String(req.body.label || d.label).slice(0, 200);
            message = `Rename document: ${d.label}`;

        } else {
            return res.status(400).json({ error: 'Unknown action' });
        }

        const lastUpdated = writeData(data, message);
        res.json({ success: true, lastUpdated, data });
    } catch (err) {
        console.error('admin/update failed:', err);
        res.status(500).json({ error: 'Could not save. Please try again.' });
    }
});

function sanitizeLinks(links) {
    if (!Array.isArray(links)) return [];
    return links.slice(0, 30).map(l => ({
        label: String(l.label || '').slice(0, 120),
        url: sanitizeUrl(String(l.url || '')),
        icon: String(l.icon || 'fa-link').slice(0, 60)
    })).filter(l => l.label);
}

function sanitizeUrl(url) {
    url = url.trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); return url; } catch (_) { return ''; }
}

// ==================== ADMIN: DOCUMENT UPLOADS ====================

const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt']);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 } // 15 MB
});

app.post('/api/admin/upload', requireAdmin, upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file received.' });

        const ext = path.extname(req.file.originalname).toLowerCase();
        if (!ALLOWED_EXT.has(ext)) {
            return res.status(400).json({ error: `Sorry, ${ext || 'that'} files aren't supported. Try a PDF, Word doc, or photo.` });
        }

        const base = path.basename(req.file.originalname, ext)
            .replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'document';
        const filename = `${Date.now()}-${base}${ext}`;

        fs.writeFileSync(path.join(DOCS_DIR, filename), req.file.buffer);

        const data = readData();
        const doc = {
            id: crypto.randomBytes(8).toString('hex'),
            label: String(req.body.label || base).slice(0, 200),
            file: filename,
            url: `/docs/${filename}`,
            audience: String(req.body.audience || 'school'),
            type: ext.replace('.', ''),
            uploadedAt: new Date().toISOString()
        };
        data.documents.unshift(doc);

        github.commitDoc(filename, req.file.buffer, `Upload document: ${doc.label}`);
        const lastUpdated = writeData(data, `Add document: ${doc.label}`);

        res.json({ success: true, document: doc, lastUpdated, data });
    } catch (err) {
        console.error('upload failed:', err);
        res.status(500).json({ error: 'Upload failed. Please try again.' });
    }
});

app.post('/api/admin/delete-document', requireAdmin, (req, res) => {
    try {
        const data = readData();
        const idx = data.documents.findIndex(d => d.id === req.body.id);
        if (idx === -1) return res.status(404).json({ error: 'Document not found' });

        const [doc] = data.documents.splice(idx, 1);
        try { fs.unlinkSync(path.join(DOCS_DIR, doc.file)); } catch (_) {}
        github.removeDoc(doc.file, `Remove document: ${doc.label}`);

        const lastUpdated = writeData(data, `Remove document: ${doc.label}`);
        res.json({ success: true, lastUpdated, data });
    } catch (err) {
        res.status(500).json({ error: 'Could not delete. Please try again.' });
    }
});

// ==================== LEGACY: Gmail Apps Script ====================

app.post('/api/data', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    try {
        const incoming = req.body || {};
        const merged = readData();

        for (const k of Object.keys(incoming)) {
            if (k === 'classroomExcerpts') continue;
            if (k === 'weeklyEmail' && merged.weeklyEmail) {
                merged.weeklyEmail = { ...merged.weeklyEmail, ...incoming.weeklyEmail };
            } else {
                merged[k] = incoming[k];
            }
        }
        if (incoming.classroomExcerpts && typeof incoming.classroomExcerpts === 'object') {
            for (const c of merged.classrooms) {
                if (Object.prototype.hasOwnProperty.call(incoming.classroomExcerpts, c.id)) {
                    c.weeklyExcerpt = incoming.classroomExcerpts[c.id] || '';
                }
            }
        }
        const lastUpdated = writeData(merged, 'Weekly email sync (Apps Script)');
        res.json({ success: true, lastUpdated });
    } catch (err) {
        console.error('POST /api/data failed:', err);
        res.status(500).json({ error: 'Failed to write dashboard data' });
    }
});

// ==================== PAGES ====================

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// ==================== BOOT: PULL LATEST FROM GITHUB ====================

async function bootSync() {
    if (!github.configured()) {
        console.log('[boot] GITHUB_TOKEN not set — running without GitHub sync.');
        return;
    }
    try {
        const remote = await github.pullData();
        if (remote && remote.classrooms?.length) {
            const local = readData();

            // GitHub owns CONTENT (what Apps Script and the admin page publish).
            // The deploy owns STRUCTURE (team roster, tabs, copy, links, layout).
            //
            // This used to be a wholesale overwrite, which silently reverted every
            // structural change on the next restart — a deploy would look successful
            // and then vanish. Merge instead: take content from GitHub, keep
            // structure from the code that was just deployed.
            const CONTENT_KEYS = [
                'weeklyEmail', 'announcement', 'classrooms', 'documents',
                'schoolLinks', 'keyDates', 'lastUpdated'
            ];

            const merged = { ...local };
            for (const k of CONTENT_KEYS) {
                if (Object.prototype.hasOwnProperty.call(remote, k)) merged[k] = remote[k];
            }

            fs.writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2));
            console.log('[boot] Merged GitHub content into the deployed structure.');
        }
        // Restore any documents missing locally
        const docs = await github.listDocs();
        for (const d of docs) {
            const localPath = path.join(DOCS_DIR, d.name);
            if (!fs.existsSync(localPath)) {
                const buf = await github.downloadDoc(d.path);
                if (buf) {
                    fs.writeFileSync(localPath, buf);
                    console.log(`[boot] Restored document from GitHub: ${d.name}`);
                }
            }
        }
    } catch (err) {
        console.error('[boot] GitHub sync failed (continuing anyway):', err.message);
    }
}

app.listen(PORT, () => {
    console.log(`Harding Dashboard v5 running on port ${PORT} — whole site is password-gated`);
    if (siteAuth.usingDefaultSitePassword()) {
        console.warn('[SECURITY] SITE_PASSWORD is not set — the built-in fallback is in use. Set it in Railway → Variables.');
    }
    if (siteAuth.usingDefaultAdminPassword()) {
        console.warn('[SECURITY] ADMIN_PASSWORD is not set — the built-in fallback is in use. Set it in Railway → Variables.');
    }
    bootSync();
});
