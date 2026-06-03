/**
 * Harding Academy Parent Dashboard — v3
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
        classrooms: []
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

/**
 * Decide whether an event is relevant for a given classroom.
 * Heuristic: title matches the classroom's gradeKeywords, OR title matches
 * any of the all-school keywords. If a classroom has no gradeKeywords,
 * everything passes (back-compat).
 */
function isEventForClassroom(event, classroom, ctx = {}) {
    const title = (event.title || '').toLowerCase();
    const my  = (classroom?.gradeKeywords || []).map(s => s.toLowerCase());
    const all = (ctx.allSchoolKeywords || []).map(s => (s || '').toLowerCase());
    const other = (ctx.otherGradeKeywords || []).map(s => s.toLowerCase());
    if (!my.length) return true;

    // 1. My grade is named explicitly → include
    if (my.some(k => k && title.includes(k))) return true;
    // 2. A different grade is named explicitly → exclude (beats all-school catch-all)
    if (other.some(k => k && title.includes(k))) return false;
    // 3. All-school keyword → include
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

/**
 * Next upcoming Show & Share for the given classroom (only Kivett today).
 */
function nextShowAndShare(data, classroom) {
    if (!classroom?.showAndShareEnabled) return null;
    if (typeof SHOW_AND_SHARE_SCHEDULE === 'undefined') return null;
    const todayStr = toDateStr(today());
    const upcoming = SHOW_AND_SHARE_SCHEDULE
        .filter(s => s.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] || null;
}

/**
 * Most relevant "next thing" for a classroom tile preview.
 */
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
        // next tick for transition
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

    // ESC to close
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
        c.teacher?.name || (c.placeholder ? 'Tap to set up' : '')
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

function renderTodayStrip(data) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const isWednesday = dayOfWeek === 3;
    const isFriday = dayOfWeek === 5;
    const todaysEvent = (data.schoolEvents || []).find(e => isToday(e.date));

    if (!isWednesday && !isFriday && !todaysEvent) return '';

    return `
    <div class="today-strip">
        <div class="px-4 py-2.5 flex flex-wrap gap-2 items-center justify-center">
            ${todaysEvent ? `
                <div class="flex items-center gap-2 px-3 py-1.5 ${eventColor(todaysEvent.type)} border-2 rounded-full shadow-sm highlight-today text-xs">
                    <i class="fas ${eventIcon(todaysEvent.type)}"></i>
                    <span class="font-bold">${todaysEvent.title}</span>
                </div>` : ''}
            ${isWednesday && !todaysEvent ? `
                <div class="flex items-center gap-2 px-3 py-1.5 bg-blue-100 border-2 border-blue-400 rounded-full shadow-sm highlight-today text-xs">
                    <i class="fas fa-clock text-blue-700"></i>
                    <span class="font-bold text-blue-900">Late Start · 9:00 AM</span>
                </div>` : ''}
            ${isFriday && !todaysEvent ? `
                <div class="flex items-center gap-2 px-3 py-1.5 bg-green-100 border-2 border-green-500 rounded-full shadow-sm highlight-today text-xs">
                    <i class="fas fa-shirt text-green-700"></i>
                    <span class="font-bold text-green-900">Spirit Day</span>
                </div>` : ''}
        </div>
    </div>`;
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
            ${isTodayItem ? '<span class="text-[10px] bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full font-extrabold tracking-wide">TODAY</span>' : ''}
        </div>
    </div>`;
}

function renderShowAndShare(data) {
    const now = new Date();
    const week = getCurrentWeekShowAndShare(data.schoolEvents);
    return `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-presentation"></i></span>
            <span>Show & Share — This Week</span>
        </div>
        <div class="space-y-2">${week.map(renderShowAndShareItem).join('')}</div>
        <p class="text-[10px] text-slate-400 mt-3 text-center uppercase tracking-wider">
            ${now.getDay() === 5 && now.getHours() >= 17 ? 'Showing next week' : 'Updates Fri 5 PM'}
        </p>
    </section>`;
}

function renderEventCard(event) {
    const todayFlag = isToday(event.date);
    return `
    <div class="p-3 rounded-xl border-l-4 ${eventColor(event.type)} border ${todayFlag ? 'ring-2 ring-amber-300' : ''}">
        <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    <i class="fas ${eventIcon(event.type)} text-xs"></i>
                    <h3 class="font-semibold text-sm truncate">${event.title}</h3>
                </div>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                    <span class="flex items-center gap-1">
                        <i class="fas fa-calendar text-[10px]"></i>
                        ${formatDate(event.date)} · ${shortDay(event.date)}
                    </span>
                    ${event.location ? `<span class="flex items-center gap-1"><i class="fas fa-location-dot text-[10px]"></i>${event.location}</span>` : ''}
                </div>
            </div>
            ${todayFlag ? '<span class="text-[10px] bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full font-extrabold tracking-wide whitespace-nowrap">TODAY</span>' : ''}
        </div>
    </div>`;
}

function renderUpcomingEvents(data, opts = {}) {
    const limit = opts.limit ?? 6;
    const classroom = opts.classroom || null;
    const events = (classroom ? relevantEvents(data, classroom) : (data.schoolEvents || []).filter(isUpcoming))
                    .slice(0, limit);
    const title = classroom ? `Upcoming for ${classroom.shortLabel || classroom.label}` : 'Upcoming Events';
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
    <section class="section-card" style="background:linear-gradient(135deg,#fffbeb,#fef3c7); border-color:#fcd34d;">
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

// ==================== LANDING PAGE ====================

function renderLanding(data) {
    setTopbar('Home', 'Kivett Family');
    const classrooms = data.classrooms || [];
    const now = new Date();

    const tile = (c) => {
        const nx = nextThingForTile(data, c);
        const sub = c.teacher?.name ? c.teacher.name : (c.placeholder ? 'Tap to set up classroom info' : c.grade);
        return `
        <a href="#/c/${c.id}" data-route="#/c/${c.id}"
           class="section-card card-shadow chip chip-${c.color || 'gray'} flex items-center gap-3 p-3">
            <div class="tile-avatar">
                <i class="fas ${c.icon || 'fa-chalkboard-user'} text-lg"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-bold text-sm leading-tight">${c.label}</span>
                    ${c.isFamily ? '<span class="family-badge">Family</span>' : ''}
                </div>
                <div class="text-[11px] opacity-80 truncate mt-0.5">${sub}</div>
                ${nx ? `
                <div class="tile-next mt-1.5 flex items-center gap-1.5 text-[11px]">
                    <i class="fas ${nx.kind === 'sas' ? 'fa-star' : 'fa-calendar-days'} opacity-70"></i>
                    <span class="font-semibold whitespace-nowrap">${daysUntil(nx.date)}</span>
                    <span class="opacity-80 truncate">· ${nx.label}</span>
                </div>` : ''}
            </div>
            <i class="fas fa-chevron-right text-sm opacity-50"></i>
        </a>`;
    };

    const preK = classrooms.filter(c => c.grade === 'PreK');
    const kinder = classrooms.filter(c => c.grade === 'Kindergarten');

    return `
    ${renderTodayStrip(data)}
    <div class="px-4 py-4 space-y-4 page-enter">

        <!-- Today hero -->
        <div class="today-hero">
            <div class="gold-line"></div>
            <div class="flex items-start justify-between gap-3 relative z-10">
                <div class="min-w-0">
                    <div class="text-[10px] text-blue-200 font-bold uppercase tracking-[0.18em]">Today</div>
                    <div class="text-2xl font-extrabold leading-tight">${longDay(now)}</div>
                    <div class="text-sm text-blue-100 mt-0.5">
                        ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                </div>
                <div class="text-5xl font-extrabold leading-none text-white/95 flex-shrink-0">${now.getDate()}</div>
            </div>
        </div>

        <!-- Classroom tiles -->
        <div>
            <div class="section-eyebrow px-1 mb-2">PreK Classrooms</div>
            <div class="grid grid-cols-1 gap-2">
                ${preK.map(tile).join('') || '<p class="text-sm text-slate-400 px-1">None configured.</p>'}
            </div>
        </div>
        <div>
            <div class="section-eyebrow px-1 mb-2">Kindergarten Classrooms</div>
            <div class="grid grid-cols-1 gap-2">
                ${kinder.map(tile).join('') || '<p class="text-sm text-slate-400 px-1">None configured.</p>'}
            </div>
        </div>

        ${renderImportantDates(data)}
        ${renderUpcomingEvents(data, { limit: 3 })}

        <div class="text-center text-[11px] text-slate-400 pt-2">
            Last updated: ${data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : '—'}
        </div>
    </div>`;
}

// ==================== CLASSROOM PAGE ====================

function renderClassroomPage(data, classroomId) {
    const c = (data.classrooms || []).find(x => x.id === classroomId);
    if (!c) return renderNotFound(classroomId);

    setTopbar(c.label, c.grade);

    const isKivett = c.id === 'kinder-kivett';
    const isPlaceholder = !!c.placeholder;

    // Section 1: today / this week + email excerpt
    const section1 = `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-calendar-day"></i></span>
            <span>Today &amp; This Week</span>
        </div>
        ${data.weeklyEmail.week ? `<div class="text-[11px] text-slate-500 uppercase tracking-wider mb-2">${data.weeklyEmail.week}</div>` : ''}
        ${c.weeklyExcerpt ? `
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                ${c.weeklyExcerpt}
            </div>` : (isKivett && data.weeklyEmail.kindergartenExcerpt ? `
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                ${data.weeklyEmail.kindergartenExcerpt}
            </div>` : `
            <p class="text-sm text-slate-500 italic">No weekly excerpt added yet.</p>`)}
        ${data.weeklyEmail.highlights?.length ? `
            <div class="mt-3">
                <div class="section-eyebrow mb-1.5">Highlights</div>
                <ul class="space-y-1">
                    ${data.weeklyEmail.highlights.slice(0,4).map(h => `
                        <li class="flex items-start gap-2 text-sm text-slate-700">
                            <i class="fas fa-star text-amber-400 text-[10px] mt-1.5"></i><span class="flex-1">${h}</span>
                        </li>`).join('')}
                </ul>
            </div>` : ''}
    </section>`;

    // Section 2: show & share
    const section2 = c.showAndShareEnabled ? renderShowAndShare(data) :
        (isPlaceholder ? '' : `
        <section class="section-card">
            <div class="section-header" style="color:var(--ink-500)">
                <span class="icon-pill" style="background:#f1f5f9;color:#94a3b8;"><i class="fas fa-presentation"></i></span>
                <span>Show & Share</span>
            </div>
            <p class="text-sm text-slate-500">Not tracked for this classroom yet.</p>
        </section>`);

    // Section 3: upcoming events filtered to this classroom
    const section3 = renderUpcomingEvents(data, { limit: 5, classroom: c });

    // Section 4: classroom info
    const teacherBlock = c.teacher?.name ? `
        <div class="mb-3">
            <div class="section-eyebrow mb-1">Teacher</div>
            <div class="text-sm font-semibold text-slate-800">${c.teacher.name}</div>
            ${c.teacher.room ? `<div class="text-xs text-slate-500">Room ${c.teacher.room}</div>` : ''}
            ${c.teacher.email ? `<a href="mailto:${c.teacher.email}" class="text-xs link-blue">${c.teacher.email}</a>` : ''}
        </div>` : `
        <div class="mb-3">
            <div class="section-eyebrow mb-1">Teacher</div>
            <p class="text-sm text-slate-500 italic">Add teacher details in dashboard-data.json.</p>
        </div>`;

    const resourcesBlock = c.resources?.length ? `
        <div class="mb-3">
            <div class="section-eyebrow mb-2">Quick Links</div>
            <div class="space-y-1.5">
                ${c.resources.map(r => `
                    <a href="${r.url || '#'}" target="_blank" rel="noopener noreferrer"
                       class="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 active:bg-blue-50 touch-row transition">
                        <span class="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">
                            <i class="fas ${r.icon || 'fa-link'} text-sm"></i>
                        </span>
                        <span class="text-sm font-semibold text-slate-700 flex-1">${r.label}</span>
                        <i class="fas fa-arrow-up-right-from-square text-[11px] text-slate-400"></i>
                    </a>`).join('')}
            </div>
        </div>` : '';

    const scheduleBlock = c.dailySchedule?.length ? `
        <div>
            <div class="section-eyebrow mb-2">Daily Routine</div>
            <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
                ${c.dailySchedule.map((s, i) => `
                    <div class="flex items-center gap-3 px-3 py-2.5 ${i ? 'border-t border-slate-100' : ''}">
                        <div class="text-[11px] font-bold text-blue-700 w-20 flex-shrink-0 uppercase tracking-wide">${s.time}</div>
                        <div class="text-sm text-slate-700 flex-1">${s.activity}</div>
                    </div>`).join('')}
            </div>
        </div>` : '';

    const section4 = `
    <section class="section-card">
        <div class="section-header">
            <span class="icon-pill"><i class="fas fa-circle-info"></i></span>
            <span>Classroom Info</span>
        </div>
        ${teacherBlock}
        ${resourcesBlock}
        ${scheduleBlock}
        ${!c.resources?.length && !c.dailySchedule?.length ? `
            <p class="text-sm text-slate-500 italic">Add resources and a daily schedule in dashboard-data.json.</p>` : ''}
    </section>`;

    const placeholderBanner = isPlaceholder ? `
        <div class="mx-4 mt-3 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm flex items-start gap-2">
            <i class="fas fa-circle-info mt-0.5"></i>
            <div class="flex-1">
                <div class="font-bold">Placeholder classroom</div>
                <div class="text-xs mt-0.5">Edit <code>dashboard-data.json</code> to fill in teacher, resources, and daily schedule.</div>
            </div>
        </div>` : '';

    // Classroom header chip
    const familyBadge = c.isFamily ? '<span class="family-badge ml-2">Family</span>' : '';

    return `
    ${renderTodayStrip(data)}
    ${placeholderBanner}
    <div class="px-4 py-4 space-y-4 page-enter">
        <div class="section-card chip chip-${c.color || 'gray'} flex items-center gap-3">
            <div class="tile-avatar w-14 h-14" style="border-radius:16px;">
                <i class="fas ${c.icon || 'fa-chalkboard-user'} text-xl"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center flex-wrap">
                    <span class="font-extrabold leading-tight">${c.label}</span>
                    ${familyBadge}
                </div>
                <div class="text-[11px] opacity-80 mt-0.5">
                    ${c.grade}${c.teacher?.name ? ` · ${c.teacher.name}` : ''}
                </div>
            </div>
            <a href="#/" data-route="#/" class="px-3 py-1.5 rounded-full bg-white/70 text-[11px] font-bold hover:bg-white shadow-sm">
                <i class="fas fa-house mr-1"></i>Home
            </a>
        </div>
        ${section1}
        ${section2}
        ${section3}
        ${section4}
    </div>`;
}

function renderNotFound(id) {
    setTopbar('Not Found', '');
    return `
    <div class="px-6 py-12 text-center page-enter">
        <img src="/img/hawk-body.png" alt="" class="w-28 h-auto mx-auto opacity-50 mb-4">
        <h2 class="text-lg font-extrabold text-slate-700">Classroom not found</h2>
        <p class="text-sm text-slate-500 mt-1">No classroom with id <code>${id}</code>.</p>
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
            <details class="mt-4 text-left bg-rose-50 p-3 rounded-xl border border-rose-200">
                <summary class="cursor-pointer text-rose-700 text-xs font-semibold">Error details</summary>
                <pre class="mt-2 text-[11px] text-rose-900 overflow-auto">${error.message}</pre>
            </details>
        </div>`;
    });
