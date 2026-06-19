import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { simpleMarkdown } from '../lib/markdown';
import { getClassState } from '../lib/classState';
import type { DanceClass, ClassSession } from '../lib/database.types';
import type { Locale } from '../i18n/index';
import de from '../i18n/de.json';
import en from '../i18n/en.json';
import AddToCalendar from './AddToCalendar';

const translations = { de, en };

interface ClassWithCounts extends DanceClass {
  leads_available?: number;
  follows_available?: number;
  lead_count?: number;
  follow_count?: number;
  sessions?: ClassSession[];
}

export default function ClassList({ locale }: { locale: Locale }) {
  const [classes, setClasses] = useState<ClassWithCounts[]>([]);
  const [archivedClasses, setArchivedClasses] = useState<ClassWithCounts[]>([]);
  const [expandedArchived, setExpandedArchived] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const toggleArchived = (id: string) =>
    setExpandedArchived((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const i18n = translations[locale];
  const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
  const dtLocale = locale === 'de' ? 'de-AT' : 'en-AT';
  const fmtCurrency = (v: number) => new Intl.NumberFormat(dtLocale, { style: 'currency', currency: 'EUR' }).format(v);
  const fmtDateTime = (value: string) => {
    const dt = new Date(value);
    const date = dt.toLocaleDateString(dtLocale, { day: 'numeric', month: 'long', year: 'numeric' });
    const time = dt.toLocaleTimeString(dtLocale, { hour: '2-digit', minute: '2-digit', hour12: false });
    return locale === 'de' ? `${date}, ${time} Uhr` : `${date}, ${time}`;
  };

  useEffect(() => {
    async function fetchClasses() {
      const { data: classData } = await supabase
        .from('dance_classes')
        .select('*')
        .eq('is_public', true);

      if (!classData || classData.length === 0) {
        setClasses([]);
        setLoading(false);
        return;
      }

      const classIds = classData.map((c) => c.id);

      const [{ data: counts }, { data: sessions }] = await Promise.all([
        supabase.from('class_registration_counts').select('*'),
        supabase
          .from('class_sessions')
          .select('*')
          .in('dance_class_id', classIds)
          .order('session_date', { ascending: true })
          .order('start_time', { ascending: true }),
      ]);

      const countsMap = new Map(counts?.map((c) => [c.dance_class_id, c]));
      const sessionsMap = new Map<string, ClassSession[]>();
      for (const s of sessions || []) {
        if (!sessionsMap.has(s.dance_class_id)) sessionsMap.set(s.dance_class_id, []);
        sessionsMap.get(s.dance_class_id)!.push(s);
      }

      const merged = classData.map((dc) => {
        const c = countsMap.get(dc.id);
        return {
          ...dc,
          lead_count: Number(c?.lead_count ?? 0),
          follow_count: Number(c?.follow_count ?? 0),
          leads_available: Number(c?.leads_available ?? dc.max_leads),
          follows_available: Number(c?.follows_available ?? dc.max_follows),
          sessions: sessionsMap.get(dc.id) || [],
        };
      });

      // Sort classes chronologically by first session date and time.
      merged.sort((a, b) => {
        const firstA = a.sessions?.[0];
        const firstB = b.sessions?.[0];

        if (!firstA && !firstB) return 0;
        if (!firstA) return 1;
        if (!firstB) return -1;

        const firstDateTimeA = `${firstA.session_date}T${firstA.start_time}`;
        const firstDateTimeB = `${firstB.session_date}T${firstB.start_time}`;
        return firstDateTimeA.localeCompare(firstDateTimeB);
      });

      setClasses(merged.filter((dc) => {
        const state = getClassState(dc.sessions || [], dc.registration_opens_at, dc.registration_closes_at);
        return state === 'upcoming' || state === 'open' || state === 'ongoing';
      }));
      setArchivedClasses(merged.filter((dc) => {
        const state = getClassState(dc.sessions || [], dc.registration_opens_at, dc.registration_closes_at);
        return state === 'archived';
      }));
      setLoading(false);
    }
    fetchClasses();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-surface rounded-3xl border border-primary/10 shadow-soft overflow-hidden animate-pulse">
            {/* Header */}
            <div className="px-6 pt-6 pb-3 flex justify-between items-start gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-primary/10" />
                <div className="h-7 w-2/3 rounded-lg bg-primary/10" />
              </div>
              <div className="h-6 w-16 rounded-full bg-primary/10 shrink-0" />
            </div>
            {/* Description */}
            <div className="px-6 pb-3 space-y-2 min-h-[5.25rem]">
              <div className="h-3.5 w-full rounded bg-primary/5" />
              <div className="h-3.5 w-5/6 rounded bg-primary/5" />
              <div className="h-3.5 w-3/4 rounded bg-primary/5" />
            </div>
            {/* Sessions box + meta badges */}
            <div className="px-6 pb-5 space-y-3 bg-primary/5">
              <div className="rounded-xl border border-primary/10 bg-primary/5 px-4 py-3.5 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-24 rounded bg-primary/10" />
                  <div className="h-3 w-44 rounded bg-primary/10" />
                  <div className="h-3 w-40 rounded bg-primary/10" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-11 flex-1 rounded-2xl bg-primary/10" />
                <div className="h-11 w-24 rounded-2xl bg-primary/10 shrink-0" />
              </div>
            </div>
            {/* CTA button */}
            <div className="px-6 pb-6 pt-3">
              <div className="h-12 w-full rounded-full bg-primary/10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (classes.length === 0 && archivedClasses.length === 0) {
    return <p className="text-text-muted text-center py-8">{i18n.home.no_workshops}</p>;
  }

  function renderClassCard(dc: ClassWithCounts) {
    const title = locale === 'de' ? dc.title_de : dc.title_en;
    const description = locale === 'de' ? dc.description_de : dc.description_en;
    const whatToBring = locale === 'de' ? dc.what_to_bring_de : dc.what_to_bring_en;
    const previewText = locale === 'de' ? dc.preview_text_de : dc.preview_text_en;
    const sessions = dc.sessions || [];
    const classState = getClassState(sessions, dc.registration_opens_at, dc.registration_closes_at);
    const isPreview = !!dc.is_preview;

    return (
      <div key={dc.id} className={`group bg-surface rounded-3xl border border-bg-warm shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all duration-300 overflow-hidden ${classState === 'archived' ? 'opacity-60' : ''}`}>
        {/* Header */}
        <div className="px-6 pt-6 pb-3">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                {dc.dance && <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent-dark">{dc.dance}</span>}
                {dc.dance && dc.teachers && <span className="text-text-muted/30">·</span>}
                {dc.teachers && <span className="text-[11px] font-medium text-text-muted tracking-wide">{dc.teachers}</span>}
              </div>
              <h3 className="font-display text-2xl font-bold text-primary leading-tight tracking-tight">{title}</h3>
              {classState === 'ongoing' && (
                <span className="text-[11px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full mt-1 self-start">{i18n.workshops.ongoing}</span>
              )}
            </div>
            <div className="flex gap-2 shrink-0 items-center">
              {isPreview && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">{locale === 'de' ? 'Vorschau' : 'Preview'}</span>
              )}
              {dc.level && (
                <span className="text-[11px] uppercase tracking-wider bg-gradient-to-br from-teal/15 to-teal/5 text-teal-dark font-bold px-3 py-1 rounded-full border border-teal/15">{dc.level}</span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="px-6 pb-3 min-h-[5.25rem]">
          {description && (
            <div className="text-text-muted text-sm leading-relaxed [&_strong]:text-text" dangerouslySetInnerHTML={{ __html: simpleMarkdown(description) }} />
          )}
        </div>

        {/* What to Bring */}
        {whatToBring && (
          <div className="px-6 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal mb-1.5">{i18n.workshops.what_to_bring}</p>
            <div className="text-text-muted text-sm leading-relaxed [&_li]:ml-4" dangerouslySetInnerHTML={{ __html: simpleMarkdown(whatToBring) }} />
          </div>
        )}

        {/* Details */}
        <div className="px-6 pb-5 space-y-3">
          {isPreview && previewText ? (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3.5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeWidth="2" strokeLinecap="round" /></svg>
                </div>
                <div className="self-center">
                  <p className="text-sm font-medium text-amber-800">{previewText}</p>
                  <p className="text-sm text-amber-800 mt-0.5">{i18n.workshops.preview_come_back}</p>
                </div>
              </div>
            </div>
          ) : sessions.length > 0 && (
            <div className="rounded-xl border border-teal/12 bg-gradient-to-br from-white to-teal/[0.04] px-4 py-3.5">
              <div className="flex items-start gap-3">
                <AddToCalendar danceClass={dc} sessions={sessions} locale={locale} variant="icon" />
                <div className="text-sm flex-1">
                  <span className="font-semibold text-text">{sessions.length} {sessions.length === 1 ? i18n.workshops.session : i18n.workshops.sessions}:</span>
                  <div className="mt-1.5 space-y-1 text-text-muted">
                    {sessions.map((s) => (
                      <div key={s.id} className="flex items-baseline gap-1.5 tabular-nums">
                        <span>{new Date(s.session_date).toLocaleDateString(dtLocale, { weekday: 'short', day: 'numeric', month: 'short' })},</span>
                        <span className="text-text">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
                        {s.note && <span className="text-xs text-accent-dark italic ml-1">{s.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isPreview && (dc.location || dc.price_eur != null || dc.is_donation) && (
            <div className="flex flex-wrap lg:flex-nowrap items-start gap-2">
              {dc.location && (dc.location_url ? (
                <a
                  href={dc.location_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={locale === 'de' ? 'Auf Google Maps öffnen' : 'Open in Google Maps'}
                  aria-label={`${dc.location} – ${locale === 'de' ? 'auf Google Maps öffnen' : 'open in Google Maps'}`}
                  className="group inline-flex items-start gap-2 bg-white border border-gray-150 rounded-2xl px-3 py-2 shadow-sm hover:border-primary hover:bg-primary/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 transition-all lg:flex-1 lg:min-w-0"
                >
                  <svg className="w-3.5 h-3.5 text-coral mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                  <span className="leading-tight min-w-0 flex-1">
                    <span className="font-semibold text-text group-hover:text-primary transition-colors inline-flex items-center gap-1">
                      {dc.location}
                      <svg className="w-3 h-3 text-text-muted group-hover:text-primary transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-9 9M5 5h4M5 5v14h14v-4" /></svg>
                    </span>
                    {dc.location_details && (
                      <span className="block text-[11px] text-text-muted mt-0.5 whitespace-nowrap truncate">{dc.location_details}</span>
                    )}
                  </span>
                </a>
              ) : (
                <span className="inline-flex items-start gap-2 bg-white border border-gray-150 rounded-2xl px-3 py-2 shadow-sm lg:flex-1 lg:min-w-0">
                  <svg className="w-3.5 h-3.5 text-coral mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                  <span className="leading-tight min-w-0">
                    <span className="block font-semibold text-text">{dc.location}</span>
                    {dc.location_details && (
                      <span className="block text-[11px] text-text-muted mt-0.5 whitespace-nowrap truncate">{dc.location_details}</span>
                    )}
                  </span>
                </span>
              ))}
              {dc.is_donation ? (
                <span className="inline-flex items-start gap-2 bg-teal/8 border border-teal/20 rounded-2xl px-3 py-2 shadow-sm shrink-0">
                  <span className="text-teal mt-0.5">♥</span>
                  <span className="leading-tight">
                    <span className="block font-semibold text-teal-dark">{locale === 'de' ? 'Freiwillige Spende' : 'Voluntary donation'}</span>
                    <span className="block text-[11px] text-teal-dark/80 mt-0.5">{locale === 'de' ? 'Zur Deckung der Saalmiete' : 'To help cover the studio rental'}</span>
                  </span>
                </span>
              ) : dc.price_eur != null && (
                <span className="inline-flex items-start bg-white border border-gray-150 rounded-2xl px-3 py-2 shadow-sm shrink-0">
                  <span className="leading-tight">
                    <span className="block font-semibold text-text">{fmtCurrency(Number(dc.price_eur))}</span>
                    <span className="block text-[11px] text-text-muted">{i18n.workshops.cost}</span>
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Registration status + CTA */}
        {classState === 'upcoming' && dc.registration_opens_at && (
          <div className="px-6 py-3 text-sm font-medium bg-amber-50/80 text-amber-700 border-t border-amber-100">
            {i18n.workshops.registration_opens} {fmtDateTime(dc.registration_opens_at)}
          </div>
        )}
        {classState === 'open' && !isPreview && (
          <>
            {dc.registration_closes_at && (
              <div className="px-6 py-3 text-sm font-medium bg-gray-50 text-text-muted border-t border-gray-100">
                {i18n.workshops.registration_closes} {fmtDateTime(dc.registration_closes_at)}
              </div>
            )}
            <div className="px-6 pb-6 pt-3">
              <a
                href={`${base}/${locale}/workshops/?class=${dc.id}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-teal px-5 py-3 font-semibold text-white transition-all hover:bg-teal-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {i18n.workshops.register}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </a>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {classes.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {classes.map(renderClassCard)}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-teal/25 bg-gradient-to-br from-teal/[0.06] via-surface to-coral/[0.04] px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal/10 text-teal">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.8" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <p className="font-display text-xl font-bold text-primary">{i18n.workshops.no_current_workshops}</p>
          <p className="max-w-sm text-sm text-text-muted">{i18n.workshops.no_current_workshops_hint}</p>
        </div>
      )}
      {archivedClasses.length > 0 && (
        <div className={classes.length > 0 ? 'mt-16' : ''}>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-px flex-1 bg-text-muted/20"></span>
            <h3 className="font-display text-lg font-bold text-text-muted">{i18n.workshops.archive}</h3>
            <span className="h-px flex-1 bg-text-muted/20"></span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
            {archivedClasses.map((dc) => {
              const title = locale === 'de' ? dc.title_de : dc.title_en;
              const description = locale === 'de' ? dc.description_de : dc.description_en;
              const whatToBring = locale === 'de' ? dc.what_to_bring_de : dc.what_to_bring_en;
              const sessions = dc.sessions || [];
              const isExpanded = expandedArchived.has(dc.id);
              return (
                <div
                  key={dc.id}
                  onClick={() => toggleArchived(dc.id)}
                  className="bg-surface/60 rounded-2xl border border-bg-warm opacity-70 cursor-pointer hover:opacity-90 hover:shadow-lift hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex justify-between items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          {dc.dance && <span className="text-[11px] font-bold uppercase tracking-widest text-accent-dark">{dc.dance}</span>}
                          {dc.dance && dc.teachers && <span className="text-text-muted/30">·</span>}
                          {dc.teachers && <span className="text-[11px] font-medium text-text-muted tracking-wide">{dc.teachers}</span>}
                        </div>
                        <h4 className="font-display font-semibold text-text">{title}</h4>
                      </div>
                      <div className="mt-2 flex gap-2 items-start shrink-0">
                        {dc.level && (
                          <span className="text-xs bg-gray-100 text-text-muted font-medium px-3 py-1 rounded-full">{dc.level}</span>
                        )}
                        <span className="text-text-muted text-sm transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
                      </div>
                    </div>
                    {!isExpanded && sessions.length > 0 && (
                      <p className="text-sm text-text-muted mt-1.5 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-teal shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeWidth="2" strokeLinecap="round" /></svg>
                        {new Date(sessions[0].session_date).toLocaleDateString(dtLocale, { month: 'short', year: 'numeric' })}
                        {sessions.length > 1 && ` – ${new Date(sessions[sessions.length - 1].session_date).toLocaleDateString(dtLocale, { month: 'short', year: 'numeric' })}`}
                        {' '}({sessions.length}x)
                      </p>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3">
                      {description && <div className="text-text-muted text-sm leading-relaxed [&_strong]:text-text" dangerouslySetInnerHTML={{ __html: simpleMarkdown(description) }} />}
                      {whatToBring && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-teal mb-1.5">{i18n.workshops.what_to_bring}</p>
                          <div className="text-text-muted text-sm leading-relaxed [&_li]:ml-4" dangerouslySetInnerHTML={{ __html: simpleMarkdown(whatToBring) }} />
                        </div>
                      )}
                      {sessions.length > 0 && (
                        <div className="rounded-xl border border-teal/12 bg-gradient-to-br from-white to-teal/[0.04] px-4 py-3.5">
                          <div className="flex items-start gap-3">
                            <AddToCalendar danceClass={dc} sessions={sessions} locale={locale} variant="icon" />
                            <div className="text-sm flex-1">
                              <span className="font-semibold text-text">{sessions.length} {sessions.length === 1 ? i18n.workshops.session : i18n.workshops.sessions}:</span>
                              <div className="mt-1.5 space-y-1 text-text-muted">
                                {sessions.map((s) => (
                                  <div key={s.id} className="flex items-baseline gap-1.5 tabular-nums">
                                    <span>{new Date(s.session_date).toLocaleDateString(dtLocale, { weekday: 'short', day: 'numeric', month: 'short' })},</span>
                                    <span className="text-text">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
                                    {s.note && <span className="text-xs text-accent-dark italic ml-1">{s.note}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
