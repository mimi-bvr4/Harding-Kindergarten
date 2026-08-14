/**
 * Harding PreK Parent Dashboard — v5
 *
 * One general PreK program page, tabbed rather than one long scroll.
 *
 * Routes:
 *   #/  #/orientation  #/week  #/info  #/activities  #/team
 */

const CALENDAR_URL = 'https://hardingacademy.myschoolapp.com/podium/feed/iCal.aspx?z=96wT5QnMrJrphQP5BInbTmAAJCsRcQpy%2bmDKcAacSR8eeFymiEdCFAWuYOhCPhXy4XjpFPFcjomN3uHn%2bWimYA%3d%3d';

const APP = { data: null, room: 0, slotQuery: '' };

// ==================== DATA ====================

async function loadDashboardData() {
    let data = {
        programName: 'Harding PreK', programSubtitle: 'A parent-built page',
        keyDates: [], infoSections: [], documents: [], schoolLinks: [],
        classrooms: [], schoolEvents: [], announcement: '',
        weeklyEmail: {}, orientation: {}, soccer: {}, popsicles: {}, team: {}
    };
    // Hard timeout: a hung request must never leave parents staring at the
    // loading hawk. If /api/data doesn't answer in 8s we render what we have.
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const resp = await fetch('/api/data', { signal: ctrl.signal });
        clearTimeout(t);
        if (resp.ok) data = { ...data, ...(await resp.json()) };
    } catch (e) { console.warn('Data load failed, using defaults:', e.name); }

    // NOTE: the school iCal feed is deliberately NOT awaited here. Nothing on
    // the PreK page renders school events, and awaiting that feed on a cold
    // container held first paint for several seconds. If a section ever needs
    // it, load it in the background and re-render — don't block the page.

    return data;
}

// ==================== SMALL HELPERS ====================

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }

function parseISO(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
}

function daysFromToday(iso) {
    const d = parseISO(iso);
    if (!d) return null;
    return Math.round((d - startOfToday()) / 86400000);
}

function whenLabel(iso) {
    const n = daysFromToday(iso);
    if (n === null) return '';
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n < 0)  return `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} ago`;
    if (n < 7)  return `In ${n} days`;
    return `In ${Math.round(n / 7)} week${Math.round(n / 7) === 1 ? '' : 's'}`;
}

function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function initials(name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

// ==================== NAV ====================

function setupNav() {
    const drawer = document.getElementById('navDrawer');
    const scrim  = document.getElementById('navScrim');
    const open = () => { drawer.classList.add('open'); scrim.classList.remove('hidden');
                         requestAnimationFrame(() => scrim.classList.add('show')); };
    const close = () => { drawer.classList.remove('open'); scrim.classList.remove('show');
                          setTimeout(() => scrim.classList.add('hidden'), 200); };

    document.getElementById('menuBtn')?.addEventListener('click', open);
    document.getElementById('navCloseBtn')?.addEventListener('click', close);
    scrim?.addEventListener('click', close);
    document.getElementById('refreshBtn')?.addEventListener('click', () => location.reload());
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
    document.getElementById('navItems').addEventListener('click', e => {
        const link = e.target.closest('[data-route]');
        if (!link) return;
        e.preventDefault();
        navigate(link.getAttribute('data-route'));
        close();
    });
}

function renderNav(data) {
    const active = h => location.hash === h || (h === '#/' && !location.hash);
    const item = (hash, icon, label, sub, external) => `
        <a href="${hash}" ${external ? 'target="_blank" rel="noopener"' : `data-route="${hash}"`}
           class="nav-item touch-row ${active(hash) ? 'active' : ''}">
            <span class="icon"><i class="fas ${icon}"></i></span>
            <span style="flex:1">
                <div>${label}</div>
                ${sub ? `<div style="font-size:11px;color:#94A3B8;font-weight:500">${sub}</div>` : ''}
            </span>
            ${external ? '<i class="fas fa-arrow-up-right-from-square" style="font-size:10px;color:#CBD5E1"></i>' : ''}
        </a>`;

    const wk = data.weeklyEmail || {};

    document.getElementById('navItems').innerHTML = `
        ${item('#/', 'fa-house', 'Home', 'Everything for PreK')}
        ${data.dismissalForm?.show && data.dismissalForm?.url
            ? item(data.dismissalForm.url, 'fa-car-side', 'Dismissal Form',
                   dismissalState(data)?.status || 'Weekly, due Monday 9 AM', true) : ''}
        ${hasActivities(data) ? item('#/activities', 'fa-futbol', 'Sports & Activities', 'Outside the classroom') : ''}
        ${item('/handbook.html', 'fa-book-open', 'Family Handbook', 'Search the 2026-27 handbook', true)}
        ${wk.emailUrl ? item(wk.emailUrl, 'fa-envelope-open-text', "This Week's Email", 'Open the full school email', true) : ''}
    `;

    document.getElementById('navLastUpdated').textContent =
        data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString('en-US',
            { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function setTopbar(title, subtitle) {
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = subtitle || '';
}

// ==================== SECTIONS ====================

function renderAnnouncement(data) {
    if (!data.announcement) return '';
    return `<div class="announce-banner"><i class="fas fa-bullhorn" style="margin-top:2px"></i>
            <span>${esc(data.announcement)}</span></div>`;
}

function nextKeyDate(data) {
    return (data.keyDates || [])
        .filter(d => (daysFromToday(d.date) ?? -1) >= 0)
        .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

function renderHero(data) {
    const now = new Date();
    const nx = nextKeyDate(data);
    const n = nx ? daysFromToday(nx.date) : null;
    return `
    <div class="today-hero">
        <div style="position:relative;z-index:1">
            <div class="hero-eyebrow">${greeting()}</div>
            <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:4px">
                <div>
                    <div class="display" style="font-size:26px;font-weight:600;line-height:1.05">
                        ${now.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                    <div style="font-size:13.5px;color:#BFDBFE;margin-top:5px">
                        ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                </div>
                <div class="hero-daynum">${now.getDate()}</div>
            </div>
            ${nx ? `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:14px">
                <span class="hero-chip"><i class="fas fa-calendar-day"></i>${esc(whenLabel(nx.date))} · ${esc(nx.label.split('—')[0].trim())}</span>
            </div>` : ''}
        </div>
    </div>
    ${nx && n !== null && n <= 14 ? `
    <div class="countdown">
        <div>
            <div class="countdown-num">${n === 0 ? '·' : n}</div>
            <div class="countdown-label" style="text-align:center">${n === 0 ? 'today' : n === 1 ? 'day' : 'days'}</div>
        </div>
        <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:15px;line-height:1.25">${esc(nx.label)}</div>
            <div style="font-size:12px;opacity:.9;margin-top:2px">
                ${parseISO(nx.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
    </div>` : ''}`;
}

function renderWeeklyEmail(data) {
    const wk = data.weeklyEmail || {};
    const prek = (data.classrooms || []).find(c => c.id === 'prek');
    const excerpt = prek?.weeklyExcerpt || wk.prekExcerpt || '';
    if (!excerpt && !wk.emailUrl) return '';
    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-envelope-open-text"></i></span>
            <span>This Week from School</span>
            ${wk.week ? `<span style="margin-left:auto;font-size:10px;font-weight:800;color:#94A3B8;
                          text-transform:uppercase;letter-spacing:.09em">${esc(wk.week)}</span>` : ''}
        </div>
        ${excerpt
            ? `<div style="font-size:14.5px;line-height:1.65;color:#334155;white-space:pre-line">${esc(excerpt)}</div>`
            : `<p style="font-size:14px;color:#94A3B8;margin:0">This week's PreK note hasn't been posted yet.</p>`}
        ${wk.emailUrl ? `
        <a href="${esc(wk.emailUrl)}" target="_blank" rel="noopener"
           class="cta cta-navy cta-block" style="margin-top:15px">
            <i class="fas fa-arrow-up-right-from-square"></i> Read the full school email
        </a>` : ''}
    </section>`;
}

function renderOrientation(data) {
    const o = data.orientation || {};
    if (!o.show || !(o.rooms || []).length) return '';
    // Retires itself the day after orientation so nobody has to remember to
    // switch it off. Set orientation.show to false to hide it sooner.
    if (o.dateISO && (daysFromToday(o.dateISO) ?? 0) < 0) return '';

    const q = APP.slotQuery.trim().toLowerCase();
    const activeRoom = Math.min(APP.room, o.rooms.length - 1);

    // A parent's first move is typing their child's name. Search must span
    // BOTH rooms — they don't know which room their child is in yet.
    const slotCard = (s, roomName, showRoom) => {
        const mine = q && (s.students || []).some(n => n.toLowerCase().includes(q));
        const meridiem = (/([AP])M/i.exec(s.time) || [, 'A'])[1].toUpperCase() + 'M';
        const startTime = (s.time.split(/[–-]/)[0] || '').replace(/\s*[AP]M/i, '').trim();
        return `
        <div class="slot-card ${mine ? 'is-mine' : ''}">
            <div class="slot-time">
                <div class="t">${esc(meridiem)}</div>
                <div class="n">${esc(startTime)}</div>
            </div>
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
                    <span style="font-weight:800;font-size:14.5px">${esc(s.time)}</span>
                    ${showRoom ? `<span style="font-size:11px;font-weight:800;color:#B45309;
                        text-transform:uppercase;letter-spacing:.07em">${esc(roomName)}</span>` : ''}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
                    ${(s.students || []).map(n => `<span class="name-chip ${
                        q && n.toLowerCase().includes(q) ? 'hit' : ''}">${esc(n)}</span>`).join('')}
                </div>
            </div>
        </div>`;
    };

    let slots;
    if (q) {
        const matches = [];
        o.rooms.forEach(r => (r.slots || []).forEach(s => {
            if ((s.students || []).some(n => n.toLowerCase().includes(q))) {
                matches.push(slotCard(s, r.name, true));
            }
        }));
        slots = matches.join('');
    } else {
        slots = (o.rooms[activeRoom].slots || []).map(s => slotCard(s, o.rooms[activeRoom].name, false)).join('');
    }

    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill gold"><i class="fas fa-door-open"></i></span>
            <span>${esc(o.headline || 'Orientation')}</span>
        </div>

        <div style="font-weight:800;font-size:15px;color:var(--navy)">${esc(o.date || '')}</div>
        <p style="font-size:14px;line-height:1.6;color:#475569;margin:8px 0 0">${esc(o.blurb || '')}</p>

        <div style="margin-top:18px">
            <div class="home-section-title" style="margin-left:0">Find your time</div>
            <input id="slotSearch" class="slot-search" type="search" autocomplete="off"
                   placeholder="Type your child's name…" value="${esc(APP.slotQuery)}">
            ${q ? '' : `
            <div style="display:flex;gap:8px;margin-top:10px">
                ${o.rooms.map((r, i) => `<button class="room-tab ${i === activeRoom ? 'active' : ''}"
                    data-room="${i}">${esc(r.name)}</button>`).join('')}
            </div>`}
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
                ${slots || `<p style="font-size:14px;color:#94A3B8;margin:6px 0">
                    No child matching &ldquo;${esc(APP.slotQuery)}&rdquo; — check the spelling,
                    or clear the box to see every group.</p>`}
            </div>
        </div>

        ${(o.bringList || []).length ? `
        <div style="margin-top:20px">
            <div class="home-section-title" style="margin-left:0">Please bring</div>
            <ul class="bullet-list">${o.bringList.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
        </div>` : ''}

        ${(o.notes || []).length ? `
        <div class="note-box">
            ${o.notes.map(n => `<div class="n"><i class="fas fa-circle-info"></i><span>${esc(n)}</span></div>`).join('')}
        </div>` : ''}

        ${o.conflictNote ? `<p style="font-size:13px;color:#64748B;margin:14px 0 0;line-height:1.55">
            <i class="fas fa-phone" style="color:#94A3B8;margin-right:6px"></i>${esc(o.conflictNote)}</p>` : ''}
    </section>`;
}

function renderKeyDates(data) {
    const dates = (data.keyDates || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!dates.length) return '';
    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-calendar-check"></i></span>
            <span>Key Dates</span>
        </div>
        ${dates.map(d => {
            const dt = parseISO(d.date);
            const n = daysFromToday(d.date);
            return `
            <div class="date-row ${n !== null && n < 0 ? 'past' : ''}">
                <div class="date-badge ${n !== null && n >= 0 && n <= 7 ? 'soon' : ''}">
                    <div class="m">${dt ? MONTHS[dt.getMonth()] : '·'}</div>
                    <div class="d">${dt ? dt.getDate() : '–'}</div>
                </div>
                <div style="flex:1;min-width:0;padding-top:3px">
                    <div style="font-size:14.5px;font-weight:700;color:#1E293B;line-height:1.4">${esc(d.label)}</div>
                    <div style="font-size:11.5px;color:#94A3B8;margin-top:2px">${esc(whenLabel(d.date))}</div>
                </div>
            </div>`;
        }).join('')}
    </section>`;
}

/**
 * The dismissal form is the one thing a parent touches every single week.
 * It opens Friday evening and is due Monday 9 AM, so the card changes state
 * with the clock: loud and gold while the window is open, quiet the rest of
 * the week. renderHome places it near the top only when it's actually live.
 */
function dismissalState(data) {
    const f = data.dismissalForm || {};
    if (!f.show || !f.url) return null;
    const now = new Date();
    const day = now.getDay();          // 0 Sun … 6 Sat
    const hr  = now.getHours();

    const open = (day === 5 && hr >= 17) || day === 6 || day === 0 || (day === 1 && hr < 9);
    const urgent = day === 0 || (day === 1 && hr < 9);

    let status;
    if (day === 1 && hr < 9)      status = `Due today at 9:00 AM`;
    else if (day === 0)           status = `Due tomorrow at 9:00 AM`;
    else if (open)                status = `Open now · ${f.dueNote || 'due Monday 9:00 AM'}`;
    else                          status = f.opensNote || 'Opens Friday evening';

    return { form: f, open, urgent, status };
}

function renderDismissal(data, variant) {
    const st = dismissalState(data);
    if (!st) return '';
    const { form: f, open, urgent, status } = st;

    if (variant === 'tile') {
        return `
        <a href="${esc(f.url)}" target="_blank" rel="noopener" class="feature-tile touch-row">
            <span class="feature-icon"><i class="fas fa-car-side"></i></span>
            <span style="flex:1;min-width:0;position:relative;z-index:1">
                <span class="display" style="display:block;font-size:17px;font-weight:600">${esc(f.title)}</span>
                <span style="display:block;font-size:12.5px;color:#BFDBFE;margin-top:3px">${esc(status)}</span>
            </span>
            <i class="fas fa-arrow-up-right-from-square" style="opacity:.5;position:relative;z-index:1"></i>
        </a>`;
    }

    return `
    <section class="section-card" ${urgent ? 'style="border-color:var(--gold);box-shadow:0 0 0 3px rgba(245,158,11,.18)"' : ''}>
        <div class="section-header">
            <span class="icon-pill ${open ? 'gold' : ''}"><i class="fas fa-car-side"></i></span>
            <span>${esc(f.title)}</span>
            ${open ? `<span style="margin-left:auto" class="today-pill">${urgent ? 'DUE' : 'OPEN'}</span>` : ''}
        </div>
        <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 6px">${esc(f.blurb || '')}</p>
        <p style="font-size:13.5px;font-weight:800;color:${urgent ? '#B45309' : '#64748B'};margin:0">
            <i class="fas fa-clock" style="margin-right:6px"></i>${esc(status)}</p>
        <a href="${esc(f.url)}" target="_blank" rel="noopener"
           class="cta ${open ? 'cta-gold' : 'cta-navy'} cta-block" style="margin-top:15px">
            <i class="fas fa-pen-to-square"></i> Fill out this week's form
        </a>
        ${f.footnote ? `<p style="font-size:12.5px;color:#94A3B8;margin:10px 0 0;text-align:center;line-height:1.5">
            ${esc(f.footnote)}</p>` : ''}
    </section>`;
}

/**
 * This site is NOT official school communication. It's a parent-built tool.
 * That has to be stated where people actually see it — not buried — because
 * the school colors and the reposted newsletter content otherwise read as
 * an official channel.
 */
function renderDisclaimer(data) {
    const d = data.disclaimer;
    if (!d) return '';
    return `
    <div class="archived-note" style="margin-top:4px">
        <i class="fas fa-circle-info" style="margin-top:2px"></i>
        <span>${esc(d)}</span>
    </div>`;
}

function renderHandbookTile() {
    return `
    <a href="/handbook.html" class="feature-tile touch-row">
        <span class="feature-icon"><i class="fas fa-book-open"></i></span>
        <span style="flex:1;min-width:0;position:relative;z-index:1">
            <span class="display" style="display:block;font-size:17px;font-weight:600">Family Handbook</span>
            <span style="display:block;font-size:12.5px;color:#BFDBFE;margin-top:3px">
                Search 2026-27 — carpool, uniforms, snow days, illness</span>
        </span>
        <i class="fas fa-chevron-right" style="opacity:.5;position:relative;z-index:1"></i>
    </a>`;
}

function renderInfoSections(data) {
    return (data.infoSections || []).map(sec => `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill gold"><i class="fas ${esc(sec.icon || 'fa-circle-info')}"></i></span>
            <span>${esc(sec.title)}</span>
        </div>
        ${(sec.items || []).map((it, i) => `
        <div class="info-item" data-info="${esc(sec.id)}-${i}">
            <button class="info-q" type="button">
                <i class="fas fa-chevron-right"></i><span>${esc(it.title)}</span>
            </button>
            <div class="info-a">${esc(it.body)}</div>
        </div>`).join('')}
    </section>`).join('');
}

function renderSoccer(data) {
    const s = data.soccer || {};
    if (!s.show) return '';
    const rows = [
        ['fa-calendar-day', 'Season', s.season],
        ['fa-hourglass-half', 'Register by', s.deadline],
        ['fa-child-reaching', 'Age group', s.grades],
        ['fa-location-dot', 'Practices', s.practices],
        ['fa-futbol', 'Games', s.games]
    ].filter(r => r[2]);

    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill green"><i class="fas fa-futbol"></i></span>
            <span>${esc(s.headline || 'Soccer')}</span>
        </div>
        <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 14px">${esc(s.blurb || '')}</p>
        ${s.highlight ? `<div style="background:linear-gradient(135deg,var(--green),var(--green-2));color:#fff;
            border-radius:16px;padding:12px 14px;font-weight:700;font-size:14px;margin-bottom:14px">
            <i class="fas fa-bolt" style="margin-right:7px"></i>${esc(s.highlight)}</div>` : ''}
        ${rows.map(r => `
        <div class="row">
            <span class="ic"><i class="fas ${r[0]}"></i></span>
            <div><div class="row-label">${r[1]}</div><div class="row-value">${esc(r[2])}</div></div>
        </div>`).join('')}
        ${s.signupUrl ? `<a href="${esc(s.signupUrl)}" target="_blank" rel="noopener"
            class="cta cta-green cta-block" style="margin-top:16px">
            <i class="fas fa-pen-to-square"></i>${esc(s.signupLabel || 'Register')}</a>` : ''}
        ${s.signupTip ? `<p style="font-size:13px;color:#64748B;margin:10px 0 0;text-align:center">
            ${esc(s.signupTip)}</p>` : ''}
        ${(s.links || []).length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
            ${s.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener"
                style="display:inline-flex;align-items:center;gap:7px;padding:9px 15px;border-radius:999px;
                       font-size:13px;font-weight:700;color:#475569;background:#F1F5F9;text-decoration:none">
                <i class="fas ${esc(l.icon || 'fa-link')}" style="color:#94A3B8"></i>${esc(l.label)}</a>`).join('')}
        </div>` : ''}
        ${(s.notes || []).length ? `<div class="note-box">
            ${s.notes.map(n => `<div class="n"><i class="fas fa-circle-info"></i><span>${esc(n)}</span></div>`).join('')}
        </div>` : ''}
        ${s.coachName ? `<p style="font-size:13.5px;color:#475569;margin:16px 0 0;padding-top:14px;
            border-top:1px solid #F1F5F9">
            <i class="fas fa-user" style="color:#94A3B8;margin-right:6px"></i>
            <span style="font-weight:700">${esc(s.coachName)}</span>
            ${s.coachPhone ? ` · <a href="tel:${esc(s.coachPhone.replace(/[^\d+]/g, ''))}"
                style="font-weight:700;color:var(--green);text-decoration:none">${esc(s.coachPhone)}</a>` : ''}
        </p>` : ''}
    </section>`;
}

function renderPopsicles(data) {
    const p = data.popsicles || {};
    if (!p.show) return '';
    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill gold"><i class="fas fa-ice-cream"></i></span>
            <span>${esc(p.headline || 'Get Together')}</span>
        </div>
        <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 14px">${esc(p.blurb || '')}</p>
        <div style="display:flex;flex-direction:column;gap:10px">
        ${(p.dates || []).map(d => {
            const dt = parseISO(d.date) || null;
            return `
            <div class="slot-card">
                <div class="slot-time">
                    <div class="t">${dt ? MONTHS[dt.getMonth()] : '·'}</div>
                    <div class="n">${dt ? dt.getDate() : '–'}</div>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:800;font-size:14.5px">${esc(d.label || d.date || '')}</div>
                    <div style="font-size:13px;color:#64748B;margin-top:3px">
                        ${[d.time, d.location].filter(Boolean).map(esc).join(' · ')}</div>
                    ${d.note ? `<div style="margin-top:8px;font-size:13px;font-weight:600;color:#78350F;
                        background:#FEF3C7;border:1px solid #FDE68A;border-radius:11px;padding:8px 11px">
                        ${esc(d.note)}</div>` : ''}
                    ${d.bringing ? `<div style="margin-top:8px;font-size:13px;color:#64748B">
                        <i class="fas fa-ice-cream" style="color:var(--gold);margin-right:6px"></i>${esc(d.bringing)}</div>` : ''}
                    ${(d.attending || []).length ? `<div style="margin-top:10px">
                        <div class="row-label" style="margin-bottom:6px">Coming so far · ${d.attending.length}</div>
                        <div style="display:flex;flex-wrap:wrap;gap:6px">
                            ${d.attending.map(n => `<span class="name-chip">${esc(n)}</span>`).join('')}</div>
                    </div>` : ''}
                </div>
            </div>`;
        }).join('')}
        </div>
        ${p.rsvpUrl ? `<a href="${esc(p.rsvpUrl)}" target="_blank" rel="noopener"
            class="cta cta-gold cta-block" style="margin-top:16px">
            <i class="fas fa-envelope-open-text"></i>${esc(p.rsvpLabel || 'RSVP')}</a>` : ''}
    </section>`;
}

function renderTeam(data) {
    const t = data.team || {};
    if (!(t.people || []).length) return '';
    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-people-group"></i></span>
            <span>${esc(t.title || 'Your PreK Team')}</span>
        </div>
        ${t.note ? `<p style="font-size:14px;color:#475569;margin:0 0 12px;line-height:1.55">${esc(t.note)}</p>` : ''}
        ${t.people.map(p => `
        <a class="person-row touch-row" href="mailto:${esc(p.email)}">
            <span class="person-avatar">${esc(initials(p.name))}</span>
            <span style="flex:1;min-width:0">
                <span style="display:block;font-weight:700;font-size:14.5px;color:#1E293B">${esc(p.name)}</span>
                <span style="display:block;font-size:12px;color:#94A3B8;margin-top:1px">${esc(p.role || '')}</span>
            </span>
            <i class="fas fa-envelope" style="color:#CBD5E1;font-size:14px"></i>
        </a>`).join('')}
        ${t.people.find(p => p.phone) ? `<p style="font-size:13px;color:#64748B;margin:14px 0 0">
            <i class="fas fa-phone" style="color:#94A3B8;margin-right:6px"></i>
            ${esc(t.people.find(p => p.phone).name)} · ${esc(t.people.find(p => p.phone).phone)}</p>` : ''}
    </section>`;
}

// ---- documents & links (unchanged behaviour, restyled) ----

const DOC_ICONS = { pdf:'fa-file-pdf', doc:'fa-file-word', docx:'fa-file-word', xls:'fa-file-excel',
    xlsx:'fa-file-excel', ppt:'fa-file-powerpoint', pptx:'fa-file-powerpoint', png:'fa-file-image',
    jpg:'fa-file-image', jpeg:'fa-file-image', gif:'fa-file-image', webp:'fa-file-image', txt:'fa-file-lines' };
const DOC_TINTS = { pdf:'doc-tint-red', doc:'doc-tint-blue', docx:'doc-tint-blue', xls:'doc-tint-green',
    xlsx:'doc-tint-green', ppt:'doc-tint-orange', pptx:'doc-tint-orange' };

function isNewDoc(d) {
    const t = Date.parse(d.uploadedAt || 0);
    return t && (Date.now() - t) < 6048e5;
}

function renderDocuments(data, audience, title) {
    const docs = (data.documents || []).filter(d => d.audience === audience);
    if (!docs.length) return '';
    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-folder-open"></i></span>
            <span>${esc(title || 'Documents & Forms')}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px">
            ${docs.map(d => `
            <a href="${esc(d.url)}" target="_blank" rel="noopener" class="doc-card touch-row">
                <span class="doc-card-icon ${DOC_TINTS[d.type] || 'doc-tint-slate'}">
                    <i class="fas ${DOC_ICONS[d.type] || 'fa-file'}"></i></span>
                <span style="flex:1;min-width:0">
                    <span style="display:flex;align-items:center;gap:8px">
                        <span style="font-weight:700;font-size:14px;color:#1E293B">${esc(d.label)}</span>
                        ${isNewDoc(d) ? '<span class="new-pill">NEW</span>' : ''}
                    </span>
                    <span style="display:block;font-size:11.5px;color:#94A3B8;margin-top:2px">Tap to open</span>
                </span>
                <i class="fas fa-arrow-up-right-from-square" style="font-size:11px;color:#CBD5E1"></i>
            </a>`).join('')}
        </div>
    </section>`;
}

function renderSchoolLinks(data) {
    if (!(data.schoolLinks || []).length) return '';
    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-link"></i></span>
            <span>Quick Links</span>
        </div>
        <div class="link-grid">
            ${data.schoolLinks.map(r => `
            <a href="${esc(r.url || '#')}" target="_blank" rel="noopener noreferrer" class="link-tile touch-row">
                <span class="link-tile-icon"><i class="fas ${esc(r.icon || 'fa-link')}"></i></span>
                <span style="font-size:13px;font-weight:700;color:#475569;line-height:1.3">${esc(r.label)}</span>
            </a>`).join('')}
        </div>
    </section>`;
}

// ==================== PAGES ====================

/**
 * Tabs, not one long scroll. Each tab is its own short screen and its own
 * hash, so a link to #/info still lands where you meant.
 */
function tabsFor(data) {
    const o = data.orientation || {};
    const orientationLive = o.show && (o.rooms || []).length &&
        !(o.dateISO && (daysFromToday(o.dateISO) ?? 0) < 0);
    return [
        { hash: '#/',           label: 'Today',   icon: 'fa-house' },
        orientationLive
            ? { hash: '#/orientation', label: 'Orientation', icon: 'fa-door-open', dot: true } : null,
        { hash: '#/week',       label: 'This Week', icon: 'fa-calendar-week' },
        { hash: '#/info',       label: 'Info',    icon: 'fa-circle-info' },
        hasActivities(data)
            ? { hash: '#/activities', label: 'Sports', icon: 'fa-futbol' } : null,
        { hash: '#/team',       label: 'Team',    icon: 'fa-people-group' }
    ].filter(Boolean);
}

function renderTabBar(data, active) {
    return `<nav class="tabbar" id="tabbar">
        ${tabsFor(data).map(t => `
        <a href="${t.hash}" data-route="${t.hash}" class="tab ${t.hash === active ? 'active' : ''}">
            <i class="fas ${t.icon}"></i>${esc(t.label)}${t.dot && t.hash !== active ? '<span class="dot"></span>' : ''}
        </a>`).join('')}
    </nav>`;
}

function page(data, active, inner) {
    return `
    ${renderAnnouncement(data)}
    ${renderTabBar(data, active)}
    <div style="padding:16px;display:flex;flex-direction:column;gap:18px" class="page-enter">
        ${inner}
        ${renderDisclaimer(data)}
        <div class="footer-note">
            Updated ${data.lastUpdated
                ? new Date(data.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
        </div>
    </div>`;
}

function renderHome(data) {
    setTopbar(data.programName || 'Harding PreK', 'Today');
    const orientationLive = tabsFor(data).some(t => t.hash === '#/orientation');
    return page(data, '#/', `
        ${renderHero(data)}
        ${data.welcome ? `<div class="note-box" style="margin:0">
            <div class="n"><i class="fas fa-star"></i><span style="font-weight:600">${esc(data.welcome)}</span></div>
        </div>` : ''}
        ${renderDismissal(data, 'card')}
        ${orientationLive ? `
        <a href="#/orientation" data-route="#/orientation" class="feature-tile touch-row"
           style="background:linear-gradient(135deg,#B45309,var(--gold))">
            <span class="feature-icon"><i class="fas fa-door-open"></i></span>
            <span style="flex:1;min-width:0;position:relative;z-index:1">
                <span class="display" style="display:block;font-size:17px;font-weight:600">Orientation Day</span>
                <span style="display:block;font-size:12.5px;color:#FEF3C7;margin-top:3px">
                    ${esc(data.orientation.date || '')} · find your time slot</span>
            </span>
            <i class="fas fa-chevron-right" style="opacity:.6;position:relative;z-index:1"></i>
        </a>` : ''}
        ${renderKeyDates(data)}
    `);
}

function renderOrientationPage(data) {
    setTopbar('Orientation', data.orientation?.date || 'Harding PreK');
    return page(data, '#/orientation', renderOrientation(data) ||
        '<div class="archived-note"><i class="fas fa-door-open" style="margin-top:2px"></i>' +
        '<span>Orientation has passed. See Today for what\'s next.</span></div>');
}

function renderWeekPage(data) {
    setTopbar('This Week', 'Harding PreK');
    return page(data, '#/week', `
        ${renderWeeklyEmail(data) || `<div class="archived-note">
            <i class="fas fa-envelope-open-text" style="margin-top:2px"></i>
            <span>This week's PreK note hasn't been posted yet.</span></div>`}
        ${renderDismissal(data, 'card')}
        ${renderKeyDates(data)}
    `);
}

function renderInfoPage(data) {
    setTopbar('Info', 'Harding PreK');
    return page(data, '#/info', `
        ${renderHandbookTile()}
        ${renderDocuments(data, 'school', 'Documents & Forms')}
        ${renderSchoolLinks(data)}
        ${renderInfoSections(data)}
    `);
}

function renderTeamPage(data) {
    setTopbar('Team', 'Harding PreK');
    return page(data, '#/team', renderTeam(data));
}

function hasActivities(data) {
    return !!(data.soccer?.show || data.popsicles?.show);
}

function renderActivitiesTile(data) {
    if (!hasActivities(data)) return '';
    const bits = [];
    if (data.soccer?.show) bits.push('Soccer');
    if (data.popsicles?.show) bits.push('Get-togethers');
    return `
    <a href="#/activities" data-route="#/activities" class="feature-tile touch-row"
       style="background:linear-gradient(135deg,var(--green),#0F6B33)">
        <span class="feature-icon"><i class="fas fa-futbol"></i></span>
        <span style="flex:1;min-width:0;position:relative;z-index:1">
            <span class="display" style="display:block;font-size:17px;font-weight:600">Sports &amp; Activities</span>
            <span style="display:block;font-size:12.5px;color:#D1FAE5;margin-top:3px">
                ${esc(bits.join(' · '))} outside the classroom</span>
        </span>
        <i class="fas fa-chevron-right" style="opacity:.5;position:relative;z-index:1"></i>
    </a>`;
}

function renderActivitiesPage(data) {
    setTopbar('Sports & Activities', 'Harding PreK');
    return page(data, '#/activities', `
        ${renderSoccer(data)}
        ${renderPopsicles(data)}
        ${!hasActivities(data) ? `<div class="archived-note">
            <i class="fas fa-futbol" style="margin-top:2px"></i>
            <span>Nothing running right now. Check back — this is where soccer,
            play dates, and anything else outside the classroom will live.</span>
        </div>` : ''}
    `);
}



function renderNotFound() {
    setTopbar('Not Found', '');
    return `
    <div style="padding:48px 24px;text-align:center" class="page-enter">
        <img src="/img/hawk-body.png" alt="" style="width:112px;margin:0 auto 16px;opacity:.5;display:block">
        <h2 class="display" style="font-size:19px;color:#334155;margin:0">Page not found</h2>
        <a href="#/" data-route="#/" class="cta cta-navy" style="margin-top:18px">
            <i class="fas fa-arrow-left"></i> Back to Home</a>
    </div>`;
}

// ==================== ROUTER ====================

function currentRoute() {
    const hash = (location.hash || '#/').replace(/^#/, '');
    if (hash.startsWith('/activities'))   return { name: 'activities' };
    if (hash.startsWith('/orientation'))  return { name: 'orientation' };
    if (hash.startsWith('/week'))         return { name: 'week' };
    if (hash.startsWith('/info'))         return { name: 'info' };
    if (hash.startsWith('/team'))         return { name: 'team' };
    return { name: 'home' };
}

function navigate(hash) {
    if (location.hash === hash) renderApp();
    else location.hash = hash;
}

function renderApp(opts = {}) {
    if (!APP.data) return;
    renderNav(APP.data);
    const route = currentRoute();
    const root = document.getElementById('root');

    const R = {
        activities:   () => renderActivitiesPage(APP.data),
        orientation:  () => renderOrientationPage(APP.data),
        week:         () => renderWeekPage(APP.data),
        info:         () => renderInfoPage(APP.data),
        team:         () => renderTeamPage(APP.data),
        home:         () => renderHome(APP.data)
    };
    root.innerHTML = (R[route.name] || R.home)();

    // Keep the active tab visible when it's off the right edge of the strip.
    const activeTab = root.querySelector('.tab.active');
    if (activeTab) activeTab.scrollIntoView({ block: 'nearest', inline: 'center' });

    if (opts.keepScroll) {
        const el = document.getElementById('slotSearch');
        if (el && opts.focusSearch) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        }
    } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
}

// ==================== INTERACTION ====================

function setupRootHandlers() {
    const root = document.getElementById('root');

    root.addEventListener('click', e => {
        const nav = e.target.closest('[data-route]');
        if (nav) { e.preventDefault(); navigate(nav.getAttribute('data-route')); return; }

        const tab = e.target.closest('[data-room]');
        if (tab) {
            APP.room = Number(tab.getAttribute('data-room')) || 0;
            const y = window.scrollY;
            renderApp({ keepScroll: true });
            window.scrollTo({ top: y, behavior: 'instant' });
            return;
        }

        const q = e.target.closest('.info-q');
        if (q) { q.closest('.info-item').classList.toggle('open'); return; }
    });

    let t = null;
    root.addEventListener('input', e => {
        if (e.target.id !== 'slotSearch') return;
        APP.slotQuery = e.target.value;
        clearTimeout(t);
        t = setTimeout(() => {
            const y = window.scrollY;
            renderApp({ keepScroll: true, focusSearch: true });
            window.scrollTo({ top: y, behavior: 'instant' });
        }, 220);
    });
}

// ==================== INIT ====================

setupNav();
setupRootHandlers();
window.addEventListener('hashchange', () => renderApp());

loadDashboardData()
    .then(data => { APP.data = data; renderApp(); })
    .catch(err => {
        console.error('Dashboard init failed:', err);
        document.getElementById('root').innerHTML = `
        <div style="padding:48px 24px;text-align:center">
            <img src="/img/hawk-body.png" alt="" style="width:112px;margin:0 auto 16px;opacity:.5;display:block">
            <h2 class="display" style="font-size:19px;color:#334155;margin:0">Couldn't load the dashboard</h2>
            <p style="font-size:14px;color:#94A3B8;margin-top:6px">Please refresh to try again.</p>
        </div>`;
    });
