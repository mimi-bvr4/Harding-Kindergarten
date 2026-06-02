/**
 * Harding Academy Parent Dashboard - Main App
 * Componentized renderer. Each section is its own function.
 */

// ==================== DATA LOADING ====================

async function loadDashboardData() {
    let data = { weeklyEmail: { week: '', kindergartenExcerpt: '', highlights: [], importantDates: [] }, schoolEvents: [] };

    // Load weekly content from API
    try {
        const resp = await fetch('/api/data');
        if (resp.ok) {
            const apiData = await resp.json();
            data = { ...data, ...apiData };
        }
    } catch (e) {
        console.warn('API data load failed, using defaults');
    }

    // Load calendar events via server proxy (no CORS issues)
    try {
        const calendarEvents = await loadCalendar();
        if (calendarEvents?.length > 0) {
            data.schoolEvents = calendarEvents;
        }
    } catch (e) {
        console.error('Calendar load failed:', e);
    }

    return data;
}

// ==================== RENDER COMPONENTS ====================

function renderHeader(data) {
    const now = new Date();
    return `
    <header class="gradient-header text-white shadow-lg">
        <div class="max-w-7xl mx-auto px-4 py-6">
            <div class="flex items-center justify-between flex-wrap gap-4">
                <div class="flex items-center gap-4">
                    <div>
                        <h1 class="text-3xl font-bold">Harding Academy</h1>
                        <p class="text-blue-200 mt-1">Kivett Family Dashboard</p>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-3">
                    <div class="flex items-center gap-4">
                        <div class="text-2xl text-blue-100 font-semibold">${longDay(now)}</div>
                        <div class="text-2xl font-bold">${now.toLocaleDateString('en-US', { month: 'long' })}</div>
                        <div class="text-6xl font-bold leading-none">${now.getDate()}</div>
                    </div>
                    ${data.weeklyEmail.compassUrl ? `
                        <a href="${data.weeklyEmail.compassUrl}" target="_blank" rel="noopener noreferrer"
                           class="inline-flex items-center gap-2 px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-lg transition border border-white border-opacity-30">
                            <i class="fas fa-compass text-sm"></i>
                            <span class="text-sm font-medium">Compass Connection</span>
                            <i class="fas fa-external-link text-xs"></i>
                        </a>
                    ` : ''}
                </div>
            </div>
        </div>
    </header>`;
}

function renderTodayBanner(data) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const isWednesday = dayOfWeek === 3;
    const isFriday = dayOfWeek === 5;
    const todaysEvent = data.schoolEvents.find(e => isToday(e.date));

    if (!isWednesday && !isFriday && !todaysEvent) return '';

    return `
    <div class="bg-gradient-to-r from-yellow-50 via-orange-50 to-yellow-50 border-b-2 border-yellow-400">
        <div class="max-w-7xl mx-auto px-4 py-4">
            <div class="flex flex-wrap gap-3 items-center justify-center">
                ${todaysEvent ? `
                    <div class="flex items-center gap-2 px-4 py-2 ${eventColor(todaysEvent.type)} border-2 rounded-lg shadow highlight-today">
                        <i class="fas ${eventIcon(todaysEvent.type)} text-xl"></i>
                        <span class="font-bold">${todaysEvent.title}</span>
                        ${todaysEvent.location ? `<span class="text-sm">${todaysEvent.location}</span>` : ''}
                    </div>
                ` : ''}
                ${isWednesday && !todaysEvent ? `
                    <div class="flex items-center gap-2 px-4 py-2 bg-blue-100 border-2 border-blue-400 rounded-lg shadow highlight-today">
                        <i class="fas fa-clock text-blue-600 text-xl"></i>
                        <span class="font-bold text-blue-900">Late Start Today!</span>
                        <span class="text-blue-700">School begins at 9:00 AM</span>
                    </div>
                ` : ''}
                ${isFriday && !todaysEvent ? `
                    <div class="flex items-center gap-2 px-4 py-2 bg-green-100 border-2 border-green-400 rounded-lg shadow highlight-today">
                        <i class="fas fa-shirt text-green-600 text-xl"></i>
                        <span class="font-bold text-green-900">Spirit Day!</span>
                        <span class="text-green-700">Wear school t-shirt & uniform bottoms</span>
                    </div>
                ` : ''}
            </div>
        </div>
    </div>`;
}

function renderImportantDates(data) {
    if (!data.weeklyEmail.importantDates?.length) return '';

    return `
    <div class="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-lg card-shadow p-4 border-l-4 border-amber-500">
        <h2 class="text-lg font-bold text-amber-900 mb-3 flex items-center gap-2">
            <i class="fas fa-calendar-check text-amber-600"></i>
            Important Dates
        </h2>
        <ul class="space-y-2">
            ${data.weeklyEmail.importantDates.map(item => `
                <li class="flex items-start gap-2 text-sm text-gray-700">
                    <span class="text-amber-500 mt-0.5">&bull;</span>
                    <span class="flex-1">${item}</span>
                </li>
            `).join('')}
        </ul>
    </div>`;
}

function renderShowAndShareItem(item) {
    const isTodayItem = isToday(item.date);
    const day = shortDay(item.date);
    const md = monthDay(item.date);

    let bg, border, text, icon;

    if (isTodayItem) {
        bg = 'bg-yellow-100'; border = 'border-yellow-400 ring-2 ring-yellow-400'; text = 'text-yellow-900';
        icon = item.isHoliday ? 'fa-calendar-xmark text-red-600' : item.hasStudent ? 'fa-star text-purple-600' : 'fa-minus-circle text-gray-400';
    } else if (item.isHoliday) {
        bg = 'bg-red-50'; border = 'border-red-300'; text = 'text-red-900'; icon = 'fa-calendar-xmark text-red-600';
    } else if (item.hasStudent) {
        bg = 'bg-blue-50'; border = 'border-blue-300'; text = 'text-blue-900'; icon = 'fa-star text-blue-600';
    } else {
        bg = 'bg-white'; border = 'border-gray-200'; text = 'text-gray-500'; icon = 'fa-minus-circle text-gray-400';
    }

    return `
    <div class="p-2 rounded-lg border ${bg} ${border}">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <div class="text-center min-w-[50px]">
                    <div class="text-xs font-medium ${isTodayItem ? 'text-yellow-700' : 'text-gray-500'}">${day}</div>
                    <div class="text-xs font-semibold ${isTodayItem ? 'text-yellow-900' : 'text-gray-700'}">${md}</div>
                </div>
                <div class="flex items-center gap-1.5">
                    <i class="fas ${icon}"></i>
                    <span class="text-sm font-semibold ${text}">${item.studentName}</span>
                </div>
            </div>
            ${isTodayItem ? '<span class="text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full font-bold">TODAY</span>' : ''}
        </div>
    </div>`;
}

function renderShowAndShare(data) {
    const now = new Date();
    const week = getCurrentWeekShowAndShare(data.schoolEvents);

    return `
    <div class="bg-gradient-to-br from-gray-50 to-slate-50 rounded-lg card-shadow p-4 border-l-4 border-gray-400">
        <h2 class="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <i class="fas fa-presentation text-gray-600"></i>
            Show & Share
        </h2>
        <div class="space-y-2">
            ${week.map(renderShowAndShareItem).join('')}
        </div>
        <p class="text-xs text-gray-500 mt-2 text-center">
            ${now.getDay() === 5 && now.getHours() >= 17 ? 'Next week' : 'Updates Fri 5pm'}
        </p>
    </div>`;
}

function renderEventCard(event) {
    const todayFlag = isToday(event.date);
    return `
    <div class="p-3 rounded-lg border-l-4 ${eventColor(event.type)} border ${todayFlag ? 'ring-2 ring-yellow-400' : ''}">
        <div class="flex items-start justify-between">
            <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                    <i class="fas ${eventIcon(event.type)}"></i>
                    <h3 class="font-semibold text-sm">${event.title}</h3>
                    ${todayFlag ? '<span class="text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full font-bold">TODAY</span>' : ''}
                </div>
                <div class="flex items-center gap-2 text-xs mt-1">
                    <span class="flex items-center gap-1">
                        <i class="fas fa-calendar text-xs"></i>
                        ${formatDate(event.date)} (${shortDay(event.date)})
                    </span>
                    ${event.location ? `
                        <span class="flex items-center gap-1">
                            <i class="fas fa-location-dot text-xs"></i>
                            ${event.location}
                        </span>
                    ` : ''}
                </div>
            </div>
        </div>
    </div>`;
}

function renderUpcomingEvents(data) {
    const events = data.schoolEvents.filter(isUpcoming).slice(0, 10);
    if (!events.length) return '';

    const visible = events.slice(0, 2);
    const hidden = events.slice(2);

    return `
    <div class="bg-white rounded-lg card-shadow p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <i class="fas fa-calendar-days text-blue-600"></i>
            Upcoming Events
        </h2>
        <div class="space-y-3">
            ${visible.map(renderEventCard).join('')}
        </div>
        ${hidden.length ? `
            <div id="moreEventsContainer" class="hidden space-y-3 mt-3">
                ${hidden.map(renderEventCard).join('')}
            </div>
            <button onclick="toggleEvents()" id="toggleEventsBtn"
                    class="w-full mt-3 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition text-sm font-medium">
                <i class="fas fa-chevron-down mr-2"></i>Show ${hidden.length} More Events
            </button>
        ` : ''}
    </div>`;
}

function renderNewsletter(data) {
    const email = data.weeklyEmail;
    const hasContent = email.emailUrl || email.kindergartenExcerpt || email.highlights?.length;

    return `
    <div class="bg-white rounded-lg card-shadow p-6">
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">
                <i class="fas fa-envelope-open-text text-yellow-600"></i>
                Weekly Newsletter
            </h2>
            ${email.week ? `<span class="text-sm text-gray-500">${email.week}</span>` : ''}
        </div>
        ${email.emailUrl ? `
            <div class="mb-4">
                <a href="${email.emailUrl}" target="_blank" rel="noopener noreferrer"
                   class="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-200 transition text-sm">
                    <i class="fas fa-external-link"></i> View Full Email
                </a>
            </div>
        ` : ''}
        ${email.kindergartenExcerpt ? `
            <div class="mb-4 p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
                <h3 class="font-bold text-purple-900 mb-3 flex items-center gap-2">
                    <i class="fas fa-graduation-cap text-purple-600"></i>
                    Kindergarten This Week
                </h3>
                <div class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">${email.kindergartenExcerpt}</div>
            </div>
        ` : ''}
        ${email.highlights?.length ? `
            <div class="mb-4">
                <h3 class="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <i class="fas fa-star text-yellow-500 text-sm"></i> Highlights
                </h3>
                <ul class="space-y-2">
                    ${email.highlights.map(h => `
                        <li class="flex items-start gap-2 text-gray-700">
                            <span class="text-yellow-500 mt-1">&bull;</span>
                            <span>${h}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        ` : ''}
        ${!hasContent ? `
            <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
                <p class="text-sm text-gray-500"><i class="fas fa-info-circle mr-2"></i>No newsletter content added for this week yet.</p>
            </div>
        ` : ''}
    </div>`;
}

function renderSidebar(data) {
    return `
    <div class="space-y-6">
        <!-- Weekly Dismissal Form -->
        <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg card-shadow p-5 border-2 border-blue-300">
            <h2 class="text-lg font-bold text-blue-900 mb-2 flex items-center gap-2">
                <i class="fas fa-car-side text-blue-600"></i>
                Weekly Dismissal Form
            </h2>
            <p class="text-sm text-gray-600 mb-3">Submit your child's weekly dismissal plan.</p>
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSf0ZxMKD-qzCMVHG98KHEINJuAcsnnvlIxsniv8aPx96s74cA/viewform"
               target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium w-full justify-center">
                <i class="fas fa-clipboard-list"></i> Fill Out Form
            </a>
        </div>

        <!-- Volunteer Signups -->
        <div class="bg-white rounded-lg card-shadow p-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <i class="fas fa-hands-helping text-green-600"></i>
                Volunteer Signups
            </h2>
            <div class="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                <h3 class="font-semibold text-green-900 mb-2 flex items-center gap-2">
                    <i class="fas fa-book-open"></i> Reading/Cooking in K
                </h3>
                <p class="text-sm text-gray-600 mb-3">Sign up to help with reading or cooking activities!</p>
                <a href="https://www.signupgenius.com/go/10C0A4CADA62FA0FFC07-58545046-kivett#/"
                   target="_blank" rel="noopener noreferrer"
                   class="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">
                    <i class="fas fa-external-link"></i> View & Sign Up
                </a>
            </div>
            <div class="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h3 class="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                    <i class="fas fa-users"></i> HPA Volunteer Lists
                </h3>
                <p class="text-sm text-gray-600 mb-3">HPA volunteer opportunities!</p>
                <a href="https://www.signupgenius.com/go/30E0945A9A828A57-57688501-grade#/"
                   target="_blank" rel="noopener noreferrer"
                   class="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium">
                    <i class="fas fa-external-link"></i> View & Sign Up
                </a>
            </div>
        </div>

        <!-- School Year Dates -->
        <div class="bg-white rounded-lg card-shadow p-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <i class="fas fa-calendar-days text-orange-600"></i>
                2026-2027 School Year
            </h2>
            <div class="space-y-2 text-sm" id="schoolYearDates"></div>
        </div>
    </div>`;
}

function renderSchoolYearDates() {
    const dates = [
        ['First Day of Classes', 'August 19, 2026'],
        ['Labor Day', 'September 7, 2026'],
        ['Parent/Teacher Conferences', 'Oct 12-13, 2026'],
        ['Fall Break', 'Oct 14-16, 2026'],
        ['Thanksgiving Break', 'Nov 25-27, 2026'],
        ['Winter Break', 'Dec 21, 2026-Jan 1, 2027'],
        ['Classes Resume', 'January 4, 2027'],
        ['MLK, Jr. Day', 'January 18, 2027'],
        ['Parent/Teacher Conferences', 'Feb 25-26, 2027'],
        ['Spring Break', 'March 12-19, 2027'],
        ['Harding Art Show', 'April 29-May 1, 2027'],
        ['Last Day of Classes', 'May 27, 2027'],
        ['Graduation', 'May 28, 2027']
    ];

    const container = document.getElementById('schoolYearDates');
    if (!container) return;

    container.innerHTML = dates.map(([label, date], i) => `
        <div class="flex justify-between items-center py-2 ${i < dates.length - 1 ? 'border-b border-gray-100' : ''}">
            <span class="text-gray-600">${label}</span>
            <span class="font-semibold text-gray-800">${date}</span>
        </div>
    `).join('');
}

// ==================== MAIN RENDER ====================

function renderDashboard(data) {
    document.getElementById('root').innerHTML = `
    <div class="min-h-screen bg-gray-50">
        ${renderHeader(data)}
        ${renderTodayBanner(data)}
        <div class="max-w-7xl mx-auto px-4 py-8">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 space-y-6">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        ${renderImportantDates(data)}
                        ${renderShowAndShare(data)}
                    </div>
                    ${renderUpcomingEvents(data)}
                    ${renderNewsletter(data)}
                </div>
                ${renderSidebar(data)}
            </div>
            <div class="mt-8 text-center text-gray-500 text-sm">
                <p>Last updated: ${data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'N/A'}</p>
            </div>
        </div>
    </div>`;

    // Populate school year dates after DOM is ready
    renderSchoolYearDates();
}

// ==================== EVENT HANDLERS ====================

function toggleEvents() {
    const container = document.getElementById('moreEventsContainer');
    const btn = document.getElementById('toggleEventsBtn');
    if (!container || !btn) return;

    const isHidden = container.classList.contains('hidden');
    container.classList.toggle('hidden');
    const count = container.querySelectorAll('.p-3').length;
    btn.innerHTML = isHidden
        ? '<i class="fas fa-chevron-up mr-2"></i>Show Less'
        : `<i class="fas fa-chevron-down mr-2"></i>Show ${count} More Events`;
}

// ==================== INIT ====================

loadDashboardData()
    .then(renderDashboard)
    .catch(error => {
        console.error('Dashboard init failed:', error);
        document.getElementById('root').innerHTML = `
        <div class="min-h-screen bg-gray-50 flex items-center justify-center">
            <div class="text-center p-8">
                <h1 class="text-2xl font-bold text-gray-800 mb-4">Error Loading Dashboard</h1>
                <p class="text-gray-600 mb-4">Please refresh the page to try again.</p>
                <details class="text-left bg-red-50 p-4 rounded border border-red-200">
                    <summary class="cursor-pointer text-red-700 font-semibold">Error Details</summary>
                    <pre class="mt-2 text-xs text-red-900 overflow-auto">${error.message}</pre>
                </details>
            </div>
        </div>`;
    });
