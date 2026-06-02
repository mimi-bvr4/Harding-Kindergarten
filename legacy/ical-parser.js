// Simple ICS parser for browser use
function parseICS(icsContent) {
    const events = [];
    const lines = icsContent.split(/\r?\n/);

    let currentEvent = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === 'BEGIN:VEVENT') {
            currentEvent = {};
        } else if (line === 'END:VEVENT' && currentEvent) {
            // Only include relevant events
            if (currentEvent.summary && currentEvent.date) {
                const summary = currentEvent.summary;

                // Skip sports events
                if (summary.includes('Basketball') ||
                    summary.includes('Soccer') ||
                    summary.includes('Volleyball') ||
                    summary.includes('Game') ||
                    summary.includes('Practice')) {
                    currentEvent = null;
                    continue;
                }

                // Skip grade-specific events (not for kindergarten)
                if (summary.match(/Gr\.\s*[1-8]/i) || // Gr. 1-8
                    summary.match(/Grade\s*[1-8]/i) || // Grade 1-8
                    summary.includes('Middle School') ||
                    summary.includes('2nd grade') ||
                    summary.includes('3rd grade') ||
                    summary.includes('4th grade') ||
                    summary.includes('5th grade') ||
                    summary.includes('6th grade') ||
                    summary.includes('7th grade') ||
                    summary.includes('8th grade')) {
                    currentEvent = null;
                    continue;
                }

                // Skip administrative events
                if (summary.includes('Interims posted') ||
                    summary.includes('Re-enrollment') ||
                    summary.includes('Trimester ends') ||
                    summary.includes('reports posted')) {
                    currentEvent = null;
                    continue;
                }

                // Skip weekly recurring reminders (shown in header alerts)
                if (summary.includes('Late Start Wednesday')) {
                    currentEvent = null;
                    continue;
                }

                // Determine event type
                let type = 'event';
                if (summary.includes('SCHOOL HOLIDAY') || summary.includes('Break')) {
                    type = 'holiday';
                } else if (summary.includes('Conference') || summary.includes('Meeting')) {
                    type = 'meeting';
                } else if (summary.includes('Musical') || summary.includes('Concert')) {
                    type = 'event';
                } else if (summary.includes('Field Trip')) {
                    type = 'fieldtrip';
                } else if (summary.includes('Party') || summary.includes('Celebration')) {
                    type = 'party';
                }

                events.push({
                    date: currentEvent.date,
                    title: currentEvent.summary,
                    type: type,
                    location: currentEvent.location || ''
                });
            }
            currentEvent = null;
        } else if (currentEvent) {
            if (line.startsWith('DTSTART')) {
                // Extract date from DTSTART
                const match = line.match(/DTSTART[^:]*:(\d{8})/);
                if (match) {
                    const dateStr = match[1];
                    const year = dateStr.substring(0, 4);
                    const month = dateStr.substring(4, 6);
                    const day = dateStr.substring(6, 8);
                    currentEvent.date = `${year}-${month}-${day}`;
                }
            } else if (line.startsWith('SUMMARY:')) {
                currentEvent.summary = line.substring(8).trim();
                // Handle multi-line summaries
                let j = i + 1;
                while (j < lines.length && lines[j].startsWith(' ')) {
                    currentEvent.summary += lines[j].trim();
                    i = j;
                    j++;
                }
            } else if (line.startsWith('LOCATION:')) {
                currentEvent.location = line.substring(9).trim();
                // Handle multi-line locations
                let j = i + 1;
                while (j < lines.length && lines[j].startsWith(' ')) {
                    currentEvent.location += ' ' + lines[j].trim();
                    i = j;
                    j++;
                }
            }
        }
    }

    // Sort events by date
    events.sort((a, b) => a.date.localeCompare(b.date));

    // Filter to only 2026 events and from today forward
    const today = new Date().toISOString().split('T')[0];
    const events2026 = events.filter(e => e.date && e.date.startsWith('2026') && e.date >= today);

    return events2026;
}

// Load calendar from URL or file
async function loadCalendar(url) {
    try {
        // Try direct fetch first
        let response;
        try {
            response = await fetch(url);
        } catch (corsError) {
            // If CORS fails, try with a CORS proxy
            console.log('Direct fetch failed, trying CORS proxy...');
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            response = await fetch(proxyUrl);
        }

        const icsContent = await response.text();
        return parseICS(icsContent);
    } catch (error) {
        console.error('Error loading calendar:', error);
        return [];
    }
}
