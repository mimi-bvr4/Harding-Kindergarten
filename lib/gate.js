/**
 * Two doors, two passwords, one cookie.
 *
 *   STAFF_PASSWORD    -> "staff"    types numbers, edits the roster
 *   DISPLAY_PASSWORD  -> "display"  sees the gym screen and nothing else
 *
 * The split is the point: a screen left running in a room full of children
 * holds a credential that cannot send anyone anywhere.
 */
const crypto = require('crypto');

const STAFF   = process.env.STAFF_PASSWORD   || 'dev-staff';
const DISPLAY = process.env.DISPLAY_PASSWORD || 'dev-display';
const COOKIE  = 'hold_session';
const TTL_MS  = 1000 * 60 * 60 * 24 * 30;

// Changing either password invalidates every existing session. That is
// deliberate: it is the revoke button.
const SECRET = crypto.createHash('sha256').update(`${STAFF}::${DISPLAY}`).digest();

const OPEN = new Set(['/login', '/login.html', '/api/login', '/healthz', '/favicon.ico']);

function sign(v) { return crypto.createHmac('sha256', SECRET).update(v).digest('hex').slice(0, 32); }
function safeEqual(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function makeCookie(role) {
    const payload = `${role}.${Date.now() + TTL_MS}`;
    return `${payload}.${sign(payload)}`;
}

function roleFromRequest(req) {
    const raw = (req.headers.cookie || '')
        .split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
    if (!raw) return null;
    const parts = raw.slice(COOKIE.length + 1).split('.');
    if (parts.length !== 3) return null;
    const [role, exp, mac] = parts;
    if (!safeEqual(mac, sign(`${role}.${exp}`))) return null;
    if (Date.now() > Number(exp)) return null;
    return role === 'staff' || role === 'display' ? role : null;
}

function roleFromPassword(pw) {
    if (safeEqual(pw, STAFF))   return 'staff';
    if (safeEqual(pw, DISPLAY)) return 'display';
    return null;
}

function setCookie(res, role, secure) {
    res.setHeader('Set-Cookie', [
        `${COOKIE}=${makeCookie(role)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
        `Max-Age=${Math.floor(TTL_MS / 1000)}`, secure ? 'Secure' : ''
    ].filter(Boolean).join('; '));
}

function gate(req, res, next) {
    if (OPEN.has(req.path)) return next();
    const role = roleFromRequest(req);
    if (role) { req.role = role; return next(); }
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not signed in.' });
    return res.redirect(302, '/login?next=' + encodeURIComponent(req.originalUrl || '/'));
}

function requireStaff(req, res, next) {
    if (req.role === 'staff') return next();
    res.status(403).json({ error: 'Staff only.' });
}

module.exports = { gate, requireStaff, roleFromRequest, roleFromPassword, setCookie,
                   usingDefaults: () => STAFF === 'dev-staff' || DISPLAY === 'dev-display' };
