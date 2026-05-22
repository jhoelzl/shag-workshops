// Deno-compatible subset of src/lib/calendar.ts for use in Supabase Edge
// Functions. Provides buildIcsContent + buildGoogleCalendarUrl without any
// browser-only helpers. Kept in sync with src/lib/calendar.ts.

export interface CalendarSession {
  id?: string | null;
  session_date: string; // YYYY-MM-DD
  start_time: string;   // HH:MM or HH:MM:SS
  end_time: string;     // HH:MM or HH:MM:SS
  note?: string | null;
}

export interface CalendarWorkshop {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  locationDetails?: string | null;
  url?: string | null;
}

const TIMEZONE = 'Europe/Vienna';

function getTimezoneOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  const hour = map.hour === '24' ? 0 : Number(map.hour);
  const asWallClockUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );
  return (asWallClockUtc - instant.getTime()) / 60000;
}

function wallClockToUtc(dateStr: string, timeStr: string): Date {
  const t = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const guessUtc = new Date(`${dateStr}T${t}Z`);
  const offsetMin = getTimezoneOffsetMinutes(guessUtc, TIMEZONE);
  return new Date(guessUtc.getTime() - offsetMin * 60000);
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function formatIcsLocal(dateStr: string, timeStr: string): string {
  const t = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return `${dateStr.replace(/-/g, '')}T${t.replace(/:/g, '')}`;
}

function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i === 0 ? 75 : i + 74);
    out.push(i === 0 ? chunk : ' ' + chunk);
    i += i === 0 ? 75 : 74;
  }
  return out.join('\r\n');
}

const VIENNA_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Vienna',
  'BEGIN:STANDARD',
  'DTSTART:19701025T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700329T020000',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
].join('\r\n');

/** Builds an ICS calendar with one VEVENT per session. */
export function buildIcsContent(
  workshop: CalendarWorkshop,
  sessions: CalendarSession[]
): string {
  const now = formatIcsUtc(new Date());
  const titleEsc = escapeIcsText(workshop.title);
  const locationParts = [workshop.location, workshop.locationDetails].filter(Boolean) as string[];
  const locationEsc = locationParts.length ? escapeIcsText(locationParts.join(', ')) : '';
  const descLines: string[] = [];
  if (workshop.description) descLines.push(workshop.description);
  if (workshop.url) descLines.push(workshop.url);
  const descriptionEsc = descLines.length ? escapeIcsText(descLines.join('\n')) : '';

  const events = sessions
    .filter((s) => s.session_date && s.start_time && s.end_time)
    .map((session, idx) => {
      const dtStart = formatIcsLocal(session.session_date, session.start_time);
      const dtEnd = formatIcsLocal(session.session_date, session.end_time);
      const uid = `${workshop.id}-${session.id || idx}@shag-workshops`;
      const lines = [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=${TIMEZONE}:${dtStart}`,
        `DTEND;TZID=${TIMEZONE}:${dtEnd}`,
        foldLine(`SUMMARY:${titleEsc}`),
      ];
      if (descriptionEsc) lines.push(foldLine(`DESCRIPTION:${descriptionEsc}`));
      if (locationEsc) lines.push(foldLine(`LOCATION:${locationEsc}`));
      if (workshop.url) lines.push(foldLine(`URL:${workshop.url}`));
      if (session.note) lines.push(foldLine(`COMMENT:${escapeIcsText(session.note)}`));
      lines.push('END:VEVENT');
      return lines.join('\r\n');
    });

  if (events.length === 0) return '';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//shag-workshops//Collegiate Shag//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    VIENNA_VTIMEZONE,
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** Builds a Google Calendar "Add event" URL for a single session. */
export function buildGoogleCalendarUrl(
  workshop: CalendarWorkshop,
  session: CalendarSession
): string {
  const start = wallClockToUtc(session.session_date, session.start_time);
  const end = wallClockToUtc(session.session_date, session.end_time);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: workshop.title,
    dates: `${formatIcsUtc(start)}/${formatIcsUtc(end)}`,
  });
  const descLines: string[] = [];
  if (workshop.description) descLines.push(workshop.description);
  if (workshop.url) descLines.push(workshop.url);
  if (descLines.length) params.set('details', descLines.join('\n\n'));
  const locationParts = [workshop.location, workshop.locationDetails].filter(Boolean) as string[];
  if (locationParts.length) params.set('location', locationParts.join(', '));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function slugifyForFilename(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'workshop'
  );
}
