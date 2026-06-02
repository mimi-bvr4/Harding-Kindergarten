console.log('Server starting...');
console.log('Node version:', process.version);
console.log('CWD:', process.cwd());
console.log('__dirname:', __dirname);

const express = require('express');
console.log('Express loaded');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
console.log('PORT:', PORT);
const API_KEY = process.env.API_KEY || 'dev-key-change-me';
const DATA_FILE = path.join(__dirname, 'public', 'data', 'dashboard-data.json');

// Safely create directories (Railway filesystem may be read-only)
try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
} catch (e) {
    console.warn('Could not create data dir (read-only filesystem):', e.message);
}

// Middleware
app.use(cors());
app.use(express.json());
const publicDir = path.join(__dirname, 'public');
console.log('Static dir:', publicDir, 'exists:', fs.existsSync(publicDir));
console.log('index.html exists:', fs.existsSync(path.join(publicDir, 'index.html')));
console.log('data file exists:', fs.existsSync(DATA_FILE));
app.use(express.static(publicDir));

// ------- API ROUTES -------

// GET current dashboard data
app.get('/api/data', (req, res) => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            res.json(data);
        } else {
            res.json({
                lastUpdated: null,
                weeklyEmail: { week: '', compassUrl: '', emailUrl: '', kindergartenExcerpt: '', highlights: [], importantDates: [] }
            });
        }
    } catch (err) {
        console.error('Data read error:', err.message);
        res.status(500).json({ error: 'Failed to read dashboard data' });
    }
});

// POST update dashboard data (called by Apps Script or admin dashboard)
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
        console.error('Data write error:', err.message);
        res.status(500).json({ error: 'Failed to write dashboard data' });
    }
});

// GET SMS queue (future: suggested notifications)
app.get('/api/sms/queue', (req, res) => {
    res.json({ pending: [], sent: [] });
});

// POST add SMS suggestion (future: called by email scanner)
app.post('/api/sms/suggest', (req, res) => {
    const authKey = req.headers['x-api-key'];
    if (authKey !== API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    // Placeholder — will be backed by database later
    res.json({ success: true, message: 'SMS queue not yet implemented' });
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
