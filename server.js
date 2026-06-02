const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'dev-key-change-me';
const DATA_FILE = path.join(__dirname, 'public', 'data', 'dashboard-data.json');
const SUGGESTIONS_FILE = path.join(__dirname, 'public', 'data', 'suggestions.json');

// Safely create directories
try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
} catch (e) {
    console.warn('Could not create data dir:', e.message);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== LIVE DATA (what parents see) ====================

app.get('/api/data', (req, res) => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            res.json(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
        } else {
            res.json({
                lastUpdated: null,
                weeklyEmail: { week: '', compassUrl: '', emailUrl: '', kindergartenExcerpt: '', highlights: [], importantDates: [] }
            });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read data' });
    }
});

// POST publish approved data (admin hits Publish)
app.post('/api/data', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });

    try {
        const data = req.body;
        data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        res.json({ success: true, lastUpdated: data.lastUpdated });
    } catch (err) {
        res.status(500).json({ error: 'Failed to write data' });
    }
});

// ==================== SUGGESTIONS (pending review) ====================

// GET pending suggestions
app.get('/api/suggestions', (req, res) => {
    try {
        if (fs.existsSync(SUGGESTIONS_FILE)) {
            res.json(JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8')));
        } else {
            res.json({ suggestions: [], scannedAt: null });
        }
    } catch (err) {
        res.json({ suggestions: [], scannedAt: null });
    }
});

// POST new suggestions (Claude pushes extracted email content here)
app.post('/api/suggestions', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });

    try {
        const incoming = req.body;
        incoming.scannedAt = new Date().toISOString();

        // Tag each suggestion with an ID and default status
        if (incoming.suggestions) {
            incoming.suggestions = incoming.suggestions.map((s, i) => ({
                id: Date.now() + '_' + i,
                ...s,
                approved: true  // default checked, user unchecks what they don't want
            }));
        }

        fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(incoming, null, 2));
        res.json({ success: true, count: incoming.suggestions?.length || 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save suggestions' });
    }
});

// DELETE clear suggestions after publishing
app.delete('/api/suggestions', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });

    try {
        if (fs.existsSync(SUGGESTIONS_FILE)) fs.unlinkSync(SUGGESTIONS_FILE);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: true }); // fine if already gone
    }
});

// ==================== SMS QUEUE (future) ====================

app.get('/api/sms/queue', (req, res) => {
    res.json({ pending: [], sent: [] });
});

app.post('/api/sms/suggest', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });
    res.json({ success: true, message: 'SMS queue not yet implemented' });
});

// ==================== CALENDAR PROXY ====================
// Fetches the school iCal feed server-side — no CORS proxy needed

const ICAL_URL = 'https://hardingacademy.myschoolapp.com/podium/feed/iCal.aspx?z=96wT5QnMrJrphQP5BInbTmAAJCsRcQpy%2bmDKcAacSR8eeFymiEdCFAWuYOhCPhXy4XjpFPFcjomN3uHn%2bWimYA%3d%3d';

let calendarCache = { data: null, fetchedAt: 0 };
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

app.get('/api/calendar', async (req, res) => {
    const now = Date.now();

    // Return cached if fresh
    if (calendarCache.data && (now - calendarCache.fetchedAt) < CACHE_TTL) {
        return res.type('text/calendar').send(calendarCache.data);
    }

    try {
        const response = await fetch(ICAL_URL);
        if (!response.ok) throw new Error('Feed returned ' + response.status);

        const icsText = await response.text();
        calendarCache = { data: icsText, fetchedAt: now };
        res.type('text/calendar').send(icsText);
    } catch (err) {
        console.error('Calendar fetch error:', err.message);
        // Return stale cache if available
        if (calendarCache.data) {
            return res.type('text/calendar').send(calendarCache.data);
        }
        res.status(502).json({ error: 'Failed to fetch calendar feed' });
    }
});

// ==================== HEALTH ====================

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// Catch-all
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return;
    if (path.extname(req.path)) return res.status(404).send('Not found');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Harding Dashboard running on port ${PORT}`);
});
