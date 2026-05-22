import { describe, expect, it } from 'vitest';
import { renderConfirmationTemplate, wrapHtml } from '../supabase/functions/_shared/email.ts';

describe('email templates snapshots', () => {
  it('matches wrapHtml snapshot', () => {
    const html = wrapHtml('<h2>Test heading</h2><p>Body content.</p>', {
      title: 'Status update',
      preheader: 'Short preview text',
    });

    expect(html).toMatchSnapshot();
  });

  it('matches confirmation template snapshot (DE)', () => {
    const html = renderConfirmationTemplate({
      lang: 'de',
      name: 'Max Mustermann',
      classTitle: 'Collegiate Shag Beginner',
    });

    expect(html).toMatchSnapshot();
  });

  it('matches confirmation template snapshot (EN)', () => {
    const html = renderConfirmationTemplate({
      lang: 'en',
      name: 'Alex Example',
      classTitle: 'Collegiate Shag Beginner',
    });

    expect(html).toMatchSnapshot();
  });
});
