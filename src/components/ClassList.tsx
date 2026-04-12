import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { simpleMarkdown } from '../lib/markdown';
import { getClassState } from '../lib/classState';
import type { DanceClass, ClassSession } from '../lib/database.types';
import type { Locale } from '../i18n/index';
import de from '../i18n/de.json';
import en from '../i18n/en.json';

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
  const [loading, setLoading] = useState(true);
  const i18n = translations[locale];
  const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
  const dtLocale = locale === 'de' ? 'de-AT' : 'en-AT';
  const fmtCurrency = (v: number) => new Intl.NumberFormat(dtLocale, { style: 'currency', currency: 'EUR' }).format(v);

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

      // Sort by first session date
      merged.sort((a, b) => {
        const dateA = a.sessions?.[0]?.session_date ?? '';
        const dateB = b.sessions?.[0]?.session_date ?? '';
        return dateA.localeCompare(dateB);
      });

      setClasses(merged.filter((dc) => {
        const state = getClassState(dc.sessions || [], dc.registration_opens_at, dc.registration_closes_at);
        return state === 'upcoming' || state === 'open';
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
      <div className="flex justify-center py-8">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (classes.length === 0 && archivedClasses.length === 0) {
    return <p className="text-text-muted text-center py-8">{i18n.home.no_workshops}</p>;
  }

  function renderClassCard(dc: ClassWithCounts) {
    const title = locale === 'de' ? dc.title_de : dc.title_en;
    const description = locale === 'de' ? dc.description_de : dc.description_en;
    const sessions = dc.sessions || [];
    const classState = getClassState(sessions, dc.registration_opens_at, dc.registration_closes_at);

    return (
      <div key={dc.id} className={`bg-surface rounded-2xl shadow-sm border border-bg-warm p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ${classState === 'archived' ? 'opacity-60' : ''}`}>
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-display text-xl font-bold text-primary">{title}</h3>
          <div className="flex gap-2 items-center">
            {dc.level && (
              <span className="text-xs bg-teal/10 text-teal-dark font-semibold px-3 py-1 rounded-full">
                {dc.level}
              </span>
            )}
          </div>
        </div>

        {description && <div className="border-l-2 border-teal/30 pl-3 text-text-muted text-sm mb-4 leading-relaxed [&_strong]:text-text" dangerouslySetInnerHTML={{ __html: simpleMarkdown(description) }} />}

        <div className="space-y-2 text-sm text-text-muted mb-5">
          {sessions.length > 0 && (
            <div>
              <div className="font-medium text-text mb-1">📅 {sessions.length} {sessions.length === 1 ? i18n.workshops.session : i18n.workshops.sessions}:</div>
              <div className="space-y-0.5 ml-5">
                {sessions.slice(0, 4).map((s) => (
                  <div key={s.id}>
                    {new Date(s.session_date).toLocaleDateString(dtLocale, { weekday: 'short', day: 'numeric', month: 'short' })},{' '}
                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    {s.note && <span className="text-accent-dark ml-1">({s.note})</span>}
                  </div>
                ))}
                {sessions.length > 4 && <div className="text-text-muted">+{sessions.length - 4} more…</div>}
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

        {classState === 'upcoming' && dc.registration_opens_at && (
          <p className="text-sm text-accent-dark font-medium mb-3">
            {i18n.workshops.registration_opens} {new Date(dc.registration_opens_at).toLocaleString(dtLocale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
          </p>
        )}
        {classState === 'open' && dc.registration_closes_at && (
          <p className="text-sm text-text-muted mb-3">
            {i18n.workshops.registration_closes} {new Date(dc.registration_closes_at).toLocaleString(dtLocale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
          </p>
        )}
        {classState === 'open' && (
          <a
            href={`${base}/${locale}/workshops/?class=${dc.id}`}
            className="inline-block w-full text-center bg-coral hover:bg-coral-dark text-white font-semibold py-2.5 px-4 rounded-full transition-colors shadow-sm"
          >
            {i18n.workshops.register}
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      {classes.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2">
          {classes.map(renderClassCard)}
        </div>
      )}
      {archivedClasses.length > 0 && (
        <div className="mt-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="h-px flex-1 bg-text-muted/20"></span>
            <h3 className="font-display text-lg font-bold text-text-muted">{i18n.workshops.archive}</h3>
            <span className="h-px flex-1 bg-text-muted/20"></span>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {archivedClasses.map(renderClassCard)}
          </div>
        </div>
      )}
    </div>
  );
}
