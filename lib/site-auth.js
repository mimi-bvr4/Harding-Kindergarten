/**
 * site-auth.js — whole-site password gate
 *
 * Nothing on this site is public. Every page, document, image and API route
 * sits behind a shared password, because the dashboard carries school and
 * student information.
 *
 * Two passwords, two roles:
 *   SITE_PASSWORD   → role "parent" — can view everything
 *   ADMIN_PASSWORD  → role "admin"  — can view everything AND use /admin
 *
 * Sessions are a signed cookie, not server memory, so a Railway redeploy
 * does not sign every parent out. The signing secret is derived from the
 * passwords themselves, which means changing a password instantly
 * invalidates every session that used it — that is the intended behaviour.
 */

const crypto = require('crypto');

const SITE_PASSWORD = process.env.SITE_PASSWORD || 'HardingHawks2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'GoHawks2026';
const API_KEY = process.env.API_KEY || 'dev-key-change-me';

const COOKIE = 'hd_auth';
const TTL_MS = 1000 * 60 * 60 * 24 * 60; // 60 days

const SECRET = process.env.SESSION_SECRET ||
    crypto.createHash('sha256').update(`${SITE_PASSWORD}::${ADMIN_PASSWORD}`).digest('hex');

// Paths reachable without a password: the login page itself and what it needs
// to render, plus the health check (used by Railway and by deploy verification).
const OPEN_PATHS = new Set([
    '/login', '/login.html', '/api/login', '/api/logout', '/api/health',
    '/favicon.ico', '/img/favicon.png', '/img/apple-touch-icon.png',
    '/img/hawk-head.png', '/img/hawk-head-white.png', '/img/hawk-body.png'
]);

// ---------- primitives ----------

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function sign(payload) {
    return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

function makeCookieValue(role) {
    const payload = `${role}.${Date.now() + TTL_MS}`;
    return `${payload}.${sign(payload)}`;
}

function readCookie(req, name) {
    const raw = req.headers.cookie;
    if (!raw) return '';
    for (const part of raw.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        if (part.slice(0, idx).trim() === name) {
            return decodeURIComponent(part.slice(idx + 1).trim());
        }
    }
    return '';
}

/** Returns 'admin' | 'parent' | null */
function roleFromRequest(req) {
    const value = readCookie(req, COOKIE);
    if (!value) return null;
    const parts = value.split('.');
    if (parts.length !== 3) return null;
    const [role, exp, mac] = parts;
    if (!safeEqual(mac, sign(`${role}.${exp}`))) return null;
    if (Date.now() > Number(exp)) return null;
    return role === 'admin' ? 'admin' : 'parent';
}

/** Which password was typed, if any. */
function roleFromPassword(supplied) {
    if (safeEqual(supplied, ADMIN_PASSWORD)) return 'admin';
    if (safeEqual(supplied, SITE_PASSWORD)) return 'parent';
    return null;
}

function setSessionCookie(res, role, isSecure) {
    const bits = [
        `${COOKIE}=${makeCookieValue(role)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${Math.floor(TTL_MS / 1000)}`
    ];
    if (isSecure) bits.push('Secure');
    res.setHeader('Set-Cookie', bits.join('; '));
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ---------- the gate ----------

// server.js owns the admin session table, so it injects the validator here.
// Until it does, an x-admin-token header is worth nothing.
let validateAdminToken = () => false;
function setAdminTokenValidator(fn) { validateAdminToken = fn; }

/**
 * Mount this BEFORE express.static and before every route.
 * Machine callers (the Gmail Apps Script, the admin page's own token) pass
 * through on their existing credentials so nothing that works today breaks.
 */
function gate(req, res, next) {
    const p = req.path;

    if (OPEN_PATHS.has(p)) return next();

    // Existing machine credentials keep working, untouched.
    if (req.headers['x-api-key'] && safeEqual(req.headers['x-api-key'], API_KEY)) return next();
    if (validateAdminToken(req.headers['x-admin-token'])) return next();

    const role = roleFromRequest(req);
    if (role) {
        req.siteRole = role;
        return next();
    }

    if (p.startsWith('/api/')) {
        return res.status(401).json({ error: 'Not signed in.' });
    }
    const next_ = encodeURIComponent(req.originalUrl || '/');
    return res.redirect(302, `/login?next=${next_}`);
}

module.exports = {
    gate,
    setAdminTokenValidator,
    roleFromRequest,
    roleFromPassword,
    setSessionCookie,
    clearSessionCookie,
    usingDefaultSitePassword: () => !process.env.SITE_PASSWORD,
    usingDefaultAdminPassword: () => !process.env.ADMIN_PASSWORD
};
