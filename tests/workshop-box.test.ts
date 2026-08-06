import { describe, it, expect } from 'vitest';
import {
  renderWorkshopBoxHtml,
  renderWorkshopBoxText,
  type WorkshopBoxInput,
} from '../supabase/functions/_shared/workshop-box.ts';

const BASE_INPUT: WorkshopBoxInput = {
  classId: 'class-1',
  titleDe: 'Shag Me Amadeus',
  titleEn: 'Shag Me Amadeus',
  dance: 'Collegiate Shag',
  teachers: 'Vera & Josef',
  level: 'Beginner',
  location: 'Tanzstudio Salzburg',
  locationDetails: 'Linzer Gasse 12, 5020 Salzburg',
  locationUrl: 'https://maps.example.com/salzburg',
  priceEur: 10,
  isDonation: false,
  sessions: [
    { id: 's1', session_date: '2026-06-18', start_time: '19:00', end_time: '19:55' },
    { id: 's2', session_date: '2026-06-25', start_time: '19:00', end_time: '19:55' },
  ],
  workshopPageUrl: 'https://shagadeus.at/de/workshops',
  lang: 'de',
};

describe('renderWorkshopBoxText', () => {
  it('contains the workshop title', () => {
    const text = renderWorkshopBoxText(BASE_INPUT);
    expect(text).toContain('SHAG ME AMADEUS');
  });

  it('contains all session dates and times (DE format)', () => {
    const text = renderWorkshopBoxText(BASE_INPUT);
    expect(text).toContain('18. Juni');
    expect(text).toContain('25. Juni');
    expect(text).toContain('19:00');
    expect(text).toContain('19:55');
  });

  it('contains location without URL', () => {
    const text = renderWorkshopBoxText(BASE_INPUT);
    expect(text).toContain('Tanzstudio Salzburg');
    expect(text).toContain('Linzer Gasse 12, 5020 Salzburg');
    expect(text).not.toContain('https://maps.example.com/salzburg');
  });

  it('contains the price', () => {
    const text = renderWorkshopBoxText(BASE_INPUT);
    expect(text).toContain('€');
    expect(text).toContain('10');
  });

  it('shows the website donation copy when is_donation is true', () => {
    const text = renderWorkshopBoxText({ ...BASE_INPUT, isDonation: true });
    expect(text).toContain('Preis: Freiwillige Spende');
    expect(text).toContain('Zur Deckung der Saalmiete');
  });

  it('shows custom donation text when provided', () => {
    const text = renderWorkshopBoxText({
      ...BASE_INPUT,
      isDonation: true,
      donationTextDe: 'Spende nach Wunsch',
      donationSubtextDe: 'Für neue Türen',
    });
    expect(text).toContain('Preis: Spende nach Wunsch');
    expect(text).toContain('Für neue Türen');
  });

  it('shows custom donation text in English when provided', () => {
    const text = renderWorkshopBoxText({
      ...BASE_INPUT,
      lang: 'en',
      isDonation: true,
      donationTextEn: 'Pay what you want',
      donationSubtextEn: 'Help us buy new mirrors',
    });
    expect(text).toContain('Price: Pay what you want');
    expect(text).toContain('Help us buy new mirrors');
  });

  it('shows the website-like cost secondary line for fixed prices', () => {
    const text = renderWorkshopBoxText(BASE_INPUT);
    expect(text).toContain('Preis:');
    expect(text).toContain('Kosten');
  });

  it('does not contain Google Calendar URLs', () => {
    const text = renderWorkshopBoxText(BASE_INPUT);
    expect(text).not.toContain('calendar.google.com');
  });

  it('mentions the ICS attachment', () => {
    const text = renderWorkshopBoxText(BASE_INPUT);
    expect(text.toLowerCase()).toContain('.ics');
  });

  it('contains the public workshop page URL', () => {
    const text = renderWorkshopBoxText(BASE_INPUT);
    expect(text).toContain('https://shagadeus.at/de/workshops');
  });

  it('uses English labels and website wording when lang=en', () => {
    const text = renderWorkshopBoxText({ ...BASE_INPUT, lang: 'en' });
    expect(text).toContain('2 Sessions:');
    expect(text).toContain('Location:');
    expect(text).toContain('Price:');
    expect(text).toContain('18 Jun');
  });

  it('skips dates section when no valid sessions are provided', () => {
    const text = renderWorkshopBoxText({ ...BASE_INPUT, sessions: [] });
    expect(text).not.toContain('Termin:');
    expect(text).not.toContain('Termine:');
    expect(text).not.toContain('calendar.google.com');
  });

  it('uses singular session label for exactly one session', () => {
    const text = renderWorkshopBoxText({ ...BASE_INPUT, sessions: [BASE_INPUT.sessions[0]] });
    expect(text).toContain('1 Termin:');
    expect(text).not.toContain('1 Termine:');
  });

  it('uses singular English session label for exactly one session', () => {
    const text = renderWorkshopBoxText({ ...BASE_INPUT, lang: 'en', sessions: [BASE_INPUT.sessions[0]] });
    expect(text).toContain('1 Session:');
    expect(text).not.toContain('1 Sessions:');
  });
});

describe('renderWorkshopBoxHtml', () => {
  it('contains the workshop title and is table-based', () => {
    const html = renderWorkshopBoxHtml(BASE_INPUT);
    expect(html).toContain('Shag Me Amadeus');
    expect(html).toContain('<table');
  });

  it('uses inline styles (no <style> blocks, no class attributes)', () => {
    const html = renderWorkshopBoxHtml(BASE_INPUT);
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/\sclass=/);
  });

  it('escapes HTML special characters in user-provided fields', () => {
    const html = renderWorkshopBoxHtml({
      ...BASE_INPUT,
      titleDe: 'Shag & <script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not render Google Calendar buttons', () => {
    const html = renderWorkshopBoxHtml(BASE_INPUT);
    expect(html).not.toContain('calendar.google.com');
  });

  it('shows location as plain text without a link', () => {
    const html = renderWorkshopBoxHtml(BASE_INPUT);
    expect(html).toContain('Tanzstudio Salzburg');
    expect(html).not.toMatch(/<a href="https:\/\/maps\.example\.com\/salzburg"/);
  });

  it('renders donation as two lines in HTML like the website badge', () => {
    const html = renderWorkshopBoxHtml({ ...BASE_INPUT, isDonation: true });
    expect(html).toContain('Freiwillige Spende');
    expect(html).toContain('Zur Deckung der Saalmiete');
  });

  it('renders custom donation text in HTML when provided', () => {
    const html = renderWorkshopBoxHtml({
      ...BASE_INPUT,
      isDonation: true,
      donationTextDe: 'Spende nach Wunsch',
      donationSubtextDe: 'Für neue Türen',
    });
    expect(html).toContain('Spende nach Wunsch');
    expect(html).toContain('Für neue Türen');
    expect(html).not.toContain('Freiwillige Spende');
  });
});
