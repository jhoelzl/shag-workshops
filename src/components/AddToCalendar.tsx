import { useEffect, useId, useRef, useState } from 'react';
import type { DanceClass, ClassSession } from '../lib/database.types';
import type { Locale } from '../i18n/index';
import de from '../i18n/de.json';
import en from '../i18n/en.json';
import {
  buildGoogleCalendarUrl,
  buildIcsContent,
  downloadIcs,
  slugifyForFilename,
} from '../lib/calendar';

const translations = { de, en };

interface Props {
  danceClass: DanceClass;
  sessions: ClassSession[];
  locale: Locale;
  /** `icon` = compact button used on cards; `button` = full CTA used on confirmation page */
  variant?: 'icon' | 'button';
  /** Horizontal alignment of the popover menu relative to the trigger */
  menuAlign?: 'left' | 'right';
}

function stripMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\r/g, '')
    .trim();
}

export default function AddToCalendar({ danceClass, sessions, locale, variant = 'icon', menuAlign = 'left' }: Props) {
  const i18n = translations[locale];
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    // Focus first menu item for keyboard users
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const validSessions = sessions.filter((s) => s.session_date && s.start_time && s.end_time);
  if (validSessions.length === 0) return null;

  const title = locale === 'de' ? danceClass.title_de : danceClass.title_en;
  const description = stripMarkdown(
    locale === 'de' ? danceClass.description_de : danceClass.description_en
  );

  // Pick the upcoming (or first) session for the Google Calendar link
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = validSessions.find((s) => s.session_date >= todayIso) ?? validSessions[0];

  const url = typeof window !== 'undefined' ? window.location.origin : '/';

  const calendarWorkshop = {
    id: danceClass.id,
    title,
    description,
    location: danceClass.location,
    locationDetails: danceClass.location_details,
    url,
  };

  function handleGoogle() {
    const href = buildGoogleCalendarUrl(calendarWorkshop, upcoming);
    if (typeof window !== 'undefined') window.open(href, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }

  function handleIcs() {
    const content = buildIcsContent(calendarWorkshop, validSessions);
    if (!content) return;
    downloadIcs(slugifyForFilename(title), content);
    setOpen(false);
  }

  const label = i18n.calendar.add_to_calendar;
  const multi = validSessions.length > 1;

  const CalendarIcon = (
    <svg
      className="w-4 h-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 2v4M8 2v4M3 10h18M12 14v6M9 17h6" />
    </svg>
  );

  return (
    <div ref={containerRef} className="relative inline-block">
      {variant === 'icon' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          title={label}
          className="group inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal/10 text-teal hover:bg-teal/20 hover:text-teal-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-1"
        >
          {CalendarIcon}
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          className="group inline-flex items-center gap-2 bg-white border border-gray-150 hover:border-primary hover:bg-primary/5 text-text hover:text-primary rounded-full px-4 py-2 text-sm font-semibold shadow-sm hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        >
          {CalendarIcon}
          <span>{label}</span>
          <svg
            className={`w-3.5 h-3.5 text-text-muted group-hover:text-primary transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute z-30 ${menuAlign === 'left' ? 'left-0' : 'right-0'} mt-2 min-w-[15rem] bg-white border border-gray-150 rounded-2xl shadow-lg overflow-hidden ring-1 ring-black/[0.02]`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleGoogle}
            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-primary/5 focus:bg-primary/5 focus:outline-none transition-colors"
          >
            <span className="w-7 h-7 rounded-lg bg-bg/60 border border-gray-150 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#fff" d="M37 5H11a4 4 0 0 0-4 4v30a4 4 0 0 0 4 4h26a4 4 0 0 0 4-4V9a4 4 0 0 0-4-4z" />
                <path fill="#1A73E8" d="M30.7 23.6c0-1-.1-1.7-.3-2.4h-6.6v4.3h3.9c-.1.9-.7 2.4-2 3.3l-.1.1 2.9 2.2.2.1c1.9-1.7 3-4.3 3-7.6z" />
                <path fill="#34A853" d="M23.8 31.4c1.9 0 3.5-.6 4.7-1.7l-2.2-1.7c-.6.4-1.4.7-2.5.7-1.9 0-3.5-1.2-4-3l-.1.1-2.7 2.1-.1.2c1.1 2.4 3.6 4 6.9 4z" />
                <path fill="#FBBC04" d="M19.8 25.7c-.1-.4-.2-.9-.2-1.3 0-.5.1-.9.2-1.3l-2.8-2.2c-.6 1.1-.9 2.3-.9 3.5s.3 2.4.9 3.5l2.8-2.2z" />
                <path fill="#EA4335" d="M23.8 19.4c1.3 0 2.2.6 2.7 1.1l2-1.9c-1.2-1.1-2.9-1.8-4.7-1.8-3.3 0-5.8 1.6-6.9 4l2.8 2.2c.5-1.8 2.2-3.6 4.1-3.6z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text">{i18n.calendar.google}</span>
              <span className="block text-[11px] text-text-muted leading-snug mt-0.5">
                {multi ? i18n.calendar.google_hint_multi : i18n.calendar.google_hint_single}
              </span>
            </span>
          </button>

          <div className="h-px bg-bg-warm" aria-hidden="true"></div>

          <button
            type="button"
            role="menuitem"
            onClick={handleIcs}
            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-primary/5 focus:bg-primary/5 focus:outline-none transition-colors"
          >
            <span className="w-7 h-7 rounded-lg bg-bg/60 border border-gray-150 flex items-center justify-center shrink-0 mt-0.5 text-teal">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text">{i18n.calendar.ics}</span>
              <span className="block text-[11px] text-text-muted leading-snug mt-0.5">
                {multi ? i18n.calendar.ics_hint_multi.replace('{count}', String(validSessions.length)) : i18n.calendar.ics_hint_single}
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
