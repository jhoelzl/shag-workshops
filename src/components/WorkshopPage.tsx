import { useEffect, useState } from 'react';
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

  const openClasses = classes.filter((dc) => getClassState(dc.sessions || [], dc.registration_opens_at, dc.registration_closes_at) === 'open');
  const supabaseFunctionsUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1`;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  return (
    <div>
    <div className="grid gap-8 lg:grid-cols-5">
      {/* Class list */}
      <div className="lg:col-span-3 space-y-4">
        {classes.map((dc) => {
          const title = locale === 'de' ? dc.title_de : dc.title_en;
          const description = locale === 'de' ? dc.description_de : dc.description_en;
          const isSelected = selectedId === dc.id;
          const sessions = dc.sessions || [];
          const isPlanned = getClassState(sessions, dc.registration_opens_at, dc.registration_closes_at) === 'upcoming';
          const isOpen = getClassState(sessions, dc.registration_opens_at, dc.registration_closes_at) === 'open';

          return (
            <div
              key={dc.id}
              onClick={() => !isPlanned && setSelectedId(dc.id)}
              className={`bg-surface rounded-2xl p-5 transition-all duration-300 border-2 ${
                isPlanned
                  ? 'border-transparent shadow-sm'
                  : isSelected
                    ? 'border-teal shadow-lg -translate-y-0.5 cursor-pointer'
                    : 'border-transparent shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  {dc.dance && <span className="text-xs font-semibold uppercase tracking-wider text-accent-dark">{dc.dance}</span>}
                  <h3 className="font-display text-xl font-bold text-primary">{title}</h3>
                  {dc.teachers && <p className="text-sm text-text-muted">mit {dc.teachers}</p>}
                </div>
                <div className="flex gap-2 items-center">
                  {dc.level && (
                    <span className="text-xs bg-teal/10 text-teal-dark font-semibold px-3 py-1 rounded-full">{dc.level}</span>
                  )}
                  {isSelected && !isPlanned && (
                    <span className="text-xs bg-teal text-white font-semibold px-3 py-1 rounded-full">✓</span>
                  )}
                </div>
              </div>

              {description && <div className="border-l-2 border-teal/30 pl-3 text-text-muted text-sm mb-3 leading-relaxed [&_strong]:text-text" dangerouslySetInnerHTML={{ __html: simpleMarkdown(description) }} />}

              <div className="space-y-2 text-sm text-text-muted mb-3">
                {sessions.length > 0 && (
                  <div>
                    <div className="font-medium text-text mb-1">📅 {sessions.length} {sessions.length === 1 ? i18n.workshops.session : i18n.workshops.sessions}:</div>
                    <div className="space-y-0.5 ml-5">
                      {sessions.map((s) => (
                        <div key={s.id}>
                          {new Date(s.session_date).toLocaleDateString(dtLocale, { weekday: 'short', day: 'numeric', month: 'short' })},{' '}
                          {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                          {s.note && <span className="text-accent-dark ml-1">({s.note})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(dc.location || dc.price_eur != null) && (
                  <div className="flex items-center gap-3">
                    {dc.location && (
                      <span>
                        📍{' '}
                        {dc.location_url ? (
                          <a href={dc.location_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-teal transition-colors">
                            {dc.location}
                          </a>
                        ) : (
                          dc.location
                        )}
                      </span>
                    )}
                    {dc.location && dc.price_eur != null && <span className="text-text-muted/40">·</span>}
                    {dc.price_eur != null && <span>{fmtCurrency(Number(dc.price_eur))}</span>}
                  </div>
                )}
              </div>

              {isPlanned && dc.registration_opens_at && (
                <p className="text-sm text-accent-dark font-medium">
                  {i18n.workshops.registration_opens} {new Date(dc.registration_opens_at).toLocaleString(dtLocale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                </p>
              )}
              {isOpen && dc.registration_closes_at && (
                <p className="text-sm text-text-muted">
                  {i18n.workshops.registration_closes} {new Date(dc.registration_closes_at).toLocaleString(dtLocale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                </p>
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
    {archivedClasses.length > 0 && (
      <div className="mt-16">
        <div className="flex items-center gap-3 mb-6">
          <span className="h-px flex-1 bg-text-muted/20"></span>
          <h3 className="font-display text-lg font-bold text-text-muted">{i18n.workshops.archive}</h3>
          <span className="h-px flex-1 bg-text-muted/20"></span>
        </div>
        <div className="space-y-3">
          {archivedClasses.map((dc) => {
            const title = locale === 'de' ? dc.title_de : dc.title_en;
            const description = locale === 'de' ? dc.description_de : dc.description_en;
            const sessions = dc.sessions || [];
            const isExpanded = selectedId === dc.id;
            return (
              <div
                key={dc.id}
                onClick={() => setSelectedId(isExpanded ? null : dc.id)}
                className="bg-surface/60 rounded-2xl p-4 border border-bg-warm opacity-70 cursor-pointer hover:opacity-90 transition-all duration-300"
              >
                <div className="flex justify-between items-center">
                  <div>
                    {dc.dance && <span className="text-xs font-semibold uppercase tracking-wider text-accent-dark">{dc.dance}</span>}
                    <h4 className="font-display font-semibold text-text">{title}</h4>
                    {dc.teachers && <p className="text-sm text-text-muted">mit {dc.teachers}</p>}
                  </div>
                  <div className="flex gap-2 items-center">
                    {dc.level && (
                      <span className="text-xs bg-gray-100 text-text-muted font-medium px-3 py-1 rounded-full">{dc.level}</span>
                    )}
                    <span className="text-text-muted text-sm transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
                  </div>
                </div>
                {!isExpanded && sessions.length > 0 && (
                  <p className="text-sm text-text-muted mt-1">
                    📅 {new Date(sessions[0].session_date).toLocaleDateString(dtLocale, { month: 'short', year: 'numeric' })}
                    {sessions.length > 1 && ` – ${new Date(sessions[sessions.length - 1].session_date).toLocaleDateString(dtLocale, { month: 'short', year: 'numeric' })}`}
                    {' '}({sessions.length}x)
                  </p>
                )}
                {isExpanded && (
                  <div className="mt-3 space-y-2">
                    {description && <div className="border-l-2 border-teal/30 pl-3 text-text-muted text-sm leading-relaxed [&_strong]:text-text" dangerouslySetInnerHTML={{ __html: simpleMarkdown(description) }} />}
                    <div className="space-y-1 text-sm text-text-muted">
                      {sessions.length > 0 && (
                        <div>
                          <div className="font-medium text-text mb-1">📅 {sessions.length} {sessions.length === 1 ? i18n.workshops.session : i18n.workshops.sessions}:</div>
                          <div className="space-y-0.5 ml-5">
                            {sessions.map((s) => (
                              <div key={s.id}>
                                {new Date(s.session_date).toLocaleDateString(dtLocale, { weekday: 'short', day: 'numeric', month: 'short' })},{' '}
                                {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                                {s.note && <span className="text-accent-dark ml-1">({s.note})</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {(dc.location || dc.price_eur != null) && (
                        <div className="flex items-center gap-3">
                          {dc.location && (
                            <span>
                              📍{' '}
                              {dc.location_url ? (
                                <a href={dc.location_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-teal transition-colors" onClick={(e) => e.stopPropagation()}>
                                  {dc.location}
                                </a>
                              ) : (
                                dc.location
                              )}
                            </span>
                          )}
                          {dc.location && dc.price_eur != null && <span className="text-text-muted/40">·</span>}
                          {dc.price_eur != null && <span>{fmtCurrency(Number(dc.price_eur))}</span>}
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
