/**
 * Dashboard Utilities
 * Shared date handling, formatting, and display helpers.
 */

// --- Date Normalization (single source of truth) ---

function normalizeDate(input) {
    if (!input) return null;
    if (input instanceof Date) {
        const d = new Date(input);
        d.setHours(0, 0, 0, 0);
        return d;
    }
    if (typeof input !== 'string') return null;
    const [year, month, day] = input.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

// --- Date Formatting ---

function formatDate(input) {
    const date = normalizeDate(input);
    if (!date) return 'Invalid Date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function shortDay(input) {
    const date = normalizeDate(input);
    if (!date) return '';
    return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function longDay(input) {
    const date = normalizeDate(input);
    if (!date) return '';
    return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function monthDay(input) {
    const date = normalizeDate(input);
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// --- Date Comparisons ---

function isToday(input) {
    const date = normalizeDate(input);
    if (!date) return false;
    return date.getTime() === today().getTime();
}

function isUpcoming(input) {
    const dateStr = typeof input === 'string' ? input : input?.date;
    const date = normalizeDate(dateStr);
    if (!date) return false;
    return date >= today();
}

function daysUntil(input) {
    const date = normalizeDate(input);
    if (!date) return '';
    const diff = Math.ceil((date - today()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 0) return 'Past';
    return `${diff} days`;
}

// --- Event Display Helpers ---

const EVENT_ICONS = {
    holiday: 'fa-calendar-xmark',
    meeting: 'fa-users',
    event: 'fa-star',
    party: 'fa-cake-candles',
    fieldtrip: 'fa-bus'
};

const EVENT_COLORS = {
    holiday: 'bg-red-100 text-red-700 border-red-300',
    meeting: 'bg-blue-100 text-blue-700 border-blue-300',
    event: 'bg-purple-100 text-purple-700 border-purple-300',
    party: 'bg-pink-100 text-pink-700 border-pink-300',
    fieldtrip: 'bg-yellow-100 text-yellow-700 border-yellow-300'
};

function eventIcon(type) {
    return EVENT_ICONS[type] || 'fa-calendar';
}

function eventColor(type) {
    return EVENT_COLORS[type] || 'bg-gray-100 text-gray-700 border-gray-300';
}

// --- Date String Helper ---

function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
