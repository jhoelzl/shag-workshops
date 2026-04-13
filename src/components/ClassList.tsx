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
    const whatToBring = locale === 'de' ? dc.what_to_bring_de : dc.what_to_bring_en;
    const sessions = dc.sessions || [];
    const classState = getClassState(sessions, dc.registration_opens_at, dc.registration_closes_at);

    return (
      <div key={dc.id} className={`bg-surface rounded-2xl shadow-sm border border-bg-warm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden ${classState === 'archived' ? 'opacity-60' : ''}`}>
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
              {classState === 'ongoing' && (
                <span className="text-[11px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full mt-1 self-start">{i18n.workshops.ongoing}</span>
              )}
            </div>
            {dc.level && (
              <span className="text-xs bg-teal/10 text-teal-dark font-semibold px-3 py-1 rounded-full shrink-0">{dc.level}</span>
            )}
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
                    <a href={dc.location_url} target="_blank" rel="noopener noreferrer" className="font-medium text-text hover:text-primary transition-colors">
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

        {/* Registration status + CTA */}
        {classState === 'upcoming' && dc.registration_opens_at && (
          <div className="px-5 py-2.5 text-sm font-medium bg-amber-50/80 text-amber-700 border-t border-amber-100">
            {i18n.workshops.registration_opens} {new Date(dc.registration_opens_at).toLocaleString(dtLocale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
        )}
        {classState === 'open' && (
          <>
            {dc.registration_closes_at && (
              <div className="px-5 py-2.5 text-sm font-medium bg-gray-50 text-text-muted border-t border-gray-100">
                {i18n.workshops.registration_closes} {new Date(dc.registration_closes_at).toLocaleString(dtLocale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
              </div>
            )}
            <div className="px-5 pb-5 pt-3">
              <a
                href={`${base}/${locale}/workshops/?class=${dc.id}`}
                className="block w-full text-center bg-coral hover:bg-coral-dark text-white font-semibold py-2.5 px-4 rounded-full transition-colors shadow-sm"
              >
                {i18n.workshops.register}
              </a>
            </div>
          </>
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
        <div className={classes.length > 0 ? 'mt-16' : ''}>
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
