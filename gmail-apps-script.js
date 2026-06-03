/**
 * Harding Academy Email Automation Script — v3
 *
 * Reads starred / labeled emails from Gmail, extracts highlights, important
 * dates, and per-classroom excerpts, then POSTs straight to the Railway
 * dashboard's /api/data endpoint.
 *
 * Setup:
 *  1. script.google.com → new project → paste this code in
 *  2. Fill in the CONFIG block below (API URL + API key)
 *  3. Create a Gmail label called "Dashboard Update" (or change LABEL_NAME)
 *  4. Apply that label to weekly Harding emails
 *  5. Add a time-based trigger to run processStarredEmails hourly
 */

// ==================== CONFIG ====================

const CONFIG = {
  // Where to POST the dashboard data
  DASHBOARD_API_URL: 'https://harding-kindergarten-production.up.railway.app/api/data',
  DASHBOARD_API_KEY: 'YOUR_API_KEY_HERE',                  // matches API_KEY in Railway env

  // Optional: keep saving raw emails to Drive too (set to '' to skip)
  DRIVE_FOLDER_ID: '',

  // Gmail
  USE_LABEL:   true,
  LABEL_NAME:  'Dashboard Update',
  ONLY_PROCESS_EMAILS_AFTER: '2026-08-01',                 // ignore emails older than this
  SUBJECT_FILTERS: ['Harding Academy', 'Weekly Update', 'Kindergarten', 'PreK'],

  // Per-classroom section extraction
  // The header pattern is matched in the email body; text after the header
  // (up to the next header or blank-line+capitalized-line) becomes the excerpt
  // that gets routed into classrooms[id].weeklyExcerpt.
  CLASSROOM_SECTIONS: [
    { id: 'kinder-kivett',  headers: ["Mrs. Kivett",  "Kivett",  "Kindergarten - Kivett"] },
    { id: 'kinder-semrad',  headers: ["Mrs. Semrad",  "Semrad",  "Kindergarten - Semrad"] },
    { id: 'kinder-3',       headers: [/* fill in third K teacher name */] },
    { id: 'prek-a',         headers: ["PreK A", "Pre-K A"] },
    { id: 'prek-b',         headers: ["PreK B", "Pre-K B"] },
  ],

  // If only ONE grade-level blurb exists (the legacy "Kindergarten" section),
  // route it into this classroom's weeklyExcerpt as a fallback:
  DEFAULT_KINDERGARTEN_FALLBACK_ID: 'kinder-kivett',
};

// ==================== ENTRY POINTS ====================

function setup() {
  Logger.log('Harding Dashboard Apps Script — setup check');
  Logger.log('• API URL: ' + CONFIG.DASHBOARD_API_URL);
  Logger.log('• Label:   ' + CONFIG.LABEL_NAME);

  const label = GmailApp.getUserLabelByName(CONFIG.LABEL_NAME);
  if (!label) Logger.log('⚠ Label not found; create "' + CONFIG.LABEL_NAME + '" in Gmail.');
  else        Logger.log('✓ Label exists, ' + label.getThreads(0, 1).length + ' thread(s) waiting.');

  if (CONFIG.DASHBOARD_API_URL.includes('YOUR-RAILWAY')) Logger.log('⚠ Update CONFIG.DASHBOARD_API_URL.');
  if (CONFIG.DASHBOARD_API_KEY.includes('YOUR_API_KEY')) Logger.log('⚠ Update CONFIG.DASHBOARD_API_KEY.');
}

/**
 * Main hourly job. Pulls labeled threads, extracts content, POSTs to dashboard.
 */
function processStarredEmails() {
  const threads = CONFIG.USE_LABEL
    ? (GmailApp.getUserLabelByName(CONFIG.LABEL_NAME) || GmailApp.createLabel(CONFIG.LABEL_NAME)).getThreads()
    : GmailApp.getStarredThreads();

  Logger.log('Found ' + threads.length + ' thread(s)');
  const cutoff = new Date(CONFIG.ONLY_PROCESS_EMAILS_AFTER);
  const folder = CONFIG.DRIVE_FOLDER_ID ? DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID) : null;

  const pickedEmails = [];
  for (const thread of threads) {
    const message = thread.getMessages().slice(-1)[0];
    if (message.getDate() < cutoff) { Logger.log('skip old: ' + message.getSubject()); continue; }
    if (!isSchoolEmail(message.getSubject())) { Logger.log('skip non-school: ' + message.getSubject()); continue; }

    if (folder) saveRawEmailToFolder(message, folder);
    pickedEmails.push(message);

    if (CONFIG.USE_LABEL) thread.removeLabel(GmailApp.getUserLabelByName(CONFIG.LABEL_NAME));
    else                  thread.removeStars();
  }

  if (!pickedEmails.length) { Logger.log('No new emails to push.'); return; }

  // Build the patch payload (only the fields we want to update)
  const latest = pickedEmails.sort((a,b) => b.getDate() - a.getDate())[0];
  const payload = buildPatchPayload(latest);

  postDashboardUpdate(payload);
  Logger.log('✓ Dashboard updated from: ' + latest.getSubject());
}

// ==================== EXTRACTION ====================

function isSchoolEmail(subject) {
  return CONFIG.SUBJECT_FILTERS.some(f => subject.toLowerCase().includes(f.toLowerCase()));
}

function buildPatchPayload(message) {
  const body = message.getPlainBody();
  const date = message.getDate();

  const classrooms = extractClassroomSections(body);

  return {
    weeklyEmail: {
      week: 'Week of ' + Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM d, yyyy'),
      emailSubject: message.getSubject(),
      emailDate: Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      emailUrl: 'https://mail.google.com/mail/u/0/#inbox/' + message.getId(),
      kindergartenExcerpt: classrooms[CONFIG.DEFAULT_KINDERGARTEN_FALLBACK_ID] || '',  // back-compat
      highlights: extractHighlights(body),
      importantDates: extractImportantDates(body),
    },
    classroomExcerpts: classrooms,   // server merges into classrooms[i].weeklyExcerpt
  };
}

function extractClassroomSections(body) {
  const out = {};
  for (const c of CONFIG.CLASSROOM_SECTIONS) {
    if (!c.headers || !c.headers.length) continue;
    for (const header of c.headers) {
      if (!header) continue;
      const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped + '[:\\s]+([\\s\\S]+?)(?=\\n\\n[A-Z]|\\n\\n\\d+\\.|$)', 'i');
      const match = body.match(re);
      if (match && match[1].trim().length > 20) {
        out[c.id] = match[1].trim();
        break;
      }
    }
  }
  return out;
}

function extractHighlights(body) {
  const out = [];
  for (let line of body.split('\n')) {
    line = line.trim();
    if (/^[•\*\-]\s+.{10,}/.test(line) || /^\d+\.\s+.{10,}/.test(line)) {
      const h = line.replace(/^[•\*\-]\s+/, '').replace(/^\d+\.\s+/, '').trim();
      if (h.length > 10 && h.length < 200) out.push(h);
    }
  }
  return out.slice(0, 10);
}

function extractImportantDates(body) {
  const datePattern = /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:-\d{1,2})?\s*[-–—:]\s*.+/i;
  return body.split('\n').map(l => l.trim()).filter(l => datePattern.test(l)).slice(0, 10);
}

// ==================== HTTP POST ====================

function postDashboardUpdate(payload) {
  const resp = UrlFetchApp.fetch(CONFIG.DASHBOARD_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': CONFIG.DASHBOARD_API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    Logger.log('POST failed ' + code + ': ' + resp.getContentText().substring(0, 300));
    throw new Error('Dashboard POST failed with ' + code);
  }
  Logger.log('POST ok: ' + resp.getContentText().substring(0, 200));
}

// ==================== DRIVE BACKUP (optional) ====================

function saveRawEmailToFolder(message, folder) {
  const date = Utilities.formatDate(message.getDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const safeSubject = message.getSubject().replace(/[\/\\?%*:|"<>]/g, '-').slice(0, 80);
  folder.createFile('email_' + date + '_' + safeSubject + '.txt',
                    message.getPlainBody(), MimeType.PLAIN_TEXT);
}

// ==================== TEST HELPERS ====================

function testProcessOneEmail() {
  const threads = (CONFIG.USE_LABEL
                   ? (GmailApp.getUserLabelByName(CONFIG.LABEL_NAME) || GmailApp.createLabel(CONFIG.LABEL_NAME)).getThreads(0, 1)
                   : GmailApp.getStarredThreads(0, 1));
  if (!threads.length) { Logger.log('No threads to test with — add the label to one email first.'); return; }
  const message = threads[0].getMessages().slice(-1)[0];
  Logger.log('Building payload for: ' + message.getSubject());
  const payload = buildPatchPayload(message);
  Logger.log(JSON.stringify(payload, null, 2).slice(0, 1500));
}

function dryRun() {
  // Same as test but doesn't POST
  testProcessOneEmail();
}
