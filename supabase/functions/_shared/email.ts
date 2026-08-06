// Shared helpers for transactional emails sent via Resend.
// Provides:
//   - REPLY_TO: default Reply-To address (can be overridden via EMAIL_REPLY_TO env)
//   - wrapHtml: wraps a body HTML fragment in a proper <!DOCTYPE html> document
//   - htmlToText: converts the body HTML fragment to a plain-text fallback

export const REPLY_TO = (typeof Deno !== 'undefined' && Deno.env.get('EMAIL_REPLY_TO')) || 'info@shagadeus.at';

/**
 * Wrap an HTML body fragment in a full, well-formed HTML document so that
 * spam filters see a proper structure (DOCTYPE, head, meta charset, etc.).
 */
export function wrapHtml(bodyHtml: string, opts: { title?: string; preheader?: string } = {}): string {
  const title = opts.title ?? 'Amadeus Shagadeus';
  const preheader = opts.preheader ?? '';
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#fdf6ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fdf6ee;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;padding:32px;">
        <tr>
          <td style="font-size:16px;line-height:1.6;color:#1f2937;">
${bodyHtml}
          </td>
        </tr>
      </table>
      <p style="font-size:12px;color:#6b7280;margin:16px 0 0;">Amadeus Shagadeus · Collegiate Shag in Salzburg · <a href="https://shagadeus.at" style="color:#6b7280;">shagadeus.at</a></p>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Convert an HTML body fragment to a plain-text fallback. Handles common
 * block tags as newlines, decodes a small set of named entities, and
 * collapses excessive whitespace. Not a full HTML parser, but sufficient
 * for our simple transactional templates.
 */
export function htmlToText(html: string): string {
  let s = html;
  // Normalize line breaks for block-level elements
  s = s.replace(/<\s*(br)\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, '\n\n');
  s = s.replace(/<\s*li[^>]*>/gi, '• ');
  // Strip remaining tags; repeat until stable so that nested/overlapping
  // tag-like sequences (e.g. "<<script>script>") cannot survive a single pass.
  let prev: string;
  do {
    prev = s;
    s = s.replace(/<[^>]*>/g, '');
  } while (s !== prev);
  // Decode common HTML entities. &amp; is decoded LAST so that already-decoded
  // entities (e.g. "&amp;lt;" → "&lt;") are not double-unescaped into "<".
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&auml;/g, 'ä')
    .replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
  // Collapse whitespace
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

export function renderConfirmationTemplate(input: {
  lang: 'de' | 'en';
  name: string;
  classTitle: string;
  teachers?: string | null;
}): string {
  const teacherName = input.teachers || 'Vera & Josef';
  if (input.lang === 'en') {
    return `<h2>Hello ${input.name}!</h2>
               <p>Your registration for <strong>${input.classTitle}</strong> has been <strong>confirmed</strong>!</p>
               <p>We look forward to seeing you!</p>
               <p>${teacherName}</p>`;
  }

  return `<h2>Hallo ${input.name}!</h2>
               <p>Deine Anmeldung für <strong>${input.classTitle}</strong> wurde <strong>bestätigt</strong>!</p>
               <p>Wir freuen uns auf dich!</p>
               <p>${teacherName}</p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
