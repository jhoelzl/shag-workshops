import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { simpleMarkdown } from '../lib/markdown';
import type { DanceClass, ClassSession } from '../lib/database.types';
import type { Locale } from '../i18n/index';

type ArchivedClass = DanceClass & { sessions: ClassSession[] };

const texts = {
  de: {
    emptyTitle: 'Noch keine Workshops im Archiv',
    emptyText: 'Hier findest du in Zukunft vergangene Workshops.',
    session: 'Termin',
    sessions: 'Termine',
    instructor: () => 'Kursleiter',
    dtLocale: 'de-AT',
    errorTitle: 'Archiv konnte nicht geladen werden',
    errorText: 'Bitte versuche es erneut.',
    retry: 'Erneut versuchen',
  },
  en: {
    emptyTitle: 'No Workshops in Archive Yet',
    emptyText: 'Past workshops will appear here in the future.',
    session: 'session',
    sessions: 'sessions',
    instructor: (teachers: string) => (teachers.includes('&') || teachers.includes('and') ? 'Instructors' : 'Instructor'),
    dtLocale: 'en-AT',
    errorTitle: 'Could not load the archive',
    errorText: 'Please try again.',
    retry: 'Try again',
  },
};

export default function ArchiveList({ locale }: { locale: Locale }) {
  const [classes, setClasses] = useState<ArchivedClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const tx = texts[locale];

  const getDateRange = (sessions: ClassSession[]) => {
    if (sessions.length === 0) return '';
    const first = new Date(sessions[0].session_date);
    const last = new Date(sessions[sessions.length - 1].session_date);
    const firstStr = first.toLocaleDateString(tx.dtLocale, { month: 'short', year: 'numeric', timeZone: 'Europe/Vienna' });
    const lastStr = last.toLocaleDateString(tx.dtLocale, { month: 'short', year: 'numeric', timeZone: 'Europe/Vienna' });
    if (firstStr === lastStr) {
      return first.toLocaleDateString(tx.dtLocale, { month: 'long', year: 'numeric', timeZone: 'Europe/Vienna' });
    }
    return `${firstStr} – ${lastStr}`;
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const { data: classData, error: classError } = await supabase
          .from('dance_classes')
          .select('*, image_url, image_overlay_alpha, headline_color')
          .eq('is_public', true);
        if (classError) throw classError;

        const publicClasses = classData ?? [];
        if (publicClasses.length === 0) {
          setClasses([]);
          return;
        }

        const { data: sessionData, error: sessionError } = await supabase
          .from('class_sessions')
          .select('*')
          .in('dance_class_id', publicClasses.map((c) => c.id))
          .order('session_date', { ascending: true })
          .order('start_time', { ascending: true });
        if (sessionError) throw sessionError;

        const byClass = new Map<string, ClassSession[]>();
        for (const s of sessionData ?? []) {
          if (!byClass.has(s.dance_class_id)) byClass.set(s.dance_class_id, []);
          byClass.get(s.dance_class_id)!.push(s);
        }

        const now = new Date();
        const archived = publicClasses
          .map((dc) => ({ ...dc, sessions: byClass.get(dc.id) ?? [] }))
          .filter((dc) => {
            if (dc.sessions.length === 0) return false;
            return new Date(dc.sessions[dc.sessions.length - 1].session_date) < now;
          })
          .sort((a, b) => {
            const lastA = a.sessions[a.sessions.length - 1];
            const lastB = b.sessions[b.sessions.length - 1];
            return new Date(lastB.session_date).getTime() - new Date(lastA.session_date).getTime();
          });

        setClasses(archived);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [retryCount]);

  // Highlight and scroll to the class referenced by ?class=
  useEffect(() => {
    if (loading) return;
    const classId = new URLSearchParams(window.location.search).get('class');
    if (!classId) return;
    const target = Array.from(document.querySelectorAll<HTMLElement>('[data-class-id]')).find(
      (el) => el.getAttribute('data-class-id')?.toLowerCase() === classId.toLowerCase(),
    );
    if (!target) return;
    target.classList.remove('border-bg-warm', 'animate-fade-up');
    target.classList.add(...'border-coral ring-4 ring-coral/20 shadow-xl scale-[1.02]'.split(' '));
    const timer = setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    return () => clearTimeout(timer);
  }, [loading, classes]);

  if (loading) {
    return <div className="py-14 text-center text-text-muted">…</div>;
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-accent/20 bg-gradient-to-br from-bg-warm via-accent/[0.07] to-coral/[0.08] shadow-soft px-6 py-14 text-center">
        <p className="font-display text-xl font-bold text-primary">{tx.errorTitle}</p>
        <p className="max-w-sm text-sm text-text-muted">{tx.errorText}</p>
        <button
          type="button"
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-primary/90"
          onClick={() => setRetryCount((count) => count + 1)}
        >
          {tx.retry}
        </button>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-accent/20 bg-gradient-to-br from-bg-warm via-accent/[0.07] to-coral/[0.08] shadow-soft px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent-dark">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.8" />
            <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <p className="font-display text-xl font-bold text-primary">{tx.emptyTitle}</p>
        <p className="max-w-sm text-sm text-text-muted">{tx.emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {classes.map((dc, index) => {
        const title = locale === 'de' ? dc.title_de : dc.title_en;
        const description = locale === 'de' ? dc.description_de : dc.description_en;
        const sessions = dc.sessions;
        const alpha = dc.image_overlay_alpha ?? 40;
        const overlayOpacity = Math.max((alpha / 100) * 0.7, 0);

        return (
          <article
            key={dc.id}
            id={`class-${dc.id}`}
            data-class-id={dc.id}
            className="group bg-surface rounded-3xl border-2 border-bg-warm overflow-hidden hover:shadow-lift transition-all duration-500 animate-fade-up"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div className={`flex flex-col ${dc.image_url ? 'lg:flex-row' : ''} ${index % 2 === 1 && dc.image_url ? 'lg:flex-row-reverse' : ''}`}>
              {dc.image_url && (
                <div className="relative lg:w-2/5 xl:w-1/3 min-h-[200px] lg:min-h-[320px]">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                    style={{ backgroundImage: `url(${dc.image_url})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-black/10 lg:to-black/40" />
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(${index % 2 === 1 ? 'to left' : 'to right'}, transparent 0%, rgba(0,0,0,${overlayOpacity * 0.5}) 100%)` }}
                  />
                  {dc.level && (
                    <span className="absolute top-4 left-4 text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full bg-white/95 text-primary shadow-lg backdrop-blur-sm">
                      {dc.level}
                    </span>
                  )}
                  {dc.dance && (
                    <span className="absolute bottom-4 left-4 text-xs font-bold uppercase tracking-[0.15em] text-white/90 drop-shadow-lg">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-300" />
                        {dc.dance}
                      </span>
                    </span>
                  )}
                </div>
              )}

              <div className="flex-1 p-6 lg:p-8 flex flex-col">
                <div className="mb-4">
                  {!dc.image_url && dc.dance && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-accent-dark mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-dark" />
                      {dc.dance}
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-display text-2xl lg:text-3xl font-bold text-primary leading-tight">{title}</h3>
                    {!dc.image_url && dc.level && (
                      <span className="text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full bg-teal/10 text-teal-dark shrink-0">
                        {dc.level}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 mb-5 pb-5 border-b border-bg-warm">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-8 h-8 rounded-xl bg-teal/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-teal-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-text">{getDateRange(sessions)}</p>
                      <p className="text-xs text-text-muted">
                        {sessions.length} {sessions.length === 1 ? tx.session : tx.sessions}
                      </p>
                    </div>
                  </div>

                  {dc.location && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-8 h-8 rounded-xl bg-coral/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-coral" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-text">{dc.location}</p>
                        {dc.location_details && (
                          <p className="text-xs text-text-muted truncate max-w-[200px]">{dc.location_details}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {dc.teachers && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-accent-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-text">{dc.teachers}</p>
                        <p className="text-xs text-text-muted">{tx.instructor(dc.teachers)}</p>
                      </div>
                    </div>
                  )}
                </div>

                {description && (
                  <div
                    className="prose prose-sm max-w-none text-text leading-relaxed flex-grow [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:text-primary [&_ul]:list-disc [&_ul]:ml-5 [&_li]:marker:text-accent"
                    dangerouslySetInnerHTML={{ __html: simpleMarkdown(description) }}
                  />
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
