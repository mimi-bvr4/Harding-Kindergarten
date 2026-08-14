/**
 * GitHub sync — keeps dashboard data + uploaded documents mirrored in the
 * GitHub repo so nothing is lost when Railway redeploys, and so the repo
 * remains the permanent record of every change.
 *
 * Repo layout used:
 *   app-data/dashboard-data.json   ← live dashboard content
 *   app-data/docs/<files>          ← uploaded documents
 *
 * Requires env vars on Railway:
 *   GITHUB_TOKEN   – personal access token with repo contents read/write
 *   GITHUB_REPO    – owner/repo            (default: mimi-bvr4/Harding-Kindergarten)
 *   GITHUB_BRANCH  – branch to commit to   (default: main)
 */

const REPO   = process.env.GITHUB_REPO   || 'mimi-bvr4/Harding-Kindergarten';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN  = process.env.GITHUB_TOKEN  || '';

const DATA_PATH = 'app-data/dashboard-data.json';
const DOCS_PATH = 'app-data/docs';

const status = { configured: !!TOKEN, lastSync: null, lastError: null };

// All writes go through a queue so two saves can't race on file SHAs.
let queue = Promise.resolve();
function enqueue(fn) {
    queue = queue.then(fn).catch(err => {
        status.lastError = String(err.message || err);
        console.error('[github-sync]', err.message || err);
    });
    return queue;
}

async function api(method, urlPath, body) {
    const resp = await fetch(`https://api.github.com${urlPath}`, {
        method,
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (resp.status === 404) return null;
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`GitHub API ${method} ${urlPath} → ${resp.status} ${text.slice(0, 200)}`);
    }
    return resp.json();
}

async function getFile(repoPath) {
    const json = await api('GET', `/repos/${REPO}/contents/${encodeURI(repoPath)}?ref=${BRANCH}`);
    if (!json || Array.isArray(json)) return null;
    return {
        sha: json.sha,
        buffer: Buffer.from(json.content || '', 'base64')
    };
}

async function putFile(repoPath, buffer, message) {
    const existing = await getFile(repoPath).catch(() => null);
    await api('PUT', `/repos/${REPO}/contents/${encodeURI(repoPath)}`, {
        message,
        branch: BRANCH,
        content: buffer.toString('base64'),
        ...(existing ? { sha: existing.sha } : {})
    });
    status.lastSync = new Date().toISOString();
    status.lastError = null;
}

async function removeFile(repoPath, message) {
    const existing = await getFile(repoPath).catch(() => null);
    if (!existing) return;
    await api('DELETE', `/repos/${REPO}/contents/${encodeURI(repoPath)}`, {
        message, branch: BRANCH, sha: existing.sha
    });
    status.lastSync = new Date().toISOString();
}

// ---------- public API ----------

function configured() { return !!TOKEN; }

function commitData(jsonString, message) {
    if (!TOKEN) return Promise.resolve();
    return enqueue(() => putFile(DATA_PATH, Buffer.from(jsonString, 'utf8'),
        message || 'Dashboard update (admin page)'));
}

function commitDoc(filename, buffer, message) {
    if (!TOKEN) return Promise.resolve();
    return enqueue(() => putFile(`${DOCS_PATH}/${filename}`, buffer,
        message || `Upload document: ${filename}`));
}

function removeDoc(filename, message) {
    if (!TOKEN) return Promise.resolve();
    return enqueue(() => removeFile(`${DOCS_PATH}/${filename}`,
        message || `Remove document: ${filename}`));
}

/** Pull latest data file from the repo (returns parsed object or null). */
async function pullData() {
    if (!TOKEN) return null;
    try {
        const file = await getFile(DATA_PATH);
        if (!file) return null;
        status.lastSync = new Date().toISOString();
        return JSON.parse(file.buffer.toString('utf8'));
    } catch (err) {
        status.lastError = String(err.message || err);
        console.error('[github-sync] pullData failed:', err.message);
        return null;
    }
}

/** List docs stored in the repo: [{name, download}] */
async function listDocs() {
    if (!TOKEN) return [];
    try {
        const json = await api('GET', `/repos/${REPO}/contents/${DOCS_PATH}?ref=${BRANCH}`);
        if (!Array.isArray(json)) return [];
        return json.filter(f => f.type === 'file').map(f => ({ name: f.name, path: f.path }));
    } catch (err) {
        return [];
    }
}

async function downloadDoc(repoPath) {
    const file = await getFile(repoPath);
    return file ? file.buffer : null;
}

module.exports = {
    configured, status,
    commitData, commitDoc, removeDoc,
    pullData, listDocs, downloadDoc
};
