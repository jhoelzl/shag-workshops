import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { simpleMarkdown } from '../lib/markdown';
import { getClassState } from '../lib/classState';
import type { DanceClass, ClassSession } from '../lib/database.types';
import type { Locale } from '../i18n/index';
import RegistrationForm from './RegistrationForm';
import AddToCalendar from './AddToCalendar';
import de from '../i18n/de.json';
import en from '../i18n/en.json';

const translations = { de, en };

interface ClassWithCounts extends DanceClass {
  leads_available: number;
  follows_available: number;
  sessions: ClassSession[];
}

interface Props {
  locale: Locale;
  initialClasses: ClassWithCounts[];
}

export default function WorkshopPage({ locale, initialClasses }: Props) {
  const [classesData, setClassesData] = useState<ClassWithCounts[]>(initialClasses);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dataFetched, setDataFetched] = useState(false);

  // Fetch fresh data on mount to ensure we have latest from DB
  useEffect(() => {
    async function fetchFreshData() {
      const { data: publicClassesData } = await supabase
        .from('dance_classes')
        .select('*, image_url, image_overlay_alpha, headline_color')
        .eq('is_public', true);

      if (!publicClassesData || publicClassesData.length === 0) {
        setDataFetched(true);
        return;
      }

      const classIds = publicClassesData.map((c) => c.id);

      const [{ data: countsData }, { data: sessionsData }] = await Promise.all([
        supabase.from('class_registration_counts').select('*').in('dance_class_id', classIds),
        supabase
          .from('class_sessions')
          .select('*')
          .in('dance_class_id', classIds)
          .order('session_date', { ascending: true })
          .order('start_time', { ascending: true }),
      ]);

      const sessionsMap = new Map<string, ClassSession[]>();
      for (const s of sessionsData || []) {
        if (!sessionsMap.has(s.dance_class_id)) sessionsMap.set(s.dance_class_id, []);
        sessionsMap.get(s.dance_class_id)!.push(s);
      }

      const countsMap = new Map(countsData?.map((c) => [c.dance_class_id, c]));

      const merged = publicClassesData.map((dc: DanceClass) => {
        const counts = countsMap.get(dc.id);
        return {
          ...dc,
          leads_available: Number(counts?.leads_available ?? dc.max_leads),
          follows_available: Number(counts?.follows_available ?? dc.max_follows),
          sessions: sessionsMap.get(dc.id) || [],
        };
      });

      // Sort classes chronologically by first session date and time
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

      setClassesData(merged);
      setDataFetched(true);
    }

    fetchFreshData();
  }, []);

  function WorkshopCardSkeleton({ compact = false }: { compact?: boolean }) {
    return (
      <div className={`bg-surface rounded-2xl border border-primary/10 shadow-sm overflow-hidden animate-pulse ${compact ? 'opacity-80' : ''}`}>
        <div className="px-5 pt-5 pb-3 flex justify-between items-start gap-3">
          <div className="flex-1 space-y-2">
            <div className="h-2.5 w-28 rounded bg-primary/10" />
            <div className="h-6 w-2/3 rounded bg-primary/10" />
          </div>
          <div className="h-6 w-16 rounded-full bg-primary/10 shrink-0" />
        </div>
        <div className="px-5 pb-3 space-y-2 min-h-[4.75rem]">
          <div className="h-3 w-full rounded bg-primary/5" />
          <div className="h-3 w-5/6 rounded bg-primary/5" />
          <div className="h-3 w-2/3 rounded bg-primary/5" />
        </div>
        <div className="px-5 pb-4 space-y-3">
          <div className="rounded-xl border border-primary/10 bg-primary/5 px-4 py-3.5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-24 rounded bg-primary/10" />
              <div className="h-3 w-40 rounded bg-primary/10" />
              <div className="h-3 w-36 rounded bg-primary/10" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-10 flex-1 rounded-2xl bg-primary/5" />
            <div className="h-10 w-24 rounded-2xl bg-primary/5 shrink-0" />
          </div>
        </div>
      </div>
    );
  }

  function toggleSelectedId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const i18n = translations[locale];
  const dtLocale = locale === 'de' ? 'de-AT' : 'en-AT';
  const fmtCurrency = (v: number) => new Intl.NumberFormat(dtLocale, { style: 'currency', currency: 'EUR' }).format(v);
  const fmtDateTime = (value: string) => {
    const dt = new Date(value);
    const date = dt.toLocaleDateString(dtLocale, { day: 'numeric', month: 'long', year: 'numeric' });
    const time = dt.toLocaleTimeString(dtLocale, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date}, ${time}`;
  };

  // Read ?class= from URL on mount and handle loading state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const classParam = params.get('class');
    if (classParam) setSelectedIds(new Set([classParam]));
    if (dataFetched) setLoading(false);
  }, [dataFetched]);

  const allClasses = classesData;
  const classes = useMemo(
    () => allClasses.filter((dc) => {
      const state = getClassState(dc.sessions || [], dc.registration_opens_at, dc.registration_closes_at);
      return (state === 'upcoming' || state === 'open') && !dc.is_preview;
    }),
    [allClasses]
  );
  const previewClasses = useMemo(
    () => allClasses.filter((dc) => {
      const state = getClassState(dc.sessions || [], dc.registration_opens_at, dc.registration_closes_at);
      return (state === 'upcoming' || state === 'open') && dc.is_preview;
    }),
    [allClasses]
  );
  const ongoingClasses = useMemo(
    () => allClasses.filter((dc) => {
      const state = getClassState(dc.sessions || [], dc.registration_opens_at, dc.registration_closes_at);
      return state === 'ongoing';
    }),
    [allClasses]
  );
  const availableLevels = useMemo(() => {
    const levels = new Set(allClasses.map((c) => c.level).filter(Boolean));
    return Array.from(levels).sort();
  }, [allClasses]);

  const filteredClasses = filterLevel === 'all' ? classes : classes.filter((dc) => dc.level === filterLevel);
  const filteredPreview = filterLevel === 'all' ? previewClasses : previewClasses.filter((dc) => dc.level === filterLevel);
  const filteredOngoing = filterLevel === 'all' ? ongoingClasses : ongoingClasses.filter((dc) => dc.level === filterLevel);
  const openClasses = classes.filter((dc) => getClassState(dc.sessions || [], dc.registration_opens_at, dc.registration_closes_at) === 'open');
  const supabaseFunctionsUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1`;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (loading) {
    return (
      <div className="pt-2 space-y-8" aria-hidden="true">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3 space-y-4">
            {[0, 1, 2].map((i) => (
              <WorkshopCardSkeleton key={i} />
            ))}
          </div>
          <div className="min-w-0 lg:col-span-2">
            <div className="bg-surface rounded-2xl border border-primary/10 shadow-sm p-5 animate-pulse space-y-3">
              <div className="h-6 w-2/3 rounded bg-primary/10" />
              <div className="h-4 w-full rounded bg-primary/5" />
              <div className="h-4 w-5/6 rounded bg-primary/5" />
              <div className="h-10 w-full rounded-xl bg-primary/10" />
              <div className="h-10 w-full rounded-xl bg-primary/10" />
              <div className="h-12 w-full rounded-full bg-primary/10" />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-5 w-40 rounded bg-primary/10 mx-auto" />
          {[0, 1].map((i) => (
            <WorkshopCardSkeleton key={`compact-${i}`} compact />
          ))}
        </div>
      </div>
    );
  }

  function renderMetaBadges(dc: ClassWithCounts) {
    if (dc.is_preview) return null;
    if (!dc.location && dc.price_eur == null && !dc.is_donation) return null;

    return (
      <div className="flex flex-wrap gap-2">
        {dc.location && (dc.location_url ? (
          <a
            href={dc.location_url}
            target="_blank"
            rel="noopener noreferrer"
            title={locale === 'de' ? 'Auf Google Maps öffnen' : 'Open in Google Maps'}
            aria-label={`${dc.location} – ${locale === 'de' ? 'auf Google Maps öffnen' : 'open in Google Maps'}`}
            className="group inline-flex items-start gap-2 bg-white border border-gray-150 rounded-2xl px-3 py-2 shadow-sm hover:border-primary hover:bg-primary/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-3.5 h-3.5 text-coral mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
            <span className="leading-tight">
              <span className="font-semibold text-text group-hover:text-primary transition-colors inline-flex items-center gap-1">
                {dc.location}
                <svg className="w-3 h-3 text-text-muted group-hover:text-primary transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-9 9M5 5h4M5 5v14h14v-4" /></svg>
              </span>
              {dc.location_details && (
                <span className="block text-[11px] text-text-muted mt-0.5">{dc.location_details}</span>
              )}
            </span>
          </a>
        ) : (
          <span className="inline-flex items-start gap-2 bg-white border border-gray-150 rounded-2xl px-3 py-2 shadow-sm">
            <svg className="w-3.5 h-3.5 text-coral mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
            <span className="leading-tight">
              <span className="block font-semibold text-text">{dc.location}</span>
              {dc.location_details && (
                <span className="block text-[11px] text-text-muted mt-0.5">{dc.location_details}</span>
              )}
            </span>
          </span>
        ))}

        {dc.is_donation ? (
          <span className="inline-flex items-start gap-2 bg-teal/8 border border-teal/20 rounded-2xl px-3 py-2 shadow-sm">
            <span className="text-teal mt-0.5">♥</span>
            <span className="leading-tight">
              <span className="block font-semibold text-teal-dark">
                {locale === 'de'
                  ? (dc.donation_text_de || 'Freiwillige Spende')
                  : (dc.donation_text_en || 'Voluntary donation')}
              </span>
              <span className="block text-[11px] text-teal-dark/80 mt-0.5">
                {locale === 'de'
                  ? (dc.donation_subtext_de || 'Zur Deckung der Saalmiete')
                  : (dc.donation_subtext_en || 'To help cover the studio rental')}
              </span>
            </span>
          </span>
        ) : dc.price_eur != null && (
          <span className="inline-flex items-start bg-white border border-gray-150 rounded-2xl px-3 py-2 shadow-sm">
            <span className="leading-tight">
              <span className="block font-semibold text-text">{fmtCurrency(Number(dc.price_eur))}</span>
              <span className="block text-[11px] text-text-muted">{i18n.workshops.cost}</span>
            </span>
          </span>
        )}
      </div>
    );
  }

  if (classes.length === 0 && ongoingClasses.length === 0) {
    return <p className="text-text-muted text-center py-12">{i18n.home.no_workshops}</p>;
  }

  return (
    <div className="pt-2">
    {/* Level filter */}
    {availableLevels.length > 1 && (
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        <button
          onClick={() => setFilterLevel('all')}
          className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${filterLevel === 'all' ? 'bg-teal text-white shadow-sm' : 'bg-teal/8 text-teal-dark hover:bg-teal/15'}`}
        >
          {i18n.workshops.filter_all_levels}
        </button>
        {availableLevels.map((level) => (
          <button
            key={level}
            onClick={() => setFilterLevel(level!)}
            className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${filterLevel === level ? 'bg-teal text-white shadow-sm' : 'bg-teal/8 text-teal-dark hover:bg-teal/15'}`}
          >
            {level}
          </button>
        ))}
      </div>
    )}

    {filteredClasses.length === 0 && filteredOngoing.length > 0 && (
      <div className="bg-surface rounded-2xl border border-bg-warm p-4 text-center mb-8">
        <p className="font-semibold text-text">{i18n.workshops.no_current_workshops_ongoing}</p>
        <p className="text-sm text-text-muted mt-1.5">
          {i18n.workshops.no_current_workshops_ongoing_info}
        </p>
      </div>
    )}

    <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
      {filteredClasses.length === 0 && filteredOngoing.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-accent/20 bg-gradient-to-br from-bg-warm via-accent/[0.07] to-coral/[0.08] shadow-soft px-6 py-14 text-center lg:col-span-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent-dark">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.8" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <p className="font-display text-xl font-bold text-primary">{i18n.workshops.no_current_workshops}</p>
          {filterLevel !== 'all' ? (
            <p className="max-w-sm text-sm text-text-muted">{i18n.workshops.no_current_workshops_for_level}</p>
          ) : (
            <p className="max-w-sm text-sm text-text-muted">{i18n.workshops.no_current_workshops_hint}</p>
          )}
        </div>
      )}
      {/* Class list */}
      <div className="min-w-0 lg:col-span-3 space-y-4">
        {filteredClasses.map((dc) => {
          const title = locale === 'de' ? dc.title_de : dc.title_en;
          const description = locale === 'de' ? dc.description_de : dc.description_en;
          const whatToBring = locale === 'de' ? dc.what_to_bring_de : dc.what_to_bring_en;
          const previewText = locale === 'de' ? dc.preview_text_de : dc.preview_text_en;
          const isSelected = selectedIds.has(dc.id);
          const sessions = dc.sessions || [];
          const isPlanned = getClassState(sessions, dc.registration_opens_at, dc.registration_closes_at) === 'upcoming';
          const isOpen = getClassState(sessions, dc.registration_opens_at, dc.registration_closes_at) === 'open';
          const isPreview = !!dc.is_preview;

          const alpha = dc.image_overlay_alpha ?? 40;
          const isDark = dc.headline_color !== 'black';
          const overlayOpacity = Math.max(alpha / 100 * 0.7, 0);

          return (
            <div
              key={dc.id}
              onClick={() => !isPlanned && !isPreview && toggleSelectedId(dc.id)}
              className={`bg-surface rounded-2xl transition-all duration-300 border-2 overflow-hidden hover:shadow-lift hover:-translate-y-0.5 ${
                isPlanned || isPreview
                  ? 'border-transparent shadow-sm'
                  : isSelected
                    ? 'border-teal shadow-lg -translate-y-0.5 cursor-pointer'
                    : 'border-transparent shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
              }`}
            >
              {/* Header with optional background image */}
              <div
                className={`relative ${dc.image_url ? 'min-h-[160px] sm:min-h-[180px]' : ''}`}
              >
                {dc.image_url && (
                  <>
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${dc.image_url})` }}
                    />
                    {/* Dark overlay for overall dimming */}
                    <div className="absolute inset-0 bg-black/60" style={{ opacity: overlayOpacity }} />
                    {/* Gradient overlay - stronger at top for header text, stronger at bottom for transition */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/40" />
                    {/* Top-focused gradient for better meta text readability */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-transparent" />
                    {/* Additional gradient for smooth transition to card body */}
                    <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" style={{ opacity: Math.min(overlayOpacity + 0.2, 1) }} />
                    {/* Subtle shadow effect */}
                    <div className="absolute inset-0 shadow-[inset_0_-20px_40px_-10px_rgba(0,0,0,0.4)]" />
                    {/* Preview ribbon */}
                    {isPreview && (
                      <div className="absolute top-4 -right-8 bg-amber-400/90 backdrop-blur-sm text-amber-900 text-[11px] font-bold uppercase tracking-wider py-1.5 px-14 shadow-lg z-20" style={{ transform: 'rotate(35deg)' }}>
                        {locale === 'de' ? 'Vorschau' : 'Preview'}
                      </div>
                    )}
                  </>
                )}
                <div className={`relative px-5 pt-5 pb-3 ${dc.image_url ? 'flex flex-col justify-end min-h-[160px] sm:min-h-[180px]' : ''}`}>
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className={`flex items-center gap-2 mb-1 ${dc.image_url ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]' : ''}`}>
                        {dc.dance && <span className={`text-[11px] font-bold uppercase tracking-widest ${dc.image_url ? (isDark ? 'text-white' : 'text-black') : 'text-accent-dark'}`} style={{ textShadow: dc.image_url ? (isDark ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px rgba(255,255,255,0.8)') : undefined }}>{dc.dance}</span>}
                        {dc.dance && dc.teachers && <span className={`${dc.image_url ? (isDark ? 'text-white/70' : 'text-black/60') : 'text-text-muted/30'}`}>·</span>}
                        {dc.teachers && <span className={`text-[11px] font-medium tracking-wide ${dc.image_url ? (isDark ? 'text-white/95' : 'text-black/85') : 'text-text-muted'}`} style={{ textShadow: dc.image_url ? (isDark ? '0 1px 2px rgba(0,0,0,0.7)' : '0 1px 2px rgba(255,255,255,0.7)') : undefined }}>{dc.teachers}</span>}
                      </div>
                      <h3 className={`font-display text-xl font-bold leading-tight ${dc.image_url ? (isDark ? 'text-white' : 'text-black') : 'text-primary'}`} style={{ textShadow: dc.image_url ? (isDark ? '0 2px 4px rgba(0,0,0,0.6)' : '0 1px 2px rgba(255,255,255,0.9)') : undefined }}>{title}</h3>
                    </div>
                    <div className="mt-2 flex gap-2 items-start shrink-0">
                      {dc.level && (
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${dc.image_url ? (isDark ? 'bg-white/95 text-primary shadow-lg backdrop-blur-sm' : 'bg-black/90 text-white shadow-lg backdrop-blur-sm') : 'bg-teal/10 text-teal-dark'}`}>{dc.level}</span>
                      )}
                      {isSelected && !isPlanned && !isPreview && (
                        <span className="w-7 h-7 bg-teal text-white rounded-full flex items-center justify-center text-sm shadow-lg">✓</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Spacer for image cards */}
              {dc.image_url && <div className="pt-4" />}

              {/* Description */}
              {description && (
                <div className="px-5 pb-3">
                  <div className="text-text-muted text-sm leading-relaxed [&_strong]:text-text" dangerouslySetInnerHTML={{ __html: simpleMarkdown(description) }} />
                </div>
              )}

              {/* What to Bring */}
              {whatToBring && (
                <div className="px-5 pb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-teal mb-1.5">{i18n.workshops.what_to_bring}</p>
                  <div className="text-text-muted text-sm leading-relaxed [&_li]:ml-4" dangerouslySetInnerHTML={{ __html: simpleMarkdown(whatToBring) }} />
                </div>
              )}

              {/* Details */}
              <div className="px-5 pb-4 space-y-3">
                {dc.is_preview && previewText ? (
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

                {renderMetaBadges(dc)}
              </div>

              {/* Registration status */}
              {(isPlanned || isOpen) && (dc.registration_opens_at || dc.registration_closes_at) && (
                <div className={`px-5 py-2.5 text-sm font-medium ${isPlanned ? 'bg-amber-50/80 text-amber-700 border-t border-amber-100' : 'bg-gray-50 text-text-muted border-t border-gray-100'}`}>
                  {isPlanned && dc.registration_opens_at && (
                    <span>{i18n.workshops.registration_opens} {fmtDateTime(dc.registration_opens_at)}</span>
                  )}
                  {isOpen && dc.registration_closes_at && (
                    <span>{i18n.workshops.registration_closes} {fmtDateTime(dc.registration_closes_at)}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {/* Preview classes come after regular classes */}
        {filteredPreview.length > 0 && (
          <div className="space-y-4 mt-8">
            {filteredPreview.map((dc) => {
              const title = locale === 'de' ? dc.title_de : dc.title_en;
              const description = locale === 'de' ? dc.description_de : dc.description_en;
              const whatToBring = locale === 'de' ? dc.what_to_bring_de : dc.what_to_bring_en;
              const previewText = locale === 'de' ? dc.preview_text_de : dc.preview_text_en;
              const sessions = dc.sessions || [];
              const isSelected = selectedIds.has(dc.id);

              const alpha = dc.image_overlay_alpha ?? 40;
              const isDark = dc.headline_color !== 'black';
              const overlayOpacity = Math.max(alpha / 100 * 0.7, 0);

              return (
                <div
                  key={dc.id}
                  className="bg-surface rounded-2xl border-2 border-transparent shadow-sm overflow-hidden opacity-80"
                >
                  {/* Same header structure as regular classes */}
                  <div className={`relative ${dc.image_url ? 'min-h-[160px] sm:min-h-[180px]' : ''}`}>
                    {dc.image_url && (
                      <>
                        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${dc.image_url})` }} />
                        <div className="absolute inset-0 bg-black/60" style={{ opacity: overlayOpacity }} />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/40" />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" style={{ opacity: Math.min(overlayOpacity + 0.2, 1) }} />
                        <div className="absolute inset-0 shadow-[inset_0_-20px_40px_-10px_rgba(0,0,0,0.4)]" />
                        {/* Preview ribbon */}
                        <div className="absolute top-4 -right-8 bg-amber-400/90 backdrop-blur-sm text-amber-900 text-[11px] font-bold uppercase tracking-wider py-1.5 px-14 shadow-lg z-20" style={{ transform: 'rotate(35deg)' }}>
                          {locale === 'de' ? 'Vorschau' : 'Preview'}
                        </div>
                      </>
                    )}
                    <div className={`relative px-5 pt-5 pb-3 ${dc.image_url ? 'flex flex-col justify-end min-h-[160px] sm:min-h-[180px]' : ''}`}>
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                          <div className={`flex items-center gap-2 mb-1 ${dc.image_url ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]' : ''}`}>
                            {dc.dance && <span className={`text-[11px] font-bold uppercase tracking-widest ${dc.image_url ? (isDark ? 'text-white' : 'text-black') : 'text-accent-dark'}`} style={{ textShadow: dc.image_url ? (isDark ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px rgba(255,255,255,0.8)') : undefined }}>{dc.dance}</span>}
                            {dc.dance && dc.teachers && <span className={`${dc.image_url ? (isDark ? 'text-white/70' : 'text-black/60') : 'text-text-muted/30'}`}>·</span>}
                            {dc.teachers && <span className={`text-[11px] font-medium tracking-wide ${dc.image_url ? (isDark ? 'text-white/95' : 'text-black/85') : 'text-text-muted'}`} style={{ textShadow: dc.image_url ? (isDark ? '0 1px 2px rgba(0,0,0,0.7)' : '0 1px 2px rgba(255,255,255,0.7)') : undefined }}>{dc.teachers}</span>}
                          </div>
                          <h3 className={`font-display text-xl font-bold leading-tight ${dc.image_url ? (isDark ? 'text-white' : 'text-black') : 'text-primary'}`} style={{ textShadow: dc.image_url ? (isDark ? '0 2px 4px rgba(0,0,0,0.6)' : '0 1px 2px rgba(255,255,255,0.9)') : undefined }}>{title}</h3>
                        </div>
                        <div className="mt-2 flex gap-2 items-start shrink-0">
                          {dc.level && (
                            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${dc.image_url ? (isDark ? 'bg-white/95 text-primary shadow-lg backdrop-blur-sm' : 'bg-black/90 text-white shadow-lg backdrop-blur-sm') : 'bg-teal/10 text-teal-dark'}`}>{dc.level}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Spacer for image cards */}
                  {dc.image_url && <div className="pt-4" />}

                  {/* Rest of preview card */}
                  {description && (
                    <div className="px-5 pb-3">
                      <div className="text-text-muted text-sm leading-relaxed [&_strong]:text-text" dangerouslySetInnerHTML={{ __html: simpleMarkdown(description) }} />
                    </div>
                  )}
                  {whatToBring && (
                    <div className="px-5 pb-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-teal mb-1.5">{i18n.workshops.what_to_bring}</p>
                      <div className="text-text-muted text-sm leading-relaxed [&_li]:ml-4" dangerouslySetInnerHTML={{ __html: simpleMarkdown(whatToBring) }} />
                    </div>
                  )}
                  <div className="px-5 pb-4 space-y-3">
                    {previewText ? (
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
                    ) : null}
                    {renderMetaBadges(dc)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Registration form (sticky on desktop) - only for open classes */}
      {openClasses.length > 0 && (
        <div className="min-w-0 lg:col-span-2 lg:sticky lg:top-24 lg:self-start">
          <RegistrationForm
            locale={locale}
            danceClasses={openClasses}
            supabaseFunctionsUrl={supabaseFunctionsUrl}
            supabaseAnonKey={supabaseAnonKey}
            selectedClassIds={selectedIds}
            onToggleClass={toggleSelectedId}
          />
        </div>
      )}
    </div>

    {/* Ongoing section */}
    {filteredOngoing.length > 0 && (
      <div className="mt-16">
        <div className="flex items-center gap-3 mb-6">
          <span className="h-px flex-1 bg-text-muted/20"></span>
          <h3 className="font-display text-lg font-bold text-text-muted">{i18n.workshops.ongoing}</h3>
          <span className="h-px flex-1 bg-text-muted/20"></span>
        </div>
        <div className="space-y-3">
          {filteredOngoing.map((dc) => {
            const title = locale === 'de' ? dc.title_de : dc.title_en;
            const description = locale === 'de' ? dc.description_de : dc.description_en;
            const whatToBring = locale === 'de' ? dc.what_to_bring_de : dc.what_to_bring_en;
            const sessions = dc.sessions || [];
            const isExpanded = selectedIds.has(dc.id);
            return (
              <div
                key={dc.id}
                onClick={() => toggleSelectedId(dc.id)}
                className="bg-surface rounded-2xl border border-bg-warm cursor-pointer hover:shadow-lift hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
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
                        <span className="text-xs bg-teal/10 text-teal-dark font-medium px-3 py-1 rounded-full">{dc.level}</span>
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
                    <div className="space-y-3">
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

                      {renderMetaBadges(dc)}
                    </div>
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
