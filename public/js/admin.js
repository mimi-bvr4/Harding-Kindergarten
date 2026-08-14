/**
 * Harding Staff Admin — plain-language, big-button editor.
 * No tech knowledge needed: pick what to update, type, press Save.
 */

const ADMIN = {
    token: localStorage.getItem('harding-admin-token') || '',
    data: null,
    view: { name: 'home' }
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ==================== API ====================

async function api(path, options = {}) {
    const resp = await fetch(path, {
        ...options,
        headers: {
            ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
            'x-admin-token': ADMIN.token,
            ...(options.headers || {})
        }
    });
    const json = await resp.json().catch(() => ({}));
    if (resp.status === 401) { showLogin(); throw new Error(json.error || 'Please sign in again.'); }
    if (!resp.ok) throw new Error(json.error || 'Something went wrong. Please try again.');
    return json;
}

async function saveUpdate(body, successMsg) {
    const json = await api('/api/admin/update', { method: 'POST', body: JSON.stringify(body) });
    if (json.data) ADMIN.data = json.data;
    toast(successMsg || 'Saved! Parents can see this now.');
    return json;
}

// ==================== TOAST ====================

let toastTimer;
function toast(msg, isError = false) {
    const el = $('toast');
    el.innerHTML = `<i class="fas ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> ${esc(msg)}`;
    el.classList.toggle('error', isError);
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 4200);
}

// ==================== LOGIN ====================

function showLogin() {
    $('loginScreen').classList.remove('hidden');
    $('adminApp').classList.add('hidden');
    setTimeout(() => $('passwordInput')?.focus(), 50);
}

async function tryLogin() {
    const btn = $('loginBtn');
    const err = $('loginError');
    err.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking…';
    try {
        const resp = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: $('passwordInput').value })
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Sign in failed.');
        ADMIN.token = json.token;
        localStorage.setItem('harding-admin-token', ADMIN.token);
        await enterApp();
    } catch (e) {
        err.textContent = e.message;
        err.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i> Sign In';
    }
}

async function enterApp() {
    ADMIN.data = await (await fetch('/api/data')).json();
    $('loginScreen').classList.add('hidden');
    $('adminApp').classList.remove('hidden');
    go({ name: 'home' });
}

// ==================== NAVIGATION ====================

function go(view) {
    ADMIN.view = view;
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
}

function render() {
    const root = $('adminRoot');
    const v = ADMIN.view;
    if (v.name === 'home') root.innerHTML = viewHome();
    else if (v.name === 'notes-pick') root.innerHTML = viewPickClassroom('notes', 'Whose classroom note do you want to update?');
    else if (v.name === 'notes-edit') root.innerHTML = viewNoteEditor(v.classroomId);
    else if (v.name === 'links-pick') root.innerHTML = viewPickClassroom('links', 'Which links do you want to update?', true);
    else if (v.name === 'links-edit') root.innerHTML = viewLinks(v.target);
    else if (v.name === 'docs') root.innerHTML = viewDocs();
    else if (v.name === 'announce') root.innerHTML = viewAnnouncement();
    wireView();
}

// ==================== VIEWS ====================

function viewHome() {
    const first = '';
    return `
    <h1 class="page-title">Hi there! 👋</h1>
    <p class="page-sub">What would you like to update today? Tap one of the boxes below.</p>
    <div class="menu-grid">
        <button class="menu-card" data-go="notes-pick">
            <span class="emoji tint-blue">📝</span>
            <span>
                <h2>Weekly Classroom Notes</h2>
                <p>Write or change the note parents see for each classroom.</p>
            </span>
            <i class="fas fa-chevron-right go"></i>
        </button>
        <button class="menu-card" data-go="docs">
            <span class="emoji tint-gold">📎</span>
            <span>
                <h2>Documents &amp; Forms</h2>
                <p>Upload newsletters, flyers, lunch menus, or forms.</p>
            </span>
            <i class="fas fa-chevron-right go"></i>
        </button>
        <button class="menu-card" data-go="links-pick">
            <span class="emoji tint-green">🔗</span>
            <span>
                <h2>Helpful Links</h2>
                <p>Add or fix the links parents tap, like the dismissal form.</p>
            </span>
            <i class="fas fa-chevron-right go"></i>
        </button>
        <button class="menu-card" data-go="announce">
            <span class="emoji tint-purple">📣</span>
            <span>
                <h2>Announcement Banner</h2>
                <p>Show a short message at the top of the dashboard.</p>
            </span>
            <i class="fas fa-chevron-right go"></i>
        </button>
    </div>
    <div class="help-box">
        <b>How it works:</b> anything you save here shows up on the parent dashboard right away.
        There's nothing to publish or install — just type and press the green Save button.
    </div>`;
}

function viewPickClassroom(mode, title, includeSchool = false) {
    const classrooms = ADMIN.data.classrooms || [];
    const btn = (c) => `
        <button class="class-btn" data-pick="${esc(c.id)}">
            <div class="name">${esc(c.label)}</div>
            <div class="teacher">${esc(c.teacher?.name || 'No teacher name yet')}</div>
        </button>`;
    return `
    <button class="back-link" data-go="home"><i class="fas fa-arrow-left"></i> Back to main menu</button>
    <h1 class="page-title">${esc(title)}</h1>
    <p class="page-sub">Tap a classroom.</p>
    <div class="class-grid">
        ${includeSchool ? `
        <button class="class-btn school-wide" data-pick="__school__">
            <div class="name">🏫 Whole School</div>
            <div class="teacher">Links every family sees on the home page</div>
        </button>` : ''}
        ${classrooms.map(btn).join('')}
    </div>`;
}

function viewNoteEditor(classroomId) {
    const c = ADMIN.data.classrooms.find(x => x.id === classroomId);
    if (!c) return `<p>Classroom not found.</p>`;
    return `
    <button class="back-link" data-go="notes-pick"><i class="fas fa-arrow-left"></i> Pick a different classroom</button>
    <h1 class="page-title">${esc(c.label)}</h1>
    <p class="page-sub">This note appears on the ${esc(c.label)} page that parents see.</p>

    <div class="panel">
        <h3>📝 This Week's Note</h3>
        <p class="hint">Type just like you would in an email. You can paste from a newsletter too.</p>
        <textarea id="noteBox" class="big-textarea"
            placeholder="Example:&#10;&#10;Hello families! This week we are learning about butterflies. Please send a light jacket every day — we go outside after lunch. Library books are due Friday.">${esc(c.weeklyExcerpt || '')}</textarea>
        <div class="save-row">
            <button id="saveNoteBtn" class="btn btn-green btn-big"><i class="fas fa-check"></i> Save Note</button>
            <span class="saved-when">Parents see it as soon as you save.</span>
        </div>
    </div>

    <div class="panel">
        <h3>👩‍🏫 Teacher Info</h3>
        <p class="hint">Shown on the classroom page so parents know who to contact.</p>
        <label class="field-label">Teacher's name</label>
        <input id="tName" class="big-input" value="${esc(c.teacher?.name || '')}" placeholder="Mrs. Smith">
        <label class="field-label" style="margin-top:0.9rem;">Email (optional)</label>
        <input id="tEmail" class="big-input" value="${esc(c.teacher?.email || '')}" placeholder="smith@hardingacademy.org">
        <label class="field-label" style="margin-top:0.9rem;">Room number (optional)</label>
        <input id="tRoom" class="big-input" value="${esc(c.teacher?.room || '')}" placeholder="104">
        <div class="save-row">
            <button id="saveTeacherBtn" class="btn btn-green"><i class="fas fa-check"></i> Save Teacher Info</button>
        </div>
    </div>`;
}

function viewLinks(target) {
    const isSchool = target === '__school__';
    const c = isSchool ? null : ADMIN.data.classrooms.find(x => x.id === target);
    const links = isSchool ? (ADMIN.data.schoolLinks || []) : (c?.resources || []);
    const title = isSchool ? 'Whole School Links' : `${c.label} Links`;

    const row = (l, i) => `
        <div class="link-row">
            <span class="link-icon"><i class="fas ${esc(l.icon || 'fa-link')}"></i></span>
            <span class="link-main">
                <div class="link-label">${esc(l.label)}</div>
                <div class="link-url ${l.url ? '' : 'missing'}">${l.url ? esc(l.url) : 'No web address yet — tap the pencil to add one'}</div>
            </span>
            <button class="icon-btn" data-edit-link="${i}" title="Change this link"><i class="fas fa-pencil"></i></button>
            <button class="icon-btn danger" data-del-link="${i}" title="Remove this link"><i class="fas fa-trash-can"></i></button>
        </div>`;

    return `
    <button class="back-link" data-go="links-pick"><i class="fas fa-arrow-left"></i> Pick something else</button>
    <h1 class="page-title">${esc(title)}</h1>
    <p class="page-sub">${isSchool ? 'These appear on the home page for every family.' : 'These appear on the ' + esc(c.label) + ' page.'}</p>

    <div class="panel">
        <h3>Current links</h3>
        <p class="hint">Tap the pencil ✏️ to change one, or the trash can 🗑️ to remove it.</p>
        <div id="linkList">${links.length ? links.map(row).join('') : '<p class="hint">No links yet — add your first one below!</p>'}</div>
    </div>

    <div class="panel" id="linkFormPanel">
        <h3 id="linkFormTitle">➕ Add a new link</h3>
        <label class="field-label">What should the button say?</label>
        <input id="linkLabel" class="big-input" placeholder="Lunch Menu">
        <label class="field-label" style="margin-top:0.9rem;">Paste the web address here</label>
        <input id="linkUrl" class="big-input" placeholder="https://www.hardingacademy.org/lunch" autocapitalize="off">
        <p class="hint" style="margin-top:0.5rem;">Tip: open the page in your browser, copy the address from the top bar, and paste it here.</p>
        <div class="save-row">
            <button id="saveLinkBtn" class="btn btn-green"><i class="fas fa-check"></i> Save Link</button>
            <button id="cancelLinkBtn" class="btn btn-quiet hidden">Cancel</button>
        </div>
    </div>`;
}

function viewDocs() {
    const docs = ADMIN.data.documents || [];
    const classrooms = ADMIN.data.classrooms || [];
    const audienceName = (a) => a === 'school' ? 'Whole school' : (classrooms.find(c => c.id === a)?.label || a);
    const docIcon = (t) => ({ pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word', xls: 'fa-file-excel', xlsx: 'fa-file-excel', ppt: 'fa-file-powerpoint', pptx: 'fa-file-powerpoint', png: 'fa-file-image', jpg: 'fa-file-image', jpeg: 'fa-file-image', gif: 'fa-file-image', webp: 'fa-file-image' }[t] || 'fa-file');

    const row = (d) => `
        <div class="doc-row">
            <span class="doc-icon"><i class="fas ${docIcon(d.type)}"></i></span>
            <span class="doc-main">
                <div class="doc-label">${esc(d.label)}</div>
                <div class="doc-meta">${esc(audienceName(d.audience))} · added ${new Date(d.uploadedAt).toLocaleDateString()}</div>
            </span>
            <a class="icon-btn" href="${esc(d.url)}" target="_blank" title="Open it"><i class="fas fa-eye"></i></a>
            <button class="icon-btn danger" data-del-doc="${esc(d.id)}" title="Remove it"><i class="fas fa-trash-can"></i></button>
        </div>`;

    return `
    <button class="back-link" data-go="home"><i class="fas fa-arrow-left"></i> Back to main menu</button>
    <h1 class="page-title">Documents &amp; Forms</h1>
    <p class="page-sub">Upload newsletters, flyers, menus, or forms. Parents can tap to open them.</p>

    <div class="panel">
        <h3>⬆️ Add a document</h3>
        <label class="field-label">1. Give it a name parents will understand</label>
        <input id="docLabel" class="big-input" placeholder="October Newsletter">
        <label class="field-label" style="margin-top:0.9rem;">2. Who is it for?</label>
        <select id="docAudience" class="big-select">
            <option value="school">The whole school</option>
            ${classrooms.map(c => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}
        </select>
        <label class="field-label" style="margin-top:0.9rem;">3. Choose the file</label>
        <div id="uploadZone" class="upload-zone">
            <i class="fas fa-cloud-arrow-up"></i>
            <div class="zone-title">Tap here to choose a file</div>
            <div class="zone-sub">PDF, Word, or a photo · up to 15 MB</div>
        </div>
        <input type="file" id="fileInput" class="hidden"
               accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt">
        <div id="uploadStatus"></div>
    </div>

    <div class="panel">
        <h3>📂 Documents already on the dashboard</h3>
        <div id="docList">${docs.length ? docs.map(row).join('') : '<p class="hint">Nothing uploaded yet.</p>'}</div>
    </div>`;
}

function viewAnnouncement() {
    return `
    <button class="back-link" data-go="home"><i class="fas fa-arrow-left"></i> Back to main menu</button>
    <h1 class="page-title">Announcement Banner</h1>
    <p class="page-sub">A short message shown in gold at the very top of the parent dashboard. Great for reminders like early dismissal or picture day.</p>

    <div class="panel">
        <h3>📣 Your announcement</h3>
        <textarea id="announceBox" class="big-textarea" style="min-height:120px;"
            placeholder="Example: Reminder — early dismissal this Friday at 11:30 AM!">${esc(ADMIN.data.announcement || '')}</textarea>
        <div class="save-row">
            <button id="saveAnnounceBtn" class="btn btn-green btn-big"><i class="fas fa-check"></i> Save Announcement</button>
            <button id="clearAnnounceBtn" class="btn btn-quiet">Take it down</button>
        </div>
        <p class="hint" style="margin-top:0.9rem;">"Take it down" removes the banner from the dashboard.</p>
    </div>`;
}

// ==================== WIRING ====================

let editingLinkIndex = null;

function wireView() {
    // generic nav
    document.querySelectorAll('[data-go]').forEach(el =>
        el.addEventListener('click', () => go({ name: el.getAttribute('data-go') })));

    document.querySelectorAll('[data-pick]').forEach(el =>
        el.addEventListener('click', () => {
            const id = el.getAttribute('data-pick');
            if (ADMIN.view.name === 'notes-pick') go({ name: 'notes-edit', classroomId: id });
            else go({ name: 'links-edit', target: id });
        }));

    // notes
    $('saveNoteBtn')?.addEventListener('click', async () => {
        const btn = $('saveNoteBtn');
        await withBusy(btn, async () => {
            await saveUpdate({ action: 'classroom-note', classroomId: ADMIN.view.classroomId, note: $('noteBox').value },
                'Note saved! Parents can see it now. ✓');
        });
    });

    $('saveTeacherBtn')?.addEventListener('click', async () => {
        await withBusy($('saveTeacherBtn'), async () => {
            await saveUpdate({
                action: 'teacher-info', classroomId: ADMIN.view.classroomId,
                teacher: { name: $('tName').value, email: $('tEmail').value, room: $('tRoom').value }
            }, 'Teacher info saved! ✓');
        });
    });

    // links
    editingLinkIndex = null;
    $('saveLinkBtn')?.addEventListener('click', onSaveLink);
    $('cancelLinkBtn')?.addEventListener('click', () => { editingLinkIndex = null; render(); });

    document.querySelectorAll('[data-edit-link]').forEach(el =>
        el.addEventListener('click', () => {
            editingLinkIndex = Number(el.getAttribute('data-edit-link'));
            const links = currentLinks();
            $('linkFormTitle').textContent = '✏️ Change this link';
            $('linkLabel').value = links[editingLinkIndex]?.label || '';
            $('linkUrl').value = links[editingLinkIndex]?.url || '';
            $('cancelLinkBtn').classList.remove('hidden');
            $('linkFormPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
            $('linkLabel').focus();
        }));

    document.querySelectorAll('[data-del-link]').forEach(el =>
        el.addEventListener('click', async () => {
            const i = Number(el.getAttribute('data-del-link'));
            const links = currentLinks();
            if (!confirm(`Remove "${links[i]?.label}" from the dashboard?`)) return;
            links.splice(i, 1);
            await pushLinks(links, 'Link removed. ✓');
        }));

    // docs
    const zone = $('uploadZone');
    const fileInput = $('fileInput');
    if (zone && fileInput) {
        zone.addEventListener('click', () => fileInput.click());
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault(); zone.classList.remove('dragover');
            if (e.dataTransfer.files?.[0]) uploadFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files?.[0]) uploadFile(fileInput.files[0]);
        });
    }

    document.querySelectorAll('[data-del-doc]').forEach(el =>
        el.addEventListener('click', async () => {
            const id = el.getAttribute('data-del-doc');
            const doc = (ADMIN.data.documents || []).find(d => d.id === id);
            if (!confirm(`Remove "${doc?.label}" from the dashboard?`)) return;
            try {
                const json = await api('/api/admin/delete-document', { method: 'POST', body: JSON.stringify({ id }) });
                if (json.data) ADMIN.data = json.data;
                toast('Document removed. ✓');
                render();
            } catch (e) { toast(e.message, true); }
        }));

    // announcement
    $('saveAnnounceBtn')?.addEventListener('click', async () => {
        await withBusy($('saveAnnounceBtn'), async () => {
            await saveUpdate({ action: 'announcement', text: $('announceBox').value },
                'Announcement is up! ✓');
        });
    });
    $('clearAnnounceBtn')?.addEventListener('click', async () => {
        $('announceBox').value = '';
        await saveUpdate({ action: 'announcement', text: '' }, 'Banner taken down. ✓');
        render();
    });
}

function currentLinks() {
    const t = ADMIN.view.target;
    return t === '__school__'
        ? [...(ADMIN.data.schoolLinks || [])]
        : [...(ADMIN.data.classrooms.find(x => x.id === t)?.resources || [])];
}

async function pushLinks(links, msg) {
    const t = ADMIN.view.target;
    try {
        if (t === '__school__') await saveUpdate({ action: 'school-links', links }, msg);
        else await saveUpdate({ action: 'classroom-links', classroomId: t, links }, msg);
        editingLinkIndex = null;
        render();
    } catch (e) { toast(e.message, true); }
}

async function onSaveLink() {
    const label = $('linkLabel').value.trim();
    const url = $('linkUrl').value.trim();
    if (!label) { toast('Please type what the button should say.', true); $('linkLabel').focus(); return; }
    if (!url) { toast('Please paste the web address.', true); $('linkUrl').focus(); return; }

    const links = currentLinks();
    const icon = guessIcon(label);
    if (editingLinkIndex !== null && links[editingLinkIndex]) {
        links[editingLinkIndex] = { ...links[editingLinkIndex], label, url, icon: links[editingLinkIndex].icon || icon };
    } else {
        links.push({ label, url, icon });
    }
    await pushLinks(links, 'Link saved! ✓');
}

function guessIcon(label) {
    const l = label.toLowerCase();
    if (l.includes('lunch') || l.includes('menu')) return 'fa-utensils';
    if (l.includes('dismiss') || l.includes('carpool') || l.includes('pickup') || l.includes('pick-up')) return 'fa-car-side';
    if (l.includes('dress') || l.includes('uniform')) return 'fa-shirt';
    if (l.includes('supply') || l.includes('supplies') || l.includes('list')) return 'fa-list-check';
    if (l.includes('calendar')) return 'fa-calendar-days';
    if (l.includes('compass') || l.includes('newsletter') || l.includes('news')) return 'fa-newspaper';
    if (l.includes('form')) return 'fa-file-pen';
    if (l.includes('volunteer')) return 'fa-hand-holding-heart';
    if (l.includes('pay') || l.includes('tuition')) return 'fa-credit-card';
    if (l.includes('library') || l.includes('book')) return 'fa-book';
    return 'fa-link';
}

async function uploadFile(file) {
    const label = $('docLabel').value.trim();
    if (!label) {
        toast('First, give the document a name in step 1.', true);
        $('docLabel').focus();
        $('fileInput').value = '';
        return;
    }
    const status = $('uploadStatus');
    status.innerHTML = `<div class="help-box" style="margin-top:1rem;"><i class="fas fa-spinner fa-spin"></i> Uploading "${esc(file.name)}"… please wait.</div>`;
    try {
        const form = new FormData();
        form.append('file', file);
        form.append('label', label);
        form.append('audience', $('docAudience').value);
        const json = await api('/api/admin/upload', { method: 'POST', body: form });
        if (json.data) ADMIN.data = json.data;
        toast('Uploaded! Parents can open it now. ✓');
        render();
    } catch (e) {
        status.innerHTML = '';
        toast(e.message, true);
    }
}

async function withBusy(btn, fn) {
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
    try { await fn(); }
    catch (e) { toast(e.message, true); }
    finally { btn.disabled = false; btn.innerHTML = original; }
}

// ==================== INIT ====================

$('loginBtn').addEventListener('click', tryLogin);
$('passwordInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
$('homeBtn').addEventListener('click', () => go({ name: 'home' }));
$('logoutBtn').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch (_) {}
    ADMIN.token = '';
    localStorage.removeItem('harding-admin-token');
    showLogin();
});

(async function init() {
    if (ADMIN.token) {
        try {
            const s = await (await fetch('/api/admin/session', { headers: { 'x-admin-token': ADMIN.token } })).json();
            if (s.valid) { await enterApp(); return; }
        } catch (_) {}
    }
    showLogin();
})();
