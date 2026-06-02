const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'dev-key-change-me';
const DATA_FILE = path.join(__dirname, 'public', 'data', 'dashboard-data.json');
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

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
// This replaces the "download .js → paste into GitHub" workflow
app.post('/api/data', (req, res) => {
    const authKey = req.headers['x-api-key'];
    if (authKey !== API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    try {
        const newData = req.body;
        newData.lastUpdated = new Date().toISOString();

        fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2));
        res.json({ success: true, lastUpdated: newData.lastUpdated });
    } catch (err) {
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Harding Dashboard running on port ${PORT}`);
});
