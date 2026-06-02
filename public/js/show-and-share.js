/**
 * Show & Share Schedule Data
 * Extracted from the monolith. Update this file for each semester.
 * Student rotation: Aiden, Brooks, Charlotte, Cooper, Daisy, Doc, Dottie,
 * Ellison, Evie, Evie Clare, Grace, Harrison, Jhanvi, Leyton, Margo,
 * Mateo, Parker, Quinn, Venice, Wren
 */

const SHOW_AND_SHARE_SCHEDULE = [
    // January 2026
    { date: '2026-01-05', student: 'Aiden' },   { date: '2026-01-06', student: 'Brooks' },
    { date: '2026-01-07', student: 'Charlotte' },{ date: '2026-01-08', student: 'Cooper' },
    { date: '2026-01-09', student: 'Daisy' },    { date: '2026-01-12', student: 'Doc' },
    { date: '2026-01-13', student: 'Dottie' },   { date: '2026-01-14', student: 'Ellison' },
    { date: '2026-01-15', student: 'Evie' },     { date: '2026-01-16', student: 'Evie Clare' },
    { date: '2026-01-20', student: 'Grace' },    { date: '2026-01-21', student: 'Harrison' },
    { date: '2026-01-22', student: 'Jhanvi' },   { date: '2026-01-23', student: 'Leyton' },
    { date: '2026-01-26', student: 'Margo' },    { date: '2026-01-27', student: 'Mateo' },
    { date: '2026-01-28', student: 'Parker' },   { date: '2026-01-29', student: 'Quinn' },
    { date: '2026-01-30', student: 'Venice' },
    // February 2026
    { date: '2026-02-02', student: 'Wren' },     { date: '2026-02-03', student: 'Aiden' },
    { date: '2026-02-04', student: 'Brooks' },   { date: '2026-02-05', student: 'Charlotte' },
    { date: '2026-02-06', student: 'Cooper' },   { date: '2026-02-09', student: 'Daisy' },
    { date: '2026-02-10', student: 'Doc' },      { date: '2026-02-11', student: 'Dottie' },
    { date: '2026-02-12', student: 'Ellison' },  { date: '2026-02-17', student: 'Evie' },
    { date: '2026-02-18', student: 'Evie Clare' },{ date: '2026-02-19', student: 'Grace' },
    { date: '2026-02-20', student: 'Harrison' }, { date: '2026-02-23', student: 'Jhanvi' },
    { date: '2026-02-24', student: 'Leyton' },   { date: '2026-02-25', student: 'Margo' },
    { date: '2026-02-26', student: 'Mateo' },
    // March 2026
    { date: '2026-03-02', student: 'Parker' },   { date: '2026-03-03', student: 'Quinn' },
    { date: '2026-03-04', student: 'Venice' },   { date: '2026-03-05', student: 'Wren' },
    { date: '2026-03-06', student: 'Aiden' },    { date: '2026-03-09', student: 'Brooks' },
    { date: '2026-03-10', student: 'Charlotte' },{ date: '2026-03-11', student: 'Cooper' },
    { date: '2026-03-12', student: 'Daisy' },    { date: '2026-03-23', student: 'Doc' },
    { date: '2026-03-24', student: 'Dottie' },   { date: '2026-03-25', student: 'Ellison' },
    { date: '2026-03-26', student: 'Evie' },     { date: '2026-03-27', student: 'Evie Clare' },
    { date: '2026-03-30', student: 'Grace' },    { date: '2026-03-31', student: 'Harrison' },
    // April 2026
    { date: '2026-04-06', student: 'Jhanvi' },   { date: '2026-04-07', student: 'Leyton' },
    { date: '2026-04-08', student: 'Margo' },    { date: '2026-04-09', student: 'Mateo' },
    { date: '2026-04-10', student: 'Parker' },   { date: '2026-04-13', student: 'Quinn' },
    { date: '2026-04-14', student: 'Venice' },   { date: '2026-04-15', student: 'Wren' },
    { date: '2026-04-16', student: 'Aiden' },    { date: '2026-04-17', student: 'Brooks' },
    { date: '2026-04-20', student: 'Charlotte' },{ date: '2026-04-21', student: 'Cooper' },
    { date: '2026-04-22', student: 'Daisy' },    { date: '2026-04-23', student: 'Doc' },
    { date: '2026-04-24', student: 'Dottie' },   { date: '2026-04-27', student: 'Ellison' },
    { date: '2026-04-28', student: 'Evie' },     { date: '2026-04-29', student: 'Evie Clare' },
    { date: '2026-04-30', student: 'Grace' },
    // May 2026
    { date: '2026-05-04', student: 'Harrison' }, { date: '2026-05-05', student: 'Jhanvi' },
    { date: '2026-05-06', student: 'Leyton' },   { date: '2026-05-07', student: 'Margo' },
    { date: '2026-05-08', student: 'Mateo' },    { date: '2026-05-11', student: 'Parker' },
    { date: '2026-05-12', student: 'Quinn' },    { date: '2026-05-13', student: 'Venice' },
    { date: '2026-05-14', student: 'Wren' }
];

/**
 * Get the Show & Share schedule for the current week.
 * Handles weekends and Friday evening rollover.
 */
function getCurrentWeekShowAndShare(schoolEvents) {
    const now = new Date();
    const dayOfWeek = now.getDay();

    // Determine which Monday to display
    let monday = new Date(now);
    monday.setHours(0, 0, 0, 0);

    if (dayOfWeek === 0) {
        monday.setDate(now.getDate() + 1);          // Sunday → show next Monday
    } else if (dayOfWeek === 6) {
        monday.setDate(now.getDate() + 2);          // Saturday → show next Monday
    } else if (dayOfWeek === 5 && now.getHours() >= 17) {
        monday.setDate(now.getDate() + 3);          // Friday after 5pm → next Monday
    } else {
        monday.setDate(now.getDate() - (dayOfWeek - 1)); // Weekday → this Monday
    }

    // Build Mon-Fri date strings
    const weekDays = [];
    for (let i = 0; i < 5; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        weekDays.push(toDateStr(day));
    }

    // Map each day to a Show & Share entry
    return weekDays.map(dateStr => {
        const item = SHOW_AND_SHARE_SCHEDULE.find(s => s.date === dateStr);
        const holiday = schoolEvents?.find(e => e.date === dateStr && e.type === 'holiday');

        return {
            date: dateStr,
            studentName: holiday ? holiday.title : (item ? item.student : 'No Show & Share'),
            hasStudent: !!item,
            isHoliday: !!holiday
        };
    });
}
