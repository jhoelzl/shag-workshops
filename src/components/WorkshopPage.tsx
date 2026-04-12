import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { simpleMarkdown } from '../lib/markdown';
import { getClassState } from '../lib/classState';
import type { DanceClass, ClassSession } from '../lib/database.types';
import type { Locale } from '../i18n/index';
import RegistrationForm from './RegistrationForm';
import de from '../i18n/de.json';
import en from '../i18n/en.json';

const translations = { de, en };

interface ClassWithCounts extends DanceClass {
  leads_available: number;
  follows_available: number;
  sessions: ClassSession[];
}

export default function WorkshopPage({ locale }: { locale: Locale }) {
  const [classes, setClasses] = useState<ClassWithCounts[]>([]);
  const [archivedClasses, setArchivedClasses] = useState<ClassWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const i18n = translations[locale];
  const dtLocale = locale === 'de' ? 'de-AT' : 'en-AT';
  const fmtCurrency = (v: number) => new Intl.NumberFormat(dtLocale, { style: 'currency', currency: 'EUR' }).format(v);

  // Read ?class= from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const classParam = params.get('class');
    if (classParam) setSelectedId(classParam);
  }, []);

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
        supabase.from('class_sessions').select('*').in('dance_class_id', classIds).order('session_date', { ascending: true }),
      ]);

      const countsMap = new Map(counts?.map((c) => [c.dance_class_id, c]));
      const sessionsMap = new Map<string, ClassSession[]>();
      for (const s of sessions || []) {
        if (!sessionsMap.has(s.dance_class_id)) sessionsMap.set(s.dance_class_id, []);
        sessionsMap.get(s.dance_class_id)!.push(s);
      }

      const merged: ClassWithCounts[] = classData.map((dc) => {
        const c = countsMap.get(dc.id);
        return {
          ...dc,
          leads_available: Number(c?.leads_available ?? dc.max_leads),
          follows_available: Number(c?.follows_available ?? dc.max_follows),
          sessions: sessionsMap.get(dc.id) || [],
        };
      });

      // Sort by first session date
      merged.sort((a, b) => {
        const dateA = a.sessions?.[0]?.session_date ?? '';
        const dateB = b.sessions?.[0]?.session_date ?? '';
        return dateA.localeCompare(dateB);
      });

      const active = merged.filter((dc) => {
        const state = getClassState(dc.sessions || [], dc.registration_opens_at, dc.registration_closes_at);
        return state === 'upcoming' || state === 'open';
      });
      const archived = merged.filter((dc) => {
        const state = getClassState(dc.sessions || [], dc.registration_opens_at, dc.registration_closes_at);
        return state === 'archived';
      });

      setClasses(active);
      setArchivedClasses(archived);
      setLoading(false);
    }
    fetchClasses();
  }, []);

  const allClasses = [...classes, ...archivedClasses];
  const availableLevels = useMemo(() => {
    const levels = new Set(allClasses.map((c) => c.level).filter(Boolean));
    return Array.from(levels).sort();
  }, [allClasses]);

  const filteredClasses = filterLevel === 'all' ? classes : classes.filter((dc) => dc.level === filterLevel);
  const filteredArchived = filterLevel === 'all' ? archivedClasses : archivedClasses.filter((dc) => dc.level === filterLevel);
  const openClasses = classes.filter((dc) => getClassState(dc.sessions || [], dc.registration_opens_at, dc.registration_closes_at) === 'open');
  const supabaseFunctionsUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1`;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (classes.length === 0 && archivedClasses.length === 0) {
    return <p className="text-text-muted text-center py-12">{i18n.home.no_workshops}</p>;
  }

  return (
    <div>
    {/* Level filter */}
    {availableLevels.length > 1 && (
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        <button
          onClick={() => setFilterLevel('all')}
          className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${filterLevel === 'all' ? 'bg-teal text-white shadow-sm' : 'bg-teal/8 text-teal-dark hover:bg-teal/15'}`}
        >
          {i18n.workshops.filter_all_levels}
        </button>
        {availableLevels.map((level) => (
          <button
            key={level}
            onClick={() => setFilterLevel(level!)}
            className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${filterLevel === level ? 'bg-teal text-white shadow-sm' : 'bg-teal/8 text-teal-dark hover:bg-teal/15'}`}
          >
            {level}
          </button>
        ))}
      </div>
    )}

    <div className="grid gap-8 lg:grid-cols-5">
      {/* Class list */}
      <div className="lg:col-span-3 space-y-4">
        {filteredClasses.length === 0 && (
          <div className="bg-surface rounded-2xl border border-bg-warm p-6 text-center">
            <p className="font-semibold text-primary">{i18n.workshops.no_current_workshops}</p>
            {filterLevel !== 'all' && (
              <p className="text-sm text-text-muted mt-2">{i18n.workshops.no_current_workshops_for_level}</p>
            )}
          </div>
        )}
        {filteredClasses.map((dc) => {
          const title = locale === 'de' ? dc.title_de : dc.title_en;
          const description = locale === 'de' ? dc.description_de : dc.description_en;
          const whatToBring = locale === 'de' ? dc.what_to_bring_de : dc.what_to_bring_en;
          const isSelected = selectedId === dc.id;
          const sessions = dc.sessions || [];
          const isPlanned = getClassState(sessions, dc.registration_opens_at, dc.registration_closes_at) === 'upcoming';
          const isOpen = getClassState(sessions, dc.registration_opens_at, dc.registration_closes_at) === 'open';

          return (
            <div
              key={dc.id}
              onClick={() => !isPlanned && setSelectedId(dc.id)}
              className={`bg-surface rounded-2xl transition-all duration-300 border-2 overflow-hidden ${
                isPlanned
                  ? 'border-transparent shadow-sm'
                  : isSelected
                    ? 'border-teal shadow-lg -translate-y-0.5 cursor-pointer'
                    : 'border-transparent shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
              }`}
            >
              {/* Header */}
              <div className="px-5 pt-5 pb-3">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {dc.dance && <span className="text-[11px] font-bold uppercase tracking-widest text-accent-dark">{dc.dance}</span>}
                      {dc.dance && dc.teachers && <span className="text-text-muted/30">·</span>}
                      {dc.teachers && <span className="text-[11px] font-medium text-text-muted tracking-wide">{dc.teachers}</span>}
                    </div>
                    <h3 className="font-display text-xl font-bold text-primary leading-tight">{title}</h3>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    {dc.level && (
                      <span className="text-xs bg-teal/10 text-teal-dark font-semibold px-3 py-1 rounded-full">{dc.level}</span>
                    )}
                    {isSelected && !isPlanned && (
                      <span className="w-7 h-7 bg-teal text-white rounded-full flex items-center justify-center text-sm">✓</span>
                    )}
                  </div>
                </div>
              </div>

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
                {sessions.length > 0 && (
                  <div className="rounded-xl border border-teal/12 bg-gradient-to-br from-white to-teal/[0.04] px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeWidth="2" strokeLinecap="round" /></svg>
                      </div>
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

                {(dc.location || dc.price_eur != null || dc.is_donation) && (
                  <div className="flex flex-wrap gap-2">
                    {dc.location && (
                      <span className="inline-flex items-center gap-1.5 bg-white border border-gray-150 rounded-full px-3.5 py-1.5 text-sm shadow-sm">
                        <svg className="w-3.5 h-3.5 text-coral" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                        {dc.location_url ? (
                          <a href={dc.location_url} target="_blank" rel="noopener noreferrer" className="font-medium text-text hover:text-primary transition-colors" onClick={(e) => e.stopPropagation()}>
                            {dc.location}
                          </a>
                        ) : (
                          <span className="font-medium text-text">{dc.location}</span>
                        )}
                      </span>
                    )}
                    {dc.is_donation ? (
                      <span className="inline-flex items-center gap-1.5 bg-teal/8 border border-teal/15 rounded-full px-3.5 py-1.5 text-sm shadow-sm">
                        <span className="text-teal">♥</span>
                        <span className="font-semibold text-teal-dark">{locale === 'de' ? 'Freiwillige Spende' : 'Voluntary Donation'}</span>
                      </span>
                    ) : dc.price_eur != null && (
                      <span className="inline-flex items-center gap-1.5 bg-white border border-gray-150 rounded-full px-3.5 py-1.5 text-sm shadow-sm">
                        <span className="text-teal font-bold text-base leading-none">€</span>
                        <span className="font-semibold text-text">{fmtCurrency(Number(dc.price_eur))}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Registration status */}
              {(isPlanned || isOpen) && (dc.registration_opens_at || dc.registration_closes_at) && (
                <div className={`px-5 py-2.5 text-sm font-medium ${isPlanned ? 'bg-amber-50/80 text-amber-700 border-t border-amber-100' : 'bg-gray-50 text-text-muted border-t border-gray-100'}`}>
                  {isPlanned && dc.registration_opens_at && (
                    <span>{i18n.workshops.registration_opens} {new Date(dc.registration_opens_at).toLocaleString(dtLocale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                  )}
                  {isOpen && dc.registration_closes_at && (
                    <span>{i18n.workshops.registration_closes} {new Date(dc.registration_closes_at).toLocaleString(dtLocale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Registration form (sticky on desktop) — only for open classes */}
      {openClasses.length > 0 && (
        <div className="lg:col-span-2 lg:sticky lg:top-24 lg:self-start">
          <RegistrationForm
            locale={locale}
            danceClasses={openClasses}
            supabaseFunctionsUrl={supabaseFunctionsUrl}
            supabaseAnonKey={supabaseAnonKey}
            preselectedClassId={selectedId}
          />
        </div>
      )}
    </div>

    {/* Archive section */}
    {filteredArchived.length > 0 && (
      <div className="mt-16">
        <div className="flex items-center gap-3 mb-6">
          <span className="h-px flex-1 bg-text-muted/20"></span>
          <h3 className="font-display text-lg font-bold text-text-muted">{i18n.workshops.archive}</h3>
          <span className="h-px flex-1 bg-text-muted/20"></span>
        </div>
        <div className="space-y-3">
          {filteredArchived.map((dc) => {
            const title = locale === 'de' ? dc.title_de : dc.title_en;
            const description = locale === 'de' ? dc.description_de : dc.description_en;
            const whatToBring = locale === 'de' ? dc.what_to_bring_de : dc.what_to_bring_en;
            const sessions = dc.sessions || [];
            const isExpanded = selectedId === dc.id;
            return (
              <div
                key={dc.id}
                onClick={() => setSelectedId(isExpanded ? null : dc.id)}
                className="bg-surface/60 rounded-2xl border border-bg-warm opacity-70 cursor-pointer hover:opacity-90 transition-all duration-300 overflow-hidden"
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
                    <div className="flex gap-2 items-center shrink-0">
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
                    <div className="space-y-3">
                      {sessions.length > 0 && (
                        <div className="rounded-xl border border-teal/12 bg-gradient-to-br from-white to-teal/[0.04] px-4 py-3.5">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
                              <svg className="w-4 h-4 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeWidth="2" strokeLinecap="round" /></svg>
                            </div>
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

                      {(dc.location || dc.price_eur != null || dc.is_donation) && (
                        <div className="flex flex-wrap gap-2">
                          {dc.location && (
                            <span className="inline-flex items-center gap-1.5 bg-white border border-gray-150 rounded-full px-3.5 py-1.5 text-sm shadow-sm">
                              <svg className="w-3.5 h-3.5 text-coral" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                              {dc.location_url ? (
                                <a href={dc.location_url} target="_blank" rel="noopener noreferrer" className="font-medium text-text hover:text-primary transition-colors" onClick={(e) => e.stopPropagation()}>
                                  {dc.location}
                                </a>
                              ) : (
                                <span className="font-medium text-text">{dc.location}</span>
                              )}
                            </span>
                          )}
                          {dc.is_donation ? (
                            <span className="inline-flex items-center gap-1.5 bg-teal/8 border border-teal/15 rounded-full px-3.5 py-1.5 text-sm shadow-sm">
                              <span className="text-teal">♥</span>
                              <span className="font-semibold text-teal-dark">{locale === 'de' ? 'Freiwillige Spende' : 'Voluntary Donation'}</span>
                            </span>
                          ) : dc.price_eur != null && (
                            <span className="inline-flex items-center gap-1.5 bg-white border border-gray-150 rounded-full px-3.5 py-1.5 text-sm shadow-sm">
                              <span className="text-teal font-bold text-base leading-none">€</span>
                              <span className="font-semibold text-text">{fmtCurrency(Number(dc.price_eur))}</span>
                            </span>
                          )}
                        </div>
                      )}
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
