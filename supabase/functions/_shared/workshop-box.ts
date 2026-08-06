// Renders a "workshop box" — a compact summary of a workshop's details
// (sessions, location, price) and calendar export links — for inclusion in
// transactional emails. Both an HTML (table-based, inline CSS, email-safe)
// and a plain-text version are produced from the same data so that text-only
// clients receive an equivalent, accurate fallback.

import { type CalendarSession } from './calendar.ts';

export interface WorkshopBoxInput {
  classId: string;
  titleDe: string;
  titleEn: string;
  dance?: string | null;
  teachers?: string | null;
  level?: string | null;
  location?: string | null;
  locationDetails?: string | null;
  locationUrl?: string | null;
  priceEur?: number | null;
  isDonation?: boolean | null;
  donationTextDe?: string | null;
  donationTextEn?: string | null;
  donationSubtextDe?: string | null;
  donationSubtextEn?: string | null;
  sessions: CalendarSession[];
  /** Public workshop URL on shagadeus.at, e.g. https://shagadeus.at/de/workshops */
  workshopPageUrl?: string | null;
  lang: 'de' | 'en';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats a session in the same visual style as the website workshop cards,
 * e.g. "Do., 18. Juni, 19:00–19:55".
 * Interprets the date as a wall-clock date (no timezone shift) to avoid
 * off-by-one errors near midnight in non-Vienna locales.
 */
function formatSession(session: CalendarSession, lang: 'de' | 'en'): string {
  const [y, m, d] = session.session_date.split('-').map((n) => parseInt(n, 10));
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const datePart = new Intl.DateTimeFormat(lang === 'de' ? 'de-AT' : 'en-AT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(utcDate);
  const start = session.start_time.slice(0, 5);
  const end = session.end_time.slice(0, 5);
  return `${datePart}, ${start}–${end}`;
}

function formatPriceParts(input: WorkshopBoxInput): { primary: string; secondary?: string } | null {
  if (input.isDonation) {
    return input.lang === 'de'
      ? {
          primary: input.donationTextDe || 'Freiwillige Spende',
          secondary: input.donationSubtextDe || 'Zur Deckung der Saalmiete'
        }
      : {
          primary: input.donationTextEn || 'Voluntary donation',
          secondary: input.donationSubtextEn || 'To help cover the studio rental'
        };
  }
  if (input.priceEur == null) return null;
  const currency = new Intl.NumberFormat(input.lang === 'de' ? 'de-AT' : 'en-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(input.priceEur));
  return {
    primary: currency,
    secondary: input.lang === 'de' ? 'Kosten' : 'Cost',
  };
}

/** ICS attachment filename — base name without extension. */
export function workshopBoxIcsFilename(input: WorkshopBoxInput): string {
  const base = (input.lang === 'de' ? input.titleDe : input.titleEn)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'workshop';
  return `${base}.ics`;
}

const LABELS = {
  de: {
    workshop: 'Workshop',
    session: 'Termin',
    sessions: 'Termine',
    location: 'Ort',
    price: 'Preis',
    teachers: 'Lehrer',
    level: 'Level',
    addToCalendar: '📅 Zum Kalender hinzufügen',
    icsHint: 'Kalender-Datei (.ics) ist als Anhang in dieser Mail.',
    googleCalendar: 'Google Calendar',
    moreInfo: 'Workshop-Details auf shagadeus.at',
  },
  en: {
    workshop: 'Workshop',
    session: 'Session',
    sessions: 'Sessions',
    location: 'Location',
    price: 'Price',
    teachers: 'Teachers',
    level: 'Level',
    addToCalendar: '📅 Add to calendar',
    icsHint: 'The calendar file (.ics) is attached to this email.',
    googleCalendar: 'Google Calendar',
    moreInfo: 'Workshop details on shagadeus.at',
  },
} as const;

function sessionHeading(count: number, lang: 'de' | 'en'): string {
  const labels = LABELS[lang];
  const noun = count === 1 ? labels.session : labels.sessions;
  return `${count} ${noun}`;
}

/**
 * Renders the workshop box as inline-styled, table-based HTML safe for
 * email clients (Outlook, Gmail, Apple Mail, etc.).
 */
export function renderWorkshopBoxHtml(input: WorkshopBoxInput): string {
  const L = LABELS[input.lang];
  const title = input.lang === 'de' ? input.titleDe : input.titleEn;
  const validSessions = input.sessions.filter(
    (s) => s.session_date && s.start_time && s.end_time
  );

  const sessionRows = validSessions
    .map((s) => `<tr><td style="padding:4px 0;font-size:14px;color:#1f2937;">${escapeHtml(formatSession(s, input.lang))}</td></tr>`)
    .join('');

  const locationParts: string[] = [];
  if (input.location) locationParts.push(input.location);
  if (input.locationDetails) locationParts.push(input.locationDetails);
  const locationLabel = locationParts.length ? escapeHtml(locationParts.join(', ')) : '';
  const locationHtml = locationLabel;

  const price = formatPriceParts(input);

  const teacherLine = input.teachers
    ? `<span style="color:#6b7280;">${escapeHtml(L.teachers)}: ${escapeHtml(input.teachers)}</span>`
    : '';
  const levelLine = input.level
    ? `<span style="color:#6b7280;">${escapeHtml(L.level)}: ${escapeHtml(input.level)}</span>`
    : '';
  const danceLine = input.dance ? escapeHtml(input.dance) : '';

  const eyebrowParts: string[] = [];
  if (danceLine) eyebrowParts.push(danceLine);
  if (input.teachers) eyebrowParts.push(escapeHtml(input.teachers));
  const eyebrowLine = eyebrowParts.length
    ? `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#E76F51;margin-bottom:4px;">${eyebrowParts.join(' · ')}</div>`
    : '';

  const metaRow = [
    levelLine,
    !input.teachers && !danceLine ? teacherLine : '',
  ].filter(Boolean).join(' · ');

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fdf6ee;border:1px solid #e5e7eb;border-radius:12px;margin:20px 0;">
  <tr>
    <td style="padding:20px 22px;">
      ${eyebrowLine}
      <div style="font-size:18px;font-weight:700;color:#0f1a30;margin-bottom:6px;">${escapeHtml(title)}</div>
      ${metaRow ? `<div style="font-size:12px;margin-bottom:14px;">${metaRow}</div>` : ''}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
        ${sessionRows ? `
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
            <div style="font-size:14px;font-weight:600;color:#1f2937;margin-bottom:6px;">${escapeHtml(sessionHeading(validSessions.length, input.lang))}:</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">${sessionRows}</table>
          </td>
        </tr>` : ''}
        ${locationHtml ? `
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
            <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">${escapeHtml(L.location)}</div>
            <div style="font-size:14px;color:#1f2937;">${locationHtml}</div>
          </td>
        </tr>` : ''}
        ${price ? `
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
            <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">${escapeHtml(L.price)}</div>
            <div style="font-size:14px;color:#1f2937;font-weight:600;">${escapeHtml(price.primary)}</div>
            ${price.secondary ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(price.secondary)}</div>` : ''}
          </td>
        </tr>` : ''}
      </table>

      ${validSessions.length ? `
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e5e7eb;">
        <div style="font-size:11px;color:#6b7280;">${escapeHtml(L.icsHint)}</div>
      </div>` : ''}

      ${input.workshopPageUrl ? `
      <div style="margin-top:14px;font-size:12px;">
        <a href="${escapeHtml(input.workshopPageUrl)}" style="color:#2A9D8F;text-decoration:underline;">${escapeHtml(L.moreInfo)} →</a>
      </div>` : ''}
    </td>
  </tr>
</table>
`.trim();
}

/**
 * Renders the workshop box as plain text. Used directly for the text/plain
 * MIME part of the email — NOT derived from the HTML — so that the fallback
 * is guaranteed to contain all the relevant information.
 */
export function renderWorkshopBoxText(input: WorkshopBoxInput): string {
  const L = LABELS[input.lang];
  const title = input.lang === 'de' ? input.titleDe : input.titleEn;
  const validSessions = input.sessions.filter(
    (s) => s.session_date && s.start_time && s.end_time
  );

  const lines: string[] = [];
  lines.push('────────────────────────────────────');
  lines.push(title.toUpperCase());

  const eyebrow: string[] = [];
  if (input.dance) eyebrow.push(input.dance);
  if (input.teachers) eyebrow.push(input.teachers);
  if (eyebrow.length) lines.push(eyebrow.join(' · '));
  if (input.level) lines.push(`${L.level}: ${input.level}`);
  lines.push('');

  if (validSessions.length) {
    lines.push(`${sessionHeading(validSessions.length, input.lang)}:`);
    for (const s of validSessions) {
      lines.push(`  • ${formatSession(s, input.lang)}`);
    }
    lines.push('');
  }

  const locationParts: string[] = [];
  if (input.location) locationParts.push(input.location);
  if (input.locationDetails) locationParts.push(input.locationDetails);
  if (locationParts.length) {
    lines.push(`${L.location}: ${locationParts.join(', ')}`);
  }

  const price = formatPriceParts(input);
  if (price) {
    lines.push(`${L.price}: ${price.primary}`);
    if (price.secondary) lines.push(`       ${price.secondary}`);
  }

  if (validSessions.length) {
    lines.push('');
    lines.push(`  ${L.icsHint}`);
  }

  if (input.workshopPageUrl) {
    lines.push('');
    lines.push(`${L.moreInfo}: ${input.workshopPageUrl}`);
  }

  lines.push('────────────────────────────────────');
  return lines.join('\n');
}
