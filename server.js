const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'dev-key-change-me';
const DATA_FILE = path.join(__dirname, 'public', 'data', 'dashboard-data.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ------- API ROUTES -------

// GET current dashboard data
app.get('/api/data', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read dashboard data' });
    }
});

// POST update dashboard data (called by Apps Script or admin dashboard)
// MERGE semantics so the classroom config in dashboard-data.json isn't wiped:
//   - top-level fields in body overwrite the existing top-level fields
//   - body.classroomExcerpts = { "<classroomId>": "excerpt text" } is folded
//     into existing classrooms[i].weeklyExcerpt
//   - body.classrooms (if supplied) replaces the entire array (rare, full sync)
app.post('/api/data', (req, res) => {
    const authKey = req.headers['x-api-key'];
    if (authKey !== API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    try {
        const incoming = req.body || {};
        let current = {};
        try { current = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (_) {}

        const merged = { ...current };

        // Fold any top-level keys (excluding classroomExcerpts, which we route below)
        for (const k of Object.keys(incoming)) {
            if (k === 'classroomExcerpts') continue;
            if (k === 'weeklyEmail' && current.weeklyEmail) {
                merged.weeklyEmail = { ...current.weeklyEmail, ...incoming.weeklyEmail };
            } else {
                merged[k] = incoming[k];
            }
        }

        // Apply per-classroom excerpts to classrooms[i].weeklyExcerpt
        if (incoming.classroomExcerpts && typeof incoming.classroomExcerpts === 'object') {
            const classrooms = Array.isArray(merged.classrooms) ? merged.classrooms : [];
            for (const c of classrooms) {
                if (Object.prototype.hasOwnProperty.call(incoming.classroomExcerpts, c.id)) {
                    c.weeklyExcerpt = incoming.classroomExcerpts[c.id] || '';
                }
            }
            merged.classrooms = classrooms;
        }

        merged.lastUpdated = new Date().toISOString();
        fs.writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2));
        res.json({ success: true, lastUpdated: merged.lastUpdated });
    } catch (err) {
        console.error('POST /api/data failed:', err);
        res.status(500).json({ error: 'Failed to write dashboard data' });
    }
});

// GET SMS queue (future: suggested notifications)
app.get('/api/sms/queue', (req, res) => {
    const queueFile = path.join(__dirname, 'data', 'sms-queue.json');
    try {
        if (fs.existsSync(queueFile)) {
            const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
            res.json(queue);
        } else {
            res.json({ pending: [], sent: [] });
        }
    } catch (err) {
        res.json({ pending: [], sent: [] });
    }
});

// POST add SMS suggestion (future: called by email scanner)
app.post('/api/sms/suggest', (req, res) => {
    const authKey = req.headers['x-api-key'];
    if (authKey !== API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    const queueDir = path.join(__dirname, 'data');
    const queueFile = path.join(queueDir, 'sms-queue.json');

    try {
        if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir, { recursive: true });

        let queue = { pending: [], sent: [] };
        if (fs.existsSync(queueFile)) {
            queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
        }

        const suggestion = {
            id: Date.now().toString(),
            message: req.body.message,
            suggestedSendTime: req.body.suggestedSendTime || null,
            sourceEmail: req.body.sourceEmail || null,
            priority: req.body.priority || 'standard',
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        queue.pending.push(suggestion);
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));

        res.json({ success: true, suggestion });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add suggestion' });
    }
});

// Health check (Railway uses this)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// Catch-all: serve index.html for any non-API route
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

app.listen(PORT, () => {
    console.log(`Harding Dashboard running on port ${PORT}`);
});
