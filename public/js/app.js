/**
 * Harding Academy Parent Dashboard — v4
 * Mobile-first, multi-page (hash-routed) with hamburger nav.
 *
 * Routes:
 *   #/          → landing
 *   #/c/<id>    → classroom page (e.g. #/c/kinder-kivett)
 */

const CALENDAR_URL = 'https://hardingacademy.myschoolapp.com/podium/feed/iCal.aspx?z=96wT5QnMrJrphQP5BInbTmAAJCsRcQpy%2bmDKcAacSR8eeFymiEdCFAWuYOhCPhXy4XjpFPFcjomN3uHn%2bWimYA%3d%3d';

// ==================== DATA LOADING ====================

async function loadDashboardData() {
    let data = {
        weeklyEmail: { week: '', kindergartenExcerpt: '', highlights: [], importantDates: [] },
        schoolEvents: [],
        classrooms: [],
        documents: [],
        schoolLinks: [],
        announcement: ''
    };
    try {
        const resp = await fetch('/api/data');
        if (resp.ok) {
            const apiData = await resp.json();
            data = { ...data, ...apiData };
        }
    } catch (e) { console.warn('API data load failed, using defaults'); }

    try {
        const calendarEvents = await loadCalendar(CALENDAR_URL);
        if (calendarEvents?.length > 0) data.schoolEvents = calendarEvents;
    } catch (e) { console.error('Calendar load failed:', e); }

    return data;
}

// ==================== EVENT FILTERING ====================

function isEventForClassroom(event, classroom, ctx = {}) {
    const title = (event.title || '').toLowerCase();
    const my  = (classroom?.gradeKeywords || []).map(s => s.toLowerCase());
    const all = (ctx.allSchoolKeywords || []).map(s => (s || '').toLowerCase());
    const other = (ctx.otherGradeKeywords || []).map(s => s.toLowerCase());
    if (!my.length) return true;

    if (my.some(k => k && title.includes(k))) return true;
    if (other.some(k => k && title.includes(k))) return false;
    if (all.some(k => k && title.includes(k))) return true;
    return false;
}

function buildEventFilterContext(data, classroom) {
    const mine = new Set((classroom?.gradeKeywords || []).map(s => s.toLowerCase()));
    const otherGradeKeywords = [];
    for (const c of (data.classrooms || [])) {
        for (const k of (c.gradeKeywords || [])) {
            if (!mine.has(k.toLowerCase())) otherGradeKeywords.push(k);
        }
    }
    return { allSchoolKeywords: data.allSchoolKeywords || [], otherGradeKeywords };
}

function relevantEvents(data, classroom) {
    const upcoming = (data.schoolEvents || []).filter(isUpcoming);
    if (!classroom) return upcoming;
    const ctx = buildEventFilterContext(data, classroom);
    return upcoming.filter(e => isEventForClassroom(e, classroom, ctx));
}

function nextShowAndShare(data, classroom) {
    if (!classroom?.showAndShareEnabled) return null;
    if (typeof SHOW_AND_SHARE_SCHEDULE === 'undefined') return null;
    const todayStr = toDateStr(today());
    const upcoming = SHOW_AND_SHARE_SCHEDULE
        .filter(s => s.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] || null;
}

function nextThingForTile(data, classroom) {
    const sas = nextShowAndShare(data, classroom);
    const ev  = relevantEvents(data, classroom)[0];
    if (sas && ev) {
        return sas.date <= ev.date
            ? { kind: 'sas', date: sas.date, label: sas.student + ' brings Show & Share' }
            : { kind: 'event', date: ev.date, label: ev.title };
    }
    if (sas) return { kind: 'sas', date: sas.date, label: sas.student + ' brings Show & Share' };
    if (ev)  return { kind: 'event', date: ev.date, label: ev.title };
    return null;
}

// ==================== DOCUMENTS / LINKS HELPERS ====================

function docsFor(data, audience) {
    return (data.documents || []).filter(d => d.audience === audience);
}

const DOC_ICONS = {
    pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word',
    xls: 'fa-file-excel', xlsx: 'fa-file-excel',
    ppt: 'fa-file-powerpoint', pptx: 'fa-file-powerpoint',
    png: 'fa-file-image', jpg: 'fa-file-image', jpeg: 'fa-file-image',
    gif: 'fa-file-image', webp: 'fa-file-image', txt: 'fa-file-lines'
};
const DOC_TINTS = {
    pdf: 'doc-tint-red', doc: 'doc-tint-blue', docx: 'doc-tint-blue',
    xls: 'doc-tint-green', xlsx: 'doc-tint-green',
    ppt: 'doc-tint-orange', pptx: 'doc-tint-orange'
};
function docIcon(type) { return DOC_ICONS[type] || 'fa-file'; }
function docTint(type) { return DOC_TINTS[type] || 'doc-tint-slate'; }

function isNewDoc(d) {
    const t = Date.parse(d.uploadedAt || 0);
    return t && (Date.now() - t) < 1000 * 60 * 60 * 24 * 7; // < 7 days old
}

// ==================== ROUTER ====================

const ROUTES = { landing: 'landing', classroom: 'classroom' };

function currentRoute() {
    const hash = (location.hash || '#/').replace(/^#/, '');
    if (hash.startsWith('/c/')) {
        return { name: ROUTES.classroom, classroomId: decodeURIComponent(hash.slice(3)) };
    }
    return { name: ROUTES.landing };
}

function navigate(hash) {
    if (location.hash === hash) renderApp();
    else location.hash = hash;
}

// ==================== STATE ====================

const APP = { data: null };

// ==================== NAV (hamburger drawer) ====================

function setupNav() {
    const menuBtn = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('navCloseBtn');
    const scrim = document.getElementById('navScrim');
    const drawer = document.getElementById('navDrawer');
    const refresh = document.getElementById('refreshBtn');

    const open = () => {
        drawer.classList.add('open');
        scrim.classList.remove('hidden');
        requestAnimationFrame(() => scrim.classList.add('show'));
    };
    const close = () => {
        drawer.classList.remove('open');
        scrim.classList.remove('show');
        setTimeout(() => scrim.classList.add('hidden'), 200);
    };

    menuBtn?.addEventListener('click', open);
    closeBtn?.addEventListener('click', close);
    scrim?.addEventListener('click', close);
    refresh?.addEventListener('click', () => location.reload());

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });

    document.getElementById('navItems').addEventListener('click', (e) => {
        const link = e.target.closest('[data-route]');
        if (!link) return;
        e.preventDefault();
        navigate(link.getAttribute('data-route'));
        close();
    });
}

function renderNav(data) {
    const isActive = (hash) => location.hash === hash || (hash === '#/' && !location.hash);
    const classrooms = data.classrooms || [];
    const preK = classrooms.filter(c => c.grade === 'PreK');
    const kinder = classrooms.filter(c => c.grade === 'Kindergarten');

    const item = (hash, icon, label, sub = '') => `
        <a href="${hash}" data-route="${hash}" class="nav-item touch-row ${isActive(hash) ? 'active' : ''}">
            <span class="icon"><i class="fas ${icon}"></i></span>
            <span class="flex-1">
                <div>${label}</div>
                ${sub ? `<div class="text-[11px] text-slate-500 font-normal">${sub}</div>` : ''}
            </span>
            ${isActive(hash) ? '<i class="fas fa-chevron-right text-[11px] text-blue-500"></i>' : ''}
        </a>`;

    const classroomItem = (c) => item(
        `#/c/${c.id}`,
        c.icon || 'fa-chalkboard-user',
        c.label + (c.isFamily ? ' <span class="family-badge">Family</span>' : ''),
        c.teacher?.name || ''
    );

    document.getElementById('navItems').innerHTML = `
        ${item('#/', 'fa-house', 'Home', 'Today & quick links')}
        <div class="nav-section-label">PreK</div>
        ${preK.map(classroomItem).join('') || '<div class="px-5 py-2 text-xs text-slate-400">None configured</div>'}
        <div class="nav-section-label">Kindergarten</div>
        ${kinder.map(classroomItem).join('') || '<div class="px-5 py-2 text-xs text-slate-400">None configured</div>'}
    `;

    document.getElementById('navLastUpdated').textContent =
        data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : '—';
}

function setTopbar(title, subtitle) {
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = subtitle || '';
}

// ==================== SHARED RENDER COMPONENTS ====================

function renderAnnouncement(data) {
    if (!data.announcement) return '';
    return `
    <div class="announce-banner">
        <i class="fas fa-bullhorn"></i>
        <span>${data.announcement}</span>
    </div>`;
}

function todayChips(data) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const isWednesday = dayOfWeek === 3;
    const isFriday = dayOfWeek === 5;
    const todaysEvent = (data.schoolEvents || []).find(e => isToday(e.date));
    const chips = [];
    if (todaysEvent) chips.push(`<span class="hero-chip"><i class="fas ${eventIcon(todaysEvent.type)}"></i>${todaysEvent.title}</span>`);
    if (isWednesday) chips.push(`<span class="hero-chip"><i class="fas fa-clock"></i>Late Start · 9:00 AM</span>`);
    if (isFriday) chips.push(`<span class="hero-chip"><i class="fas fa-shirt"></i>Spirit Day</span>`);
    return chips;
}

function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function renderShowAndShareItem(item) {
    const isTodayItem = isToday(item.date);
    const day = shortDay(item.date);
    const md = monthDay(item.date);
    let bg, border, text, icon;

    if (isTodayItem) {
        bg = 'bg-amber-50'; border = 'border-amber-400 ring-2 ring-amber-300'; text = 'text-amber-900';
        icon = item.isHoliday ? 'fa-calendar-xmark text-rose-600' : item.hasStudent ? 'fa-star text-amber-600' : 'fa-minus-circle text-slate-400';
    } else if (item.isHoliday) {
        bg = 'bg-rose-50'; border = 'border-rose-200'; text = 'text-rose-900'; icon = 'fa-calendar-xmark text-rose-500';
    } else if (item.hasStudent) {
        bg = 'bg-slate-50'; border = 'border-slate-200'; text = 'text-slate-800'; icon = 'fa-star text-blue-600';
    } else {
        bg = 'bg-white'; border = 'border-slate-100'; text = 'text-slate-400'; icon = 'fa-minus-circle text-slate-300';
    }

    return `
    <div class="p-2.5 rounded-xl border ${bg} ${border} touch-row">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="text-center min-w-[40px]">
                    <div class="text-[10px] font-bold uppercase tracking-wider ${isTodayItem ? 'text-amber-700' : 'text-slate-500'}">${day}</div>
                    <div class="text-xs font-bold ${isTodayItem ? 'text-amber-900' : 'text-slate-700'}">${md}</div>
                </div>
                <div class="flex items-center gap-2">
                    <i class="fas ${icon} text-sm"></i>
                    <span class="text-sm font-semibold ${text}">${item.studentName}</span>
                </div>
            </div>
            ${isTodayItem ? '<span class="today-pill">TODAY</span>' : ''}
        </div>
    </div>`;
}

function renderShowAndShare(data) {
    const now = new Date();
    const week = getCurrentWeekShowAndShare(data.schoolEvents);
    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-star"></i></span>
            <span>Show &amp; Share — This Week</span>
        </div>
        <div class="space-y-2">${week.map(renderShowAndShareItem).join('')}</div>
        <p class="text-[10px] text-slate-400 mt-3 text-center uppercase tracking-wider">
            ${now.getDay() === 5 && now.getHours() >= 17 ? 'Showing next week' : 'Updates Fri 5 PM'}
        </p>
    </section>`;
}

function renderEventCard(event) {
    const todayFlag = isToday(event.date);
    const d = normalizeDate(event.date);
    return `
    <div class="event-row ${todayFlag ? 'event-today' : ''}">
        <div class="event-date">
            <div class="event-month">${d ? d.toLocaleDateString('en-US', { month: 'short' }) : ''}</div>
            <div class="event-day">${d ? d.getDate() : ''}</div>
            <div class="event-dow">${shortDay(event.date)}</div>
        </div>
        <div class="flex-1 min-w-0 py-0.5">
            <div class="flex items-center gap-2">
                <h3 class="font-bold text-sm text-slate-800 leading-snug">${event.title}</h3>
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                <span class="flex items-center gap-1"><i class="fas ${eventIcon(event.type)} text-[10px]"></i>${daysUntil(event.date)}</span>
                ${event.location ? `<span class="flex items-center gap-1"><i class="fas fa-location-dot text-[10px]"></i>${event.location}</span>` : ''}
            </div>
        </div>
        ${todayFlag ? '<span class="today-pill self-center">TODAY</span>' : ''}
    </div>`;
}

function renderUpcomingEvents(data, opts = {}) {
    const limit = opts.limit ?? 6;
    const classroom = opts.classroom || null;
    const events = (classroom ? relevantEvents(data, classroom) : (data.schoolEvents || []).filter(isUpcoming))
                    .slice(0, limit);
    const title = classroom ? `Coming Up for ${classroom.shortLabel || classroom.label}` : 'Coming Up at School';
    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-calendar-days"></i></span>
            <span>${title}</span>
        </div>
        ${events.length ? `<div class="space-y-2">${events.map(renderEventCard).join('')}</div>`
                       : `<p class="text-sm text-slate-500">Nothing scheduled${classroom ? ' for this class' : ''} — check back soon.</p>`}
    </section>`;
}

function renderImportantDates(data) {
    if (!data.weeklyEmail.importantDates?.length) return '';
    return `
    <section class="section-card dates-card">
        <div class="section-header" style="color:#78350f;">
            <span class="icon-pill" style="background:#fde68a;color:#92400e;"><i class="fas fa-calendar-check"></i></span>
            <span>Important Dates</span>
        </div>
        <ul class="space-y-1.5">
            ${data.weeklyEmail.importantDates.map(d => `
                <li class="flex items-start gap-2 text-sm text-amber-950">
                    <span class="text-amber-500 mt-0.5 font-bold">·</span><span class="flex-1">${d}</span>
                </li>`).join('')}
        </ul>
    </section>`;
}

function renderDocuments(data, audience, opts = {}) {
    const docs = docsFor(data, audience);
    if (!docs.length) return '';
    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-folder-open"></i></span>
            <span>${opts.title || 'Documents & Forms'}</span>
        </div>
        <div class="space-y-2">
            ${docs.map(d => `
            <a href="${d.url}" target="_blank" rel="noopener" class="doc-card touch-row">
                <span class="doc-card-icon ${docTint(d.type)}"><i class="fas ${docIcon(d.type)}"></i></span>
                <span class="flex-1 min-w-0">
                    <span class="flex items-center gap-2">
                        <span class="font-bold text-sm text-slate-800 leading-snug">${d.label}</span>
                        ${isNewDoc(d) ? '<span class="new-pill">NEW</span>' : ''}
                    </span>
                    <span class="block text-[11px] text-slate-500 mt-0.5">Added ${formatDate(d.uploadedAt?.slice(0,10))} · tap to open</span>
                </span>
                <i class="fas fa-arrow-up-right-from-square text-[11px] text-slate-400"></i>
            </a>`).join('')}
        </div>
    </section>`;
}

function renderLinkTiles(links) {
    if (!links?.length) return '';
    return `
    <div class="link-grid">
        ${links.map(r => `
        <a href="${r.url || '#'}" target="_blank" rel="noopener noreferrer" class="link-tile touch-row">
            <span class="link-tile-icon"><i class="fas ${r.icon || 'fa-link'}"></i></span>
            <span class="text-[13px] font-bold text-slate-700 leading-tight">${r.label}</span>
        </a>`).join('')}
    </div>`;
}

function renderSchoolLinks(data) {
    if (!data.schoolLinks?.length) return '';
    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-link"></i></span>
            <span>Quick Links</span>
        </div>
        ${renderLinkTiles(data.schoolLinks)}
    </section>`;
}

// ==================== LANDING PAGE ====================

function renderLanding(data) {
    setTopbar('Harding Academy', 'Kivett Family');
    const classrooms = data.classrooms || [];
    const now = new Date();
    const chips = todayChips(data);

    const tile = (c) => {
        const nx = nextThingForTile(data, c);
        const sub = c.teacher?.name ? c.teacher.name : c.grade;
        return `
        <a href="#/c/${c.id}" data-route="#/c/${c.id}" class="class-card chip-${c.color || 'gray'}">
            <div class="class-card-avatar"><i class="fas ${c.icon || 'fa-chalkboard-user'}"></i></div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-extrabold text-[15px] leading-tight">${c.label}</span>
                    ${c.isFamily ? '<span class="family-badge">Family</span>' : ''}
                </div>
                <div class="text-[12px] opacity-75 truncate mt-0.5">${sub}</div>
                ${nx ? `
                <div class="tile-next mt-2 flex items-center gap-1.5 text-[11px]">
                    <i class="fas ${nx.kind === 'sas' ? 'fa-star' : 'fa-calendar-days'} opacity-70"></i>
                    <span class="font-bold whitespace-nowrap">${daysUntil(nx.date)}</span>
                    <span class="opacity-80 truncate">· ${nx.label}</span>
                </div>` : ''}
            </div>
            <i class="fas fa-chevron-right text-sm opacity-40"></i>
        </a>`;
    };

    const preK = classrooms.filter(c => c.grade === 'PreK');
    const kinder = classrooms.filter(c => c.grade === 'Kindergarten');

    return `
    ${renderAnnouncement(data)}
    <div class="px-4 py-4 space-y-5 page-enter">

        <!-- Hero -->
        <div class="today-hero">
            <div class="relative z-10">
                <div class="hero-eyebrow">${greeting()}, Kivett family</div>
                <div class="flex items-end justify-between gap-3 mt-1">
                    <div>
                        <div class="text-[26px] font-extrabold leading-none">${longDay(now)}</div>
                        <div class="text-sm text-blue-100 mt-1.5">${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                    <div class="hero-daynum">${now.getDate()}</div>
                </div>
                ${chips.length ? `<div class="flex flex-wrap gap-1.5 mt-3.5">${chips.join('')}</div>` : ''}
            </div>
        </div>

        <!-- Classrooms -->
        <div>
            <div class="home-section-title"><i class="fas fa-seedling"></i> PreK</div>
            <div class="grid grid-cols-1 gap-2.5">
                ${preK.map(tile).join('') || '<p class="text-sm text-slate-400 px-1">None configured.</p>'}
            </div>
            <div class="home-section-title mt-5"><i class="fas fa-pencil"></i> Kindergarten</div>
            <div class="grid grid-cols-1 gap-2.5">
                ${kinder.map(tile).join('') || '<p class="text-sm text-slate-400 px-1">None configured.</p>'}
            </div>
        </div>

        ${renderDocuments(data, 'school', { title: 'School Documents & Forms' })}
        ${renderSchoolLinks(data)}
        ${renderImportantDates(data)}
        ${renderUpcomingEvents(data, { limit: 3 })}

        <div class="footer-note">
            <img src="/img/hawk-head.png" alt="" class="w-6 h-6 mx-auto mb-1.5 opacity-60">
            Go Hawks · Last updated ${data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
        </div>
    </div>`;
}

// ==================== CLASSROOM PAGE ====================

function renderClassroomPage(data, classroomId) {
    const c = (data.classrooms || []).find(x => x.id === classroomId);
    if (!c) return renderNotFound(classroomId);

    setTopbar(c.shortLabel || c.label, c.grade);
    const isKivett = c.id === 'kinder-kivett';
    const note = c.weeklyExcerpt || (isKivett ? data.weeklyEmail.kindergartenExcerpt : '');

    // --- Hero header ---
    const hero = `
    <div class="class-hero hero-${c.color || 'gray'}">
        <div class="relative z-10 flex items-center gap-3.5">
            <div class="class-hero-avatar"><i class="fas ${c.icon || 'fa-chalkboard-user'}"></i></div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center flex-wrap gap-1.5">
                    <span class="text-lg font-extrabold leading-tight">${c.label}</span>
                    ${c.isFamily ? '<span class="family-badge">Family</span>' : ''}
                </div>
                <div class="text-[12px] opacity-85 mt-0.5">
                    ${c.teacher?.name ? `${c.teacher.name}` : c.grade}${c.teacher?.room ? ` · Room ${c.teacher.room}` : ''}
                </div>
            </div>
        </div>
        ${c.teacher?.email ? `
        <a href="mailto:${c.teacher.email}" class="hero-mail-btn relative z-10">
            <i class="fas fa-envelope"></i> Email ${c.teacher.name ? c.teacher.name.split(' ')[0] : 'teacher'}
        </a>` : ''}
    </div>`;

    // --- This week's note ---
    const noteCard = `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-pen-nib"></i></span>
            <span>This Week's Note</span>
            ${data.weeklyEmail.week ? `<span class="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-wider">${data.weeklyEmail.week}</span>` : ''}
        </div>
        ${note ? `
        <div class="note-bubble">${note}</div>` : `
        <p class="text-sm text-slate-500 italic">No note for this week yet — check back soon.</p>`}
    </section>`;

    // --- Show & share ---
    const sasCard = c.showAndShareEnabled ? renderShowAndShare(data) : '';

    // --- Documents for this classroom ---
    const docsCard = renderDocuments(data, c.id, { title: `${c.shortLabel || c.label} Documents` });

    // --- Events ---
    const eventsCard = renderUpcomingEvents(data, { limit: 5, classroom: c });

    // --- Links ---
    const linksCard = c.resources?.length ? `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-link"></i></span>
            <span>Helpful Links</span>
        </div>
        ${renderLinkTiles(c.resources)}
    </section>` : '';

    // --- Daily schedule timeline ---
    const scheduleCard = c.dailySchedule?.length ? `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-clock"></i></span>
            <span>Daily Routine</span>
        </div>
        <div class="timeline">
            ${c.dailySchedule.map(s => `
            <div class="timeline-row">
                <div class="timeline-time">${s.time}</div>
                <div class="timeline-dot"></div>
                <div class="timeline-activity">${s.activity}</div>
            </div>`).join('')}
        </div>
    </section>` : '';

    return `
    ${renderAnnouncement(data)}
    <div class="px-4 py-4 space-y-4 page-enter">
        ${hero}
        ${noteCard}
        ${docsCard}
        ${sasCard}
        ${eventsCard}
        ${linksCard}
        ${scheduleCard}
        <a href="#/" data-route="#/" class="back-home touch-row">
            <i class="fas fa-arrow-left"></i> Back to Home
        </a>
    </div>`;
}

function renderNotFound(id) {
    setTopbar('Not Found', '');
    return `
    <div class="px-6 py-12 text-center page-enter">
        <img src="/img/hawk-body.png" alt="" class="w-28 h-auto mx-auto opacity-50 mb-4">
        <h2 class="text-lg font-extrabold text-slate-700">Classroom not found</h2>
        <p class="text-sm text-slate-500 mt-1">We couldn't find that page.</p>
        <a href="#/" data-route="#/" class="inline-block mt-4 px-5 py-2.5 bg-[var(--navy)] text-white rounded-xl text-sm font-bold shadow">
            <i class="fas fa-arrow-left mr-1.5"></i>Back to Home
        </a>
    </div>`;
}

// ==================== MAIN RENDER ====================

function renderApp() {
    if (!APP.data) return;
    renderNav(APP.data);
    const route = currentRoute();
    const root = document.getElementById('root');
    let html = '';
    if (route.name === ROUTES.classroom) {
        html = renderClassroomPage(APP.data, route.classroomId);
    } else {
        html = renderLanding(APP.data);
    }
    root.innerHTML = html;
    root.addEventListener('click', mainClickHandler);
    window.scrollTo({ top: 0, behavior: 'instant' });
}

function mainClickHandler(e) {
    const link = e.target.closest('[data-route]');
    if (!link) return;
    e.preventDefault();
    navigate(link.getAttribute('data-route'));
}

// ==================== INIT ====================

setupNav();
window.addEventListener('hashchange', renderApp);

loadDashboardData()
    .then(data => { APP.data = data; renderApp(); })
    .catch(error => {
        console.error('Dashboard init failed:', error);
        document.getElementById('root').innerHTML = `
        <div class="px-6 py-12 text-center">
            <img src="/img/hawk-body.png" alt="" class="w-28 h-auto mx-auto opacity-50 mb-4">
            <i class="fas fa-triangle-exclamation text-2xl text-rose-400 mb-2"></i>
            <h2 class="text-lg font-extrabold text-slate-700">Couldn't load the dashboard</h2>
            <p class="text-sm text-slate-500 mt-1">Please refresh to try again.</p>
        </div>`;
    });
