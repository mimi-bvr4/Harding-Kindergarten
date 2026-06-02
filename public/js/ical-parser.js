/**
 * iCal Feed Parser
 * Fetches and parses the Harding school calendar feed.
 * Uses the server-side proxy at /api/calendar (no CORS issues).
 */

// Event types to skip (sports, grade-specific, admin)
const SKIP_PATTERNS = [
    /Basketball|Soccer|Volleyball|Game|Practice/i,
    /Gr\.\s*[1-8]|Grade\s*[1-8]/i,
    /Middle School|2nd grade|3rd grade|4th grade|5th grade|6th grade|7th grade|8th grade/i,
    /Interims posted|Re-enrollment|Trimester ends|reports posted/i,
    /Late Start Wednesday/i
];

function shouldSkipEvent(summary) {
    return SKIP_PATTERNS.some(pattern => pattern.test(summary));
}

function classifyEvent(summary) {
    if (summary.includes('SCHOOL HOLIDAY') || summary.includes('Break')) return 'holiday';
    if (summary.includes('Conference') || summary.includes('Meeting')) return 'meeting';
    if (summary.includes('Field Trip')) return 'fieldtrip';
    if (summary.includes('Party') || summary.includes('Celebration')) return 'party';
    return 'event';
}

function parseICS(icsContent) {
    const events = [];
    const lines = icsContent.split(/\r?\n/);
    let current = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === 'BEGIN:VEVENT') {
            current = {};
        } else if (line === 'END:VEVENT' && current) {
            if (current.summary && current.date && !shouldSkipEvent(current.summary)) {
                events.push({
                    date: current.date,
                    title: current.summary,
                    type: classifyEvent(current.summary),
                    location: current.location || ''
                });
            }
            current = null;
        } else if (current) {
            if (line.startsWith('DTSTART')) {
                const match = line.match(/DTSTART[^:]*:(\d{8})/);
                if (match) {
                    const d = match[1];
                    current.date = `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
                }
            } else if (line.startsWith('SUMMARY:')) {
                current.summary = line.substring(8).trim();
                // Handle multi-line values (RFC 5545 folding)
                while (i + 1 < lines.length && lines[i + 1].startsWith(' ')) {
                    current.summary += lines[++i].trim();
                }
            } else if (line.startsWith('LOCATION:')) {
                current.location = line.substring(9).trim();
                while (i + 1 < lines.length && lines[i + 1].startsWith(' ')) {
                    current.location += ' ' + lines[++i].trim();
                }
            }
        }
    }

    // Sort and filter to current school year, from today forward
    const todayStr = toDateStr(new Date());
    return events
        .filter(e => e.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date));
}

async function loadCalendar() {
    try {
        const resp = await fetch('/api/calendar');
        if (resp.ok) {
            const icsText = await resp.text();
            const events = parseICS(icsText);
            console.log(`Calendar loaded (${events.length} events)`);
            return events;
        }
        console.warn('Calendar API returned', resp.status);
        return [];
    } catch (e) {
        console.warn('Calendar load failed:', e.message);
        return [];
    }
}
