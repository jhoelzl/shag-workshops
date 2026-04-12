/**
 * Simple markdown to HTML converter for class descriptions.
 * Supports: **bold**, *italic*, newlines, and unordered lists (- or * item).
 */
export function simpleMarkdown(text: string): string {
  // Escape HTML entities to prevent XSS
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Split into lines for block-level processing
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const listMatch = trimmed.match(/^[-*]\s+(.*)/);

    if (listMatch) {
      if (!inList) {
        result.push('<ul class="list-disc list-inside ml-1 my-1">');
        inList = true;
      }
      result.push(`<li>${listMatch[1]}</li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      if (trimmed === '') {
        // skip empty lines (no extra spacing)
      } else {
        // Italic: *text* (only process after bold is handled)
        const processed = trimmed.replace(/\*(.+?)\*/g, '<em>$1</em>');
        result.push(`<p class="mb-1">${processed}</p>`);
      }
    }
  }

  if (inList) {
    result.push('</ul>');
  }

  return result.join('');
}
