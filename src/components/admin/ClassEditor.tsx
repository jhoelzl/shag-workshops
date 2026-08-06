import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { DanceClass, ClassSession, Registration, RegistrationHistory, Database } from '../../lib/database.types';
import { getClassState, type ClassState } from '../../lib/classState';

interface Props {
  classes: DanceClass[];
  registrations: Registration[];
  history: RegistrationHistory[];
  currentUser: any;
  onUpdate: () => void;
}

interface SessionDraft {
  id?: string;
  session_date: string;
  start_time: string;
  end_time: string;
  note: string;
}

function haveSessionsChanged(
  original: ClassSession[],
  current: SessionDraft[]
): boolean {
  if (original.length !== current.length) return true;
  for (let i = 0; i < original.length; i++) {
    const orig = original[i];
    const curr = current[i];
    if (curr.id && curr.id !== orig.id) return true;
    if (orig.session_date !== curr.session_date) return true;
    if (orig.start_time.slice(0, 5) !== curr.start_time) return true;
    if (orig.end_time.slice(0, 5) !== curr.end_time) return true;
    if ((orig.note || '') !== curr.note) return true;
  }
  return false;
}

const EMPTY_CLASS = {
  title_de: '',
  title_en: '',
  description_de: '',
  description_en: '',
  level: '',
  dance: '',
  teachers: '',
  location: '',
  location_details: '',
  location_url: '',
  max_leads: 10,
  max_follows: 10,
  min_leads: 3,
  min_follows: 3,
  price_eur: 0,
  registration_opens_at: '',
  registration_closes_at: '',
  is_public: false,
  is_donation: false,
  auto_confirm: false,
  is_preview: false,
  preview_text_de: '',
  preview_text_en: '',
  donation_text_de: '',
  donation_text_en: '',
  donation_subtext_de: '',
  donation_subtext_en: '',
  what_to_bring_de: '- bequeme Kleidung (und zusätzliche T-Shirt)\n- deine Lieblings-Tanzschuhe\n- Wasserflasche',
  what_to_bring_en: '- comfortable clothing (perhaps an extra shirt)\n- your favorite dance shoes\n- water bottle',
};

const EMPTY_SESSION: SessionDraft = {
  session_date: '',
  start_time: '19:00',
  end_time: '20:00',
  note: '',
};

const LEVELS = ['Beginner', 'Beginner/Improver', 'Improver', 'Intermediate', 'Intermediate/Advanced', 'Advanced'];
const DANCES = ['Collegiate Shag', 'Lindy Hop', 'Balboa'];
const STATUS_OPTIONS: { value: ClassState | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: '🟢 Open' },
  { value: 'upcoming', label: '🟡 Upcoming' },
  { value: 'ongoing', label: '🔵 Ongoing' },
  { value: 'archived', label: '⚫ Archived' },
];

function setUrlParam(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value == null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.history.pushState(null, '', url.toString());
}

export default function ClassEditor({ classes, registrations, history, currentUser, onUpdate }: Props) {
  const [editing, setEditing] = useState<Partial<DanceClass> | null>(null);
  const [sessions, setSessions] = useState<SessionDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [classSessionsMap, setClassSessionsMap] = useState<Record<string, ClassSession[]>>({});
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [viewClassId, setViewClassId] = useState<string | null>(null);
  const urlInitDone = useRef(false);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterDance, setFilterDance] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<ClassState | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [addingRegFor, setAddingRegFor] = useState<string | null>(null);

  useEffect(() => {
    async function loadSessions() {
      const { data } = await supabase.from('class_sessions').select('*').order('session_date', { ascending: true });
      if (data) {
        const map: Record<string, ClassSession[]> = {};
        for (const s of data) {
          if (!map[s.dance_class_id]) map[s.dance_class_id] = [];
          map[s.dance_class_id].push(s);
        }
        setClassSessionsMap(map);
      }
    }
    loadSessions();
  }, [classes]);

  useEffect(() => {
    if (urlInitDone.current || classes.length === 0) return;
    urlInitDone.current = true;
    const params = new URLSearchParams(window.location.search);
    const editParam = params.get('edit');
    const viewParam = params.get('view');
    if (editParam === 'new') {
      setEditing({ ...EMPTY_CLASS });
      setSessions([]);
    } else if (editParam) {
      const dc = classes.find((c) => c.id === editParam);
      if (dc) {
        setEditing({ ...dc });
        const existing = classSessionsMap[dc.id] || [];
        setSessions(existing.map((s) => ({ id: s.id, session_date: s.session_date, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5), note: s.note || '' })));
      }
    }
    if (viewParam) setViewClassId(viewParam);
  }, [classes, classSessionsMap]);

  useEffect(() => {
    if (editing?.id && sessions.length === 0 && classSessionsMap[editing.id]?.length > 0) {
      const existing = classSessionsMap[editing.id];
      setSessions(existing.map((s) => ({ id: s.id, session_date: s.session_date, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5), note: s.note || '' })));
    }
  }, [editing?.id, classSessionsMap, sessions.length]);

  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const editParam = params.get('edit');
      const viewParam = params.get('view');
      if (!editParam) { setEditing(null); setSessions([]); }
      else if (editParam === 'new') { setEditing({ ...EMPTY_CLASS }); setSessions([]); }
      else {
        const dc = classes.find((c) => c.id === editParam);
        if (dc) {
          setEditing({ ...dc });
          const existing = classSessionsMap[dc.id] || [];
          setSessions(existing.map((s) => ({ id: s.id, session_date: s.session_date, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5), note: s.note || '' })));
        }
      }
      setViewClassId(viewParam);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [classes, classSessionsMap]);

  const regCountsMap = useMemo(() => {
    const map: Record<string, { leads: number; follows: number; pending: number; confirmed: number; waitlisted: number; cancelled: number }> = {};
    for (const r of registrations) {
      if (!map[r.dance_class_id]) map[r.dance_class_id] = { leads: 0, follows: 0, pending: 0, confirmed: 0, waitlisted: 0, cancelled: 0 };
      if (['pending', 'confirmed'].includes(r.status)) {
        if (r.role === 'lead') map[r.dance_class_id].leads++;
        else map[r.dance_class_id].follows++;
      }
      map[r.dance_class_id][r.status as 'pending' | 'confirmed' | 'waitlisted' | 'cancelled']++;
    }
    return map;
  }, [registrations]);

  const availableLevels = useMemo(() => Array.from(new Set(classes.map((c) => c.level).filter(Boolean))).sort(), [classes]);
  const availableDances = useMemo(() => Array.from(new Set(classes.map((c) => c.dance).filter(Boolean))).sort(), [classes]);

  const filteredClasses = useMemo(() => {
    return classes.filter((dc) => {
      const state = getClassState(classSessionsMap[dc.id] || [], dc.registration_opens_at, dc.registration_closes_at);
      if (filterStatus !== 'all' && state !== filterStatus) return false;
      if (filterLevel !== 'all' && dc.level !== filterLevel) return false;
      if (filterDance !== 'all' && dc.dance !== filterDance) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!dc.title_de.toLowerCase().includes(q) && !dc.title_en.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [classes, classSessionsMap, filterLevel, filterDance, filterStatus, searchQuery]);

  function duplicateClass(dc: DanceClass) {
    const existing = classSessionsMap[dc.id] || [];
    setUrlParam('edit', 'new');
    setUrlParam('view', null);
    setEditing({ ...dc, id: undefined, title_de: `${dc.title_de} (Kopie)`, title_en: `${dc.title_en} (Copy)`, is_public: false });
    setSessions(existing.map((s) => ({ session_date: s.session_date, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5), note: s.note || '' })));
  }

  function startEditing(dc?: DanceClass) {
    if (dc) {
      setUrlParam('edit', dc.id);
      setUrlParam('view', null);
      setEditing({ ...dc });
      const existing = classSessionsMap[dc.id] || [];
      setSessions(existing.map((s) => ({ id: s.id, session_date: s.session_date, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5), note: s.note || '' })));
    } else {
      setUrlParam('edit', 'new');
      setUrlParam('view', null);
      setEditing({ ...EMPTY_CLASS });
      setSessions([]);
    }
  }

  function addSession() {
    const last = sessions[sessions.length - 1];
    const newSession = last ? { ...EMPTY_SESSION, start_time: last.start_time, end_time: last.end_time } : { ...EMPTY_SESSION };
    setSessions([...sessions, newSession]);
  }

  function removeSession(index: number) { setSessions(sessions.filter((_, i) => i !== index)); }

  function updateSession(index: number, field: keyof SessionDraft, value: string) {
    const updated = [...sessions];
    updated[index] = { ...updated[index], [field]: value };
    setSessions(updated);
  }

  function generateWeeklyDates(startDate: string, weeks: number, startTime: string, endTime: string) {
    const dates: SessionDraft[] = [];
    const start = new Date(startDate);
    for (let i = 0; i < weeks; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i * 7);
      dates.push({ session_date: d.toISOString().split('T')[0], start_time: startTime, end_time: endTime, note: '' });
    }
    setSessions([...sessions, ...dates]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const basePayload: Database['public']['Tables']['dance_classes']['Update'] = {
      description_de: editing.description_de || null, description_en: editing.description_en || null, level: editing.level || null, dance: editing.dance || null,
      teachers: editing.teachers || null, location: editing.location || null, location_details: editing.location_details || null, location_url: editing.location_url || null,
      max_leads: editing.max_leads ?? 10, max_follows: editing.max_follows ?? 10, min_leads: editing.min_leads ?? 3, min_follows: editing.min_follows ?? 3,
      price_eur: editing.price_eur ?? null, registration_opens_at: editing.registration_opens_at || null, registration_closes_at: editing.registration_closes_at || null,
      is_public: editing.is_public ?? false, is_donation: editing.is_donation ?? false, auto_confirm: editing.auto_confirm ?? false, is_preview: editing.is_preview ?? false,
      what_to_bring_de: editing.what_to_bring_de || null, what_to_bring_en: editing.what_to_bring_en || null,
      preview_text_de: editing.preview_text_de || null, preview_text_en: editing.preview_text_en || null,
      donation_text_de: editing.donation_text_de || null, donation_text_en: editing.donation_text_en || null,
      donation_subtext_de: editing.donation_subtext_de || null, donation_subtext_en: editing.donation_subtext_en || null,
    };
    let classId = editing.id;
    if (classId) {
      await supabase.from('dance_classes').update({ ...basePayload, title_de: editing.title_de ?? '', title_en: editing.title_en ?? '' }).eq('id', classId);
    } else {
      const { data } = await supabase.from('dance_classes').insert({ ...basePayload, title_de: editing.title_de ?? '', title_en: editing.title_en ?? '', max_leads: editing.max_leads ?? 10, max_follows: editing.max_follows ?? 10 }).select('id').single();
      classId = data?.id;
    }
    if (classId) {
      const originalSessions = classSessionsMap[classId] || [];
      const hasSessionChanges = haveSessionsChanged(originalSessions, sessions);
      if (hasSessionChanges) {
        await supabase.from('class_sessions').delete().eq('dance_class_id', classId);
        if (sessions.length > 0) {
          const payload = sessions.filter((s) => s.session_date && s.start_time && s.end_time).map((s) => ({ dance_class_id: classId!, session_date: s.session_date, start_time: s.start_time, end_time: s.end_time, note: s.note || null }));
          if (payload.length > 0) await supabase.from('class_sessions').insert(payload);
        }
      }
    }
    setSaving(false);
    setUrlParam('edit', null);
    setEditing(null);
    onUpdate();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this class and all its registrations?')) return;
    await supabase.from('class_sessions').delete().eq('dance_class_id', id);
    await supabase.from('registrations').delete().eq('dance_class_id', id);
    await supabase.from('dance_classes').delete().eq('id', id);
    onUpdate();
  }

  function getClassDateSummary(classId: string): string {
    const s = classSessionsMap[classId];
    if (!s || s.length === 0) return 'No dates';
    const first = new Date(s[0].session_date).toLocaleDateString('de-AT');
    if (s.length === 1) return first;
    const last = new Date(s[s.length - 1].session_date).toLocaleDateString('de-AT');
    return `${first} – ${last} (${s.length}x)`;
  }

  function exportWorkshopRegistrationsAsCsv(danceClass: DanceClass, classRegs: Registration[]) {
    if (classRegs.length === 0) return;
    const headers = ['Workshop', 'Name', 'Email', 'Role', 'Partner', 'Status', 'Comment', 'Date'];
    const rows = classRegs.map((r) => [danceClass.title_de, r.name, r.email, r.role, r.partner_name || '', r.status, r.comment || '', new Date(r.created_at).toISOString()]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const slug = danceClass.title_de.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workshop';
    link.href = url;
    link.download = `registrations-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const isEditingThis = (id: string) => editing?.id === id;
  const isCreatingNew = editing && !editing.id;

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow text-coral mb-1">Catalog</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-primary">Dance Classes</h2>
          <p className="text-sm text-text-muted mt-1">Create and manage workshops, sessions, and registrations.</p>
        </div>
        {!isCreatingNew && (
          <button onClick={() => startEditing()} className="bg-gradient-to-br from-coral to-coral-dark hover:brightness-105 text-white font-semibold px-5 py-2.5 rounded-full transition-all text-sm shadow-[0_4px_14px_-4px_rgba(231,111,81,0.5)]">+ New Class</button>
        )}
      </div>
      {!editing && (
        <div className="bg-surface/80 backdrop-blur rounded-2xl border border-primary/5 shadow-soft p-5 mb-6">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input type="text" placeholder="Search classes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-white/60 border border-primary/10 rounded-xl text-sm focus:ring-2 focus:ring-coral/30 focus:border-coral outline-none transition" />
            </div>
            <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="border border-primary/10 rounded-xl px-3 py-2.5 text-sm bg-white/60 focus:ring-2 focus:ring-coral/30 outline-none transition cursor-pointer">
              <option value="all">All Levels</option>
              {availableLevels.map((l) => <option key={l} value={l!}>{l}</option>)}
            </select>
            <select value={filterDance} onChange={(e) => setFilterDance(e.target.value)} className="border border-primary/10 rounded-xl px-3 py-2.5 text-sm bg-white/60 focus:ring-2 focus:ring-coral/30 outline-none transition cursor-pointer">
              <option value="all">All Dances</option>
              {availableDances.map((d) => <option key={d} value={d!}>{d}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as ClassState | 'all')} className="border border-primary/10 rounded-xl px-3 py-2.5 text-sm bg-white/60 focus:ring-2 focus:ring-coral/30 outline-none transition cursor-pointer">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {(filterLevel !== 'all' || filterDance !== 'all' || filterStatus !== 'all' || searchQuery) && (
              <button onClick={() => { setFilterLevel('all'); setFilterDance('all'); setFilterStatus('all'); setSearchQuery(''); }} className="text-xs font-semibold text-coral hover:text-coral-dark px-2 py-1 transition-colors">Clear filters</button>
            )}
          </div>
          <div className="text-xs text-text-muted mt-2">{filteredClasses.length} of {classes.length} classes</div>
        </div>
      )}
      {isCreatingNew && (
        <div className="mb-6">
          <ClassForm editing={editing} setEditing={setEditing} sessions={sessions} setSessions={setSessions} addSession={addSession} removeSession={removeSession} updateSession={updateSession} generateWeeklyDates={generateWeeklyDates} handleSave={handleSave} saving={saving} onCancel={() => { setUrlParam('edit', null); setEditing(null); }} title="New Class" />
        </div>
      )}
      <div className="space-y-3">
        {filteredClasses.map((dc) => {
          const state = getClassState(classSessionsMap[dc.id] || [], dc.registration_opens_at, dc.registration_closes_at);
          const counts = regCountsMap[dc.id] || { leads: 0, follows: 0, pending: 0, confirmed: 0, waitlisted: 0, cancelled: 0 };
          const isExpanded = expandedClassId === dc.id;
          const isViewing = viewClassId === dc.id;
          const classRegs = registrations.filter((r) => r.dance_class_id === dc.id);
          const classSessions = classSessionsMap[dc.id] || [];
          return (
            <div key={dc.id}>
              {isEditingThis(dc.id) ? (
                <ClassForm editing={editing!} setEditing={setEditing} sessions={sessions} setSessions={setSessions} addSession={addSession} removeSession={removeSession} updateSession={updateSession} generateWeeklyDates={generateWeeklyDates} handleSave={handleSave} saving={saving} onCancel={() => { setUrlParam('edit', null); setEditing(null); }} title={`Edit: ${dc.title_de}`} />
              ) : (
                <div className={`bg-surface/80 backdrop-blur rounded-2xl border shadow-soft transition-all ${editing ? 'opacity-40 pointer-events-none' : 'border-primary/5 hover:shadow-lift hover:-translate-y-0.5'}`}>
                  <div className="p-4 cursor-pointer" onClick={() => { const next = isViewing ? null : dc.id; setUrlParam('view', next); setViewClassId(next); }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-display font-bold text-base truncate text-primary">{dc.title_de}</h3>
                          <StatusBadge state={state} />
                          {!dc.is_public && <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary/8 text-primary/60 px-2 py-0.5 rounded-full">Draft</span>}
                          <svg className={`w-4 h-4 text-text-muted transition-transform ${isViewing ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                        <div className="text-sm text-text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                          {dc.level && <span className="inline-flex items-center gap-1"><LevelDot level={dc.level} />{dc.level}</span>}
                          {dc.dance && <span>💃 {dc.dance}</span>}
                          {dc.teachers && <span>🎓 {dc.teachers}</span>}
                          <span>{getClassDateSummary(dc.id)}</span>
                          {dc.location && <span>📍 {dc.location}</span>}
                        </div>
                        <div className="flex items-center gap-4 mt-3">
                          <CapacityBar label="Leads" current={counts.leads} max={dc.max_leads} />
                          <CapacityBar label="Follows" current={counts.follows} max={dc.max_follows} />
                          <div className="text-[11px] ml-auto flex gap-1.5 items-center flex-wrap">
                            {counts.pending > 0 && <span className="bg-accent/15 text-accent-dark px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">⏳ {counts.pending} pending</span>}
                            {counts.confirmed > 0 && <span className="bg-teal/15 text-teal-dark px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">✓ {counts.confirmed} confirmed</span>}
                            {counts.waitlisted > 0 && <span className="bg-slate-200/70 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">⏸ {counts.waitlisted} waitlist</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setExpandedClassId(isExpanded ? null : dc.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${isExpanded ? 'bg-primary text-white' : 'bg-primary/5 hover:bg-primary/10 text-primary'}`}>{classRegs.length} Reg.</button>
                        <button onClick={() => exportWorkshopRegistrationsAsCsv(dc, classRegs)} disabled={classRegs.length === 0} className="text-xs font-semibold bg-primary/5 hover:bg-primary/10 text-primary px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">CSV</button>
                        <button onClick={() => startEditing(dc)} className="text-xs font-semibold bg-primary/5 hover:bg-primary/10 text-primary px-3 py-1.5 rounded-full transition-colors">Edit</button>
                        <button onClick={() => duplicateClass(dc)} className="text-xs font-semibold bg-teal/10 hover:bg-teal/20 text-teal-dark px-3 py-1.5 rounded-full transition-colors">Duplicate</button>
                        <button onClick={() => handleDelete(dc.id)} className="text-xs font-semibold bg-coral/10 hover:bg-coral/20 text-coral-dark px-3 py-1.5 rounded-full transition-colors">Delete</button>
                      </div>
                    </div>
                  </div>
                  {isViewing && <div className="border-t border-primary/5 bg-bg-warm/20 px-5 py-5"><ClassDetailView dc={dc} sessions={classSessions} classRegs={classRegs} regCounts={counts} history={history} currentUser={currentUser} onUpdate={onUpdate} addingRegFor={addingRegFor} setAddingRegFor={setAddingRegFor} /></div>}
                  {!isViewing && isExpanded && <div className="border-t border-primary/5 bg-bg-warm/20 rounded-b-2xl"><InlineRegistrations classRegs={classRegs} history={history} danceClass={dc} currentUser={currentUser} onUpdate={onUpdate} addingRegFor={addingRegFor} setAddingRegFor={setAddingRegFor} /></div>}
                </div>
              )}
            </div>
          );
        })}
        {filteredClasses.length === 0 && !isCreatingNew && <div className="text-center py-12 text-text-muted"><p className="text-lg mb-1">No classes found</p><p className="text-sm">Try adjusting your filters or create a new class.</p></div>}
      </div>
    </div>
  );
}

// ===== NEW UI COMPONENTS =====
function Badge({ variant, children }: { variant: 'success' | 'neutral' | 'amber'; children: React.ReactNode }) {
  const styles = {
    success: 'bg-teal/15 text-teal-dark border-teal/20',
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[variant]}`}>{children}</span>;
}

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-primary/[0.02] rounded-xl p-5 border border-primary/5">
      <h4 className="flex items-center gap-2 font-semibold text-primary mb-4">
        <span>{icon}</span>
        {title}
      </h4>
      {children}
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 p-3 bg-white rounded-lg border border-primary/10 cursor-pointer hover:border-primary/20 transition-colors">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-primary" />
      <div>
        <div className="font-medium text-sm text-primary">{label}</div>
        <div className="text-xs text-text-muted">{description}</div>
      </div>
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange, placeholder }: { label: string; value: string; options: T[]; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-muted mb-1.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-primary/15 bg-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all">
        <option value="">{placeholder}</option>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

function NumberInput({ label, value, onChange, required, min, hint }: { label: string; value: number; onChange: (v: number) => void; required?: boolean; min?: number; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-muted mb-1.5">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} required={required} min={min} className="w-full border border-primary/15 bg-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

function DateTimeInput({ label, value, onChange, hint }: { label: string; value: string | null | undefined; onChange: (v: string | undefined) => void; hint?: string }) {
  const displayValue = value ? value.slice(0, 16) : '';
  return (
    <div>
      <label className="block text-sm font-medium text-text-muted mb-1.5">{label}</label>
      <input type="datetime-local" value={displayValue} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)} className="w-full border border-primary/15 bg-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

function SessionRow({ session, index, onUpdate, onRemove }: { session: SessionDraft; index: number; onUpdate: (field: keyof SessionDraft, value: string) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-primary/10 hover:border-primary/20 transition-colors shadow-sm">
      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-primary shrink-0">{index + 1}</div>
      <input type="date" value={session.session_date} onChange={(e) => onUpdate('session_date', e.target.value)} required className="flex-1 min-w-[130px] border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
      <div className="flex items-center gap-1.5">
        <input type="time" value={session.start_time} onChange={(e) => onUpdate('start_time', e.target.value)} required className="w-24 border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
        <span className="text-text-muted">→</span>
        <input type="time" value={session.end_time} onChange={(e) => onUpdate('end_time', e.target.value)} required className="w-24 border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
      </div>
      <input type="text" value={session.note} onChange={(e) => onUpdate('note', e.target.value)} placeholder="Note (optional)" className="w-36 border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
      <button type="button" onClick={onRemove} className="w-8 h-8 flex items-center justify-center text-coral hover:bg-coral/10 rounded-lg transition-colors shrink-0" title="Remove session">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="text-center py-12 bg-primary/[0.02] rounded-xl border border-primary/5 border-dashed">
      <div className="text-4xl mb-3 opacity-50">{icon}</div>
      <h4 className="font-semibold text-primary mb-1">{title}</h4>
      <p className="text-sm text-text-muted max-w-sm mx-auto">{description}</p>
    </div>
  );
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />;
}

function Input({ label, value, onChange, type = 'text', required, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-muted mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} className="w-full border border-primary/15 bg-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

function TextArea({ label, value, onChange, hint, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-muted mb-1.5">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="w-full border border-primary/15 bg-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y transition-all" />
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

// ===== CLASS LIST HELPER COMPONENTS =====
function StatusBadge({ state }: { state: ClassState }) {
  const styles: Record<ClassState, string> = {
    open: 'bg-teal/15 text-teal-dark ring-teal/30',
    upcoming: 'bg-accent/15 text-accent-dark ring-accent/30',
    ongoing: 'bg-primary/8 text-primary ring-primary/20',
    archived: 'bg-slate-200/70 text-slate-600 ring-slate-400/30',
  };
  const labels: Record<ClassState, string> = { open: '🟢 Open', upcoming: 'Upcoming', ongoing: 'Ongoing', archived: 'Archived' };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${styles[state]}`}>
      {labels[state]}
    </span>
  );
}

function LevelDot({ level }: { level: string }) {
  const colors: Record<string, string> = {
    Beginner: 'bg-emerald-500',
    Intermediate: 'bg-amber-500',
    Advanced: 'bg-rose-500',
    All: 'bg-purple-500',
  };
  return <span className={`w-2.5 h-2.5 rounded-full inline-block mr-1.5 ${colors[level] || 'bg-slate-400'}`} />;
}

function CapacityBar({ label, current, max }: { label: string; current: number; max?: number }) {
  const pct = max && max > 0 ? Math.round((current / max) * 100) : 0;
  const color = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  const textColor = pct >= 90 ? 'text-rose-600' : pct >= 70 ? 'text-amber-600' : 'text-emerald-600';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium text-text-muted w-10">{label}</span>
      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-[11px] font-bold ${textColor}`}>{current}{max ? `/${max}` : ''}</span>
    </div>
  );
}

// ===== CLASS FORM WITH TABS =====
type TabKey = 'info' | 'settings' | 'options' | 'schedule';

const TAB_CONFIG: { key: TabKey; label: string; icon: string }[] = [
  { key: 'info', label: 'Info', icon: '📝' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
  { key: 'options', label: 'Options', icon: '🔧' },
  { key: 'schedule', label: 'Schedule', icon: '📅' },
];

function ClassForm({
  editing,
  setEditing,
  sessions,
  setSessions,
  addSession,
  removeSession,
  updateSession,
  generateWeeklyDates,
  handleSave,
  saving,
  onCancel,
  title,
}: {
  editing: Partial<DanceClass>;
  setEditing: (v: Partial<DanceClass>) => void;
  sessions: SessionDraft[];
  setSessions: (v: SessionDraft[]) => void;
  addSession: () => void;
  removeSession: (i: number) => void;
  updateSession: (i: number, field: keyof SessionDraft, value: string) => void;
  generateWeeklyDates: (start: string, weeks: number, startTime: string, endTime: string) => void;
  handleSave: (e: React.FormEvent) => void;
  saving: boolean;
  onCancel: () => void;
  title: string;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('info');

  return (
    <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-soft border border-primary/10 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-primary/10 flex items-center justify-between">
        <h3 className="font-display text-xl font-bold text-primary">{title}</h3>
        <div className="flex items-center gap-3">
          {editing.is_preview && <Badge variant="amber">Preview Mode</Badge>}
          {editing.is_public ? <Badge variant="success">Published</Badge> : <Badge variant="neutral">Draft</Badge>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-primary/10 bg-primary/[0.02]">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative ${
              activeTab === tab.key
                ? 'text-primary bg-white'
                : 'text-text-muted hover:text-primary hover:bg-primary/[0.03]'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.key === 'schedule' && sessions.length > 0 && (
              <span className="bg-coral text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {sessions.length}
              </span>
            )}
            {activeTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-coral" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6 min-h-[400px]">
        {/* Info Tab */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            <SectionCard title="Class Titles" icon="🏷️">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Title (German)" value={editing.title_de ?? ''} onChange={(v) => setEditing({ ...editing, title_de: v })} required placeholder="e.g. Collegiate Shag Beginner" />
                <Input label="Title (English)" value={editing.title_en ?? ''} onChange={(v) => setEditing({ ...editing, title_en: v })} required placeholder="e.g. Collegiate Shag Beginner" />
              </div>
            </SectionCard>
            <SectionCard title="Details" icon="📋">
              <div className="grid gap-4 sm:grid-cols-3">
                <Select<string> label="Dance" value={editing.dance ?? ''} options={DANCES} onChange={(v) => setEditing({ ...editing, dance: v })} placeholder="Select dance" />
                <Select<string> label="Level" value={editing.level ?? ''} options={LEVELS} onChange={(v) => setEditing({ ...editing, level: v })} placeholder="Select level" />
                <Input label="Teachers" value={editing.teachers ?? ''} onChange={(v) => setEditing({ ...editing, teachers: v })} placeholder="e.g. Alice & Bob" />
              </div>
            </SectionCard>
            <SectionCard title="Descriptions" icon="📄">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextArea label="Description (German)" value={editing.description_de ?? ''} onChange={(v) => setEditing({ ...editing, description_de: v })} hint="Supports **bold**, lists with -, and paragraphs" rows={5} />
                <TextArea label="Description (English)" value={editing.description_en ?? ''} onChange={(v) => setEditing({ ...editing, description_en: v })} hint="Supports **bold**, lists with -, and paragraphs" rows={5} />
              </div>
            </SectionCard>
            <SectionCard title="What to Bring" icon="🎒">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextArea label="German" value={editing.what_to_bring_de ?? ''} onChange={(v) => setEditing({ ...editing, what_to_bring_de: v })} hint="One item per line, use - for bullet list" rows={4} />
                <TextArea label="English" value={editing.what_to_bring_en ?? ''} onChange={(v) => setEditing({ ...editing, what_to_bring_en: v })} hint="One item per line, use - for bullet list" rows={4} />
              </div>
            </SectionCard>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <SectionCard title="Location" icon="📍">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Location Name" value={editing.location ?? ''} onChange={(v) => setEditing({ ...editing, location: v })} placeholder="e.g. Tanzstudio Salzburg" />
                <Input label="Google Maps URL" value={editing.location_url ?? ''} onChange={(v) => setEditing({ ...editing, location_url: v })} placeholder="https://maps.google.com/..." />
                <div className="sm:col-span-2">
                  <Input label="Address / Location Details" value={editing.location_details ?? ''} onChange={(v) => setEditing({ ...editing, location_details: v })} placeholder="e.g. Ernst-Mach-Straße 39, 5023 Salzburg" />
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Pricing" icon="💰">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Toggle label="Donation-based pricing" description="No fixed price - participants donate what they can" checked={editing.is_donation ?? false} onChange={(v) => setEditing({ ...editing, is_donation: v })} />
                  {!editing.is_donation && <Input label="Fixed Price (EUR)" type="number" value={String(editing.price_eur ?? 0)} onChange={(v) => setEditing({ ...editing, price_eur: Number(v) })} />}
                </div>
                {(editing.is_donation ?? false) && (
                  <div className="grid gap-4 sm:grid-cols-2 pt-4 border-t border-primary/5">
                    <Input label="Button Text (DE)" value={editing.donation_text_de ?? ''} onChange={(v) => setEditing({ ...editing, donation_text_de: v })} placeholder="Freiwillige Spende" hint="Default: Freiwillige Spende" />
                    <Input label="Button Text (EN)" value={editing.donation_text_en ?? ''} onChange={(v) => setEditing({ ...editing, donation_text_en: v })} placeholder="Voluntary donation" hint="Default: Voluntary donation" />
                    <Input label="Button Subtext (DE)" value={editing.donation_subtext_de ?? ''} onChange={(v) => setEditing({ ...editing, donation_subtext_de: v })} placeholder="Zur Deckung der Saalmiete" hint="Default: Zur Deckung der Saalmiete" />
                    <Input label="Button Subtext (EN)" value={editing.donation_subtext_en ?? ''} onChange={(v) => setEditing({ ...editing, donation_subtext_en: v })} placeholder="To help cover the studio rental" hint="Default: To help cover the studio rental" />
                  </div>
                )}
              </div>
            </SectionCard>
            <SectionCard title="Capacity Limits" icon="👥">
              <div className="grid gap-6 sm:grid-cols-4">
                <NumberInput label="Max Leads" value={editing.max_leads ?? 10} onChange={(v) => setEditing({ ...editing, max_leads: v })} required min={0} />
                <NumberInput label="Max Follows" value={editing.max_follows ?? 10} onChange={(v) => setEditing({ ...editing, max_follows: v })} required min={0} />
                <NumberInput label="Min Leads" value={editing.min_leads ?? 3} onChange={(v) => setEditing({ ...editing, min_leads: v })} min={0} hint="Required to start" />
                <NumberInput label="Min Follows" value={editing.min_follows ?? 3} onChange={(v) => setEditing({ ...editing, min_follows: v })} min={0} hint="Required to start" />
              </div>
            </SectionCard>
          </div>
        )}

        {/* Options Tab */}
        {activeTab === 'options' && (
          <div className="space-y-6">
            <SectionCard title="Registration Period" icon="⏰">
              <div className="grid gap-4 sm:grid-cols-2">
                <DateTimeInput label="Opens At" value={editing.registration_opens_at} onChange={(v) => setEditing({ ...editing, registration_opens_at: v })} hint="Leave empty to start immediately" />
                <DateTimeInput label="Closes At" value={editing.registration_closes_at} onChange={(v) => setEditing({ ...editing, registration_closes_at: v })} hint="Leave empty for no deadline" />
              </div>
            </SectionCard>
            <SectionCard title="Visibility & Behavior" icon="👁️">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Toggle label="Published" description="Visible on the public website" checked={editing.is_public ?? false} onChange={(v) => setEditing({ ...editing, is_public: v })} />
                <Toggle label="Auto-confirm" description="Instantly confirm registrations without manual review" checked={editing.auto_confirm ?? false} onChange={(v) => setEditing({ ...editing, auto_confirm: v })} />
                <Toggle label="Preview Mode" description="Show preview text instead of session dates" checked={editing.is_preview ?? false} onChange={(v) => setEditing({ ...editing, is_preview: v })} />
              </div>
            </SectionCard>
            {(editing.is_preview ?? false) && (
              <SectionCard title="Preview Text" icon="📝">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="German" value={editing.preview_text_de ?? ''} onChange={(v) => setEditing({ ...editing, preview_text_de: v })} placeholder="z.B. Geplant für Mai 2026" hint="Shown instead of dates" />
                  <Input label="English" value={editing.preview_text_en ?? ''} onChange={(v) => setEditing({ ...editing, preview_text_en: v })} placeholder="e.g. Planned for May 2026" hint="Shown instead of dates" />
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {/* Schedule Tab */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-primary/[0.03] rounded-xl p-4">
              <div>
                <h4 className="font-semibold text-primary">Class Sessions</h4>
                <p className="text-sm text-text-muted">{sessions.length} session{sessions.length !== 1 ? 's' : ''} scheduled</p>
              </div>
              <div className="flex gap-2 relative">
                <GenerateButton onGenerate={generateWeeklyDates} />
                <button type="button" onClick={addSession} className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-soft"><span className="text-lg leading-none">+</span> Add Session</button>
              </div>
            </div>
            {sessions.length === 0 ? (
              <EmptyState icon="📅" title="No sessions yet" description="Add individual dates or generate multiple weekly sessions at once." />
            ) : (
              <div className="space-y-2">
                {sessions.map((s, i) => (
                  <SessionRow key={i} session={s} index={i} onUpdate={(field, value) => updateSession(i, field, value)} onRemove={() => removeSession(i)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center px-6 py-4 bg-primary/[0.02] border-t border-primary/10">
        <button type="button" onClick={onCancel} className="px-5 py-2 text-sm font-medium text-text-muted hover:text-primary transition-colors hover:bg-primary/5 rounded-lg">Cancel</button>
        <button type="submit" disabled={saving} className="flex items-center gap-2 bg-gradient-to-r from-coral to-coral-dark hover:brightness-105 disabled:opacity-50 disabled:hover:brightness-100 text-white font-semibold px-6 py-2.5 rounded-lg transition-all text-sm shadow-[0_4px_14px_-4px_rgba(231,111,81,0.5)]">
          {saving ? <><Spinner /> Saving...</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Save Changes</>}
        </button>
      </div>
    </form>
  );
}

function GenerateButton({ onGenerate }: { onGenerate: (start: string, weeks: number, startTime: string, endTime: string) => void }) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('20:00');
  function handleGenerate() { if (!startDate || weeks < 1) return; onGenerate(startDate, weeks, startTime, endTime); setOpen(false); }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 bg-accent/15 hover:bg-accent/25 text-accent-dark px-4 py-2 rounded-lg text-sm font-medium transition-colors">📅 Generate Weekly</button>;
  return (
    <div className="absolute bg-white border border-primary/10 shadow-lift rounded-xl p-4 z-10 right-0 w-80 mt-10">
      <h5 className="font-bold text-sm mb-3 text-primary">Generate Weekly Dates</h5>
      <div className="space-y-3">
        <div><label className="text-xs font-medium text-text-muted mb-1 block">First Date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white" /></div>
        <div><label className="text-xs font-medium text-text-muted mb-1 block">Number of Weeks</label><input type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-full border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium text-text-muted mb-1 block">Start Time</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white" /></div>
          <div><label className="text-xs font-medium text-text-muted mb-1 block">End Time</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white" /></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-text-muted hover:text-primary px-3 py-1.5">Cancel</button>
        <button type="button" onClick={handleGenerate} className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-medium">Generate</button>
      </div>
    </div>
  );
}

function InlineRegistrations({ classRegs, history = [], danceClass, currentUser, onUpdate, addingRegFor, setAddingRegFor }: { classRegs: Registration[]; history: RegistrationHistory[]; danceClass: DanceClass; currentUser: any; onUpdate: () => void; addingRegFor: string | null; setAddingRegFor: (v: string | null) => void; }) {
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [manualReg, setManualReg] = useState({ name: '', email: '', role: 'lead' as 'lead' | 'follow', partner_name: '', comment: '' });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');
  const historyByRegistration = useMemo(() => {
    const map = new Map<string, RegistrationHistory[]>();
    for (const entry of history) { if (!map.has(entry.registration_id)) { map.set(entry.registration_id, []); } map.get(entry.registration_id)!.push(entry); }
    return map;
  }, [history]);

  const sorted = [...classRegs].sort((a, b) => { const order: Record<string, number> = { confirmed: 0, pending: 1, waitlisted: 2, cancelled: 3 }; return (order[a.status] ?? 9) - (order[b.status] ?? 9); });

  async function updateStatus(registrationId: string, newStatus: string) {
    setUpdating((prev) => new Set(prev).add(registrationId));
    const { data: { session } } = await supabase.auth.getSession();
    const functionsUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1`;
    await fetch(`${functionsUrl}/confirm-registration`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ registration_id: registrationId, new_status: newStatus }) });
    setUpdating((prev) => { const next = new Set(prev); next.delete(registrationId); return next; });
    onUpdate();
  }

  async function deleteRegistration(reg: Registration) {
    if (!confirm(`Permanently delete the registration of ${reg.name}? This cannot be undone.`)) return;
    setUpdating((prev) => new Set(prev).add(reg.id));
    setOpenMenu(null);
    await supabase.from('registrations').delete().eq('id', reg.id);
    setUpdating((prev) => { const next = new Set(prev); next.delete(reg.id); return next; });
    onUpdate();
  }

  async function handleManualRegister(e: React.FormEvent) {
    e.preventDefault();
    setManualSaving(true);
    setManualError('');
    try {
      const functionsUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (import.meta.env.PUBLIC_SUPABASE_ANON_KEY) headers.apikey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
      const response = await fetch(`${functionsUrl}/register`, { method: 'POST', headers, body: JSON.stringify({ dance_class_id: danceClass.id, role: manualReg.role, name: manualReg.name.trim(), email: manualReg.email.trim().toLowerCase(), partner_name: manualReg.partner_name.trim() || null, comment: manualReg.comment.trim() || null, triggered_by: 'admin_created' }) });
      const result = await response.json().catch(() => ({ error: 'Unknown error' }));
      if (!response.ok) { setManualError(result.error || result.message || `Request failed (${response.status})`); setManualSaving(false); return; }
      setManualReg({ name: '', email: '', role: 'lead', partner_name: '', comment: '' });
      setAddingRegFor(null);
      onUpdate();
    } catch (err: any) { setManualError(err?.message || 'Network error'); }
    setManualSaving(false);
  }

  const canAdd = currentUser?.role === 'admin' || currentUser?.role === 'superuser';

  return (
    <div className="py-4 px-5">
      {sorted.length === 0 ? <p className="text-sm text-text-muted italic">No registrations yet.</p> : (
        <div className="space-y-2">
          {sorted.map((reg) => {
            const menuOpen = openMenu === reg.id;
            const historyOpen = openHistory === reg.id;
            const regHistory = historyByRegistration.get(reg.id) || [];
            const isUpdating = updating.has(reg.id);
            const statusBadge = (status: string) => {
              const colors: Record<string, string> = { confirmed: 'bg-teal-50 border-teal-200 text-teal-700', pending: 'bg-accent/10 border-accent/30 text-accent-dark', waitlisted: 'bg-slate-100 border-slate-200 text-slate-600', cancelled: 'bg-coral/10 border-coral/20 text-coral-dark' };
              return <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${colors[status] || 'bg-gray-100'}`}>{status}</span>;
            };
            return (
              <div key={reg.id} className={`${reg.status === 'cancelled' ? 'opacity-60' : ''} ${isUpdating ? 'animate-pulse' : ''}`}>
                <div className="flex items-center justify-between bg-white rounded-lg border border-primary/10 p-3 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{reg.name}</span>
                      {statusBadge(reg.status)}
                      <span className="text-[10px] uppercase tracking-wider bg-primary/5 text-primary px-2 py-0.5 rounded">{reg.role}</span>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{reg.email}{reg.partner_name ? ` · Partner: ${reg.partner_name}` : ''}{reg.comment ? ` · "${reg.comment}"` : ''}</div>
                    {regHistory.length > 0 && <button onClick={() => setOpenHistory(historyOpen ? null : reg.id)} className="text-[10px] text-text-muted underline mt-1 hover:text-primary">{historyOpen ? 'Hide History' : 'Show History'}</button>}
                  </div>
                  <div className="flex items-center gap-2">
                    {(reg.status === 'pending' || reg.status === 'confirmed') && (
                      <>
                        {reg.status === 'pending' && <button onClick={() => updateStatus(reg.id, 'confirmed')} disabled={isUpdating} className="text-xs font-semibold bg-teal/15 hover:bg-teal/25 text-teal-dark px-3 py-1.5 rounded-full transition-colors">Confirm</button>}
                        {reg.status === 'confirmed' && <button onClick={() => updateStatus(reg.id, 'cancelled')} disabled={isUpdating} className="text-xs font-semibold bg-coral/10 hover:bg-coral/20 text-coral-dark px-3 py-1.5 rounded-full transition-colors">Cancel</button>}
                      </>
                    )}
                    {reg.status === 'waitlisted' && <button onClick={() => updateStatus(reg.id, 'confirmed')} disabled={isUpdating} className="text-xs font-semibold bg-teal/15 hover:bg-teal/25 text-teal-dark px-3 py-1.5 rounded-full transition-colors">Confirm</button>}
                    <button onClick={() => setOpenMenu(menuOpen ? null : reg.id)} className="text-text-muted hover:text-primary text-xl px-1">⋯</button>
                    {menuOpen && (
                      <div className="absolute bg-white border border-primary/10 shadow-lift rounded-lg p-2 w-40 z-10 mt-24">
                        <button onClick={() => { updateStatus(reg.id, reg.status === 'cancelled' ? 'confirmed' : 'cancelled'); setOpenMenu(null); }} className="w-full text-left text-sm px-3 py-2 hover:bg-primary/5 rounded text-text-muted hover:text-primary">{reg.status === 'cancelled' ? 'Reactivate' : 'Cancel Registration'}</button>
                        <button onClick={() => deleteRegistration(reg)} className="w-full text-left text-sm px-3 py-2 hover:bg-coral/10 rounded text-coral-dark">Delete</button>
                        <button onClick={() => setOpenMenu(null)} className="w-full text-left text-sm px-3 py-2 hover:bg-primary/5 rounded text-text-muted hover:text-primary">Close</button>
                      </div>
                    )}
                  </div>
                </div>
                {historyOpen && regHistory.length > 0 && (
                  <div className="mt-2 ml-4 pl-3 border-l-2 border-primary/20 space-y-2">
                    {regHistory.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3">
                        <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${HISTORY_EVENT_TONE[entry.event_type].split(' ')[0].replace('bg-', 'bg-opacity-100 ')}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded flex-shrink-0 ${HISTORY_EVENT_TONE[entry.event_type]}`}>{formatHistoryEventLabel(entry)}</span>
                            <span className="text-[10px] text-text-muted">{new Date(entry.created_at).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                          </div>
                          {formatHistoryDetails(entry) && <p className="text-xs text-text-muted mt-0.5">{formatHistoryDetails(entry)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {canAdd && (
        <div className="mt-4 pt-4 border-t border-primary/10">
          {!addingRegFor ? <button onClick={() => setAddingRegFor(danceClass.id)} className="text-xs font-semibold bg-primary/5 hover:bg-primary/10 text-primary px-4 py-2 rounded-full transition-colors">+ Add Registration</button> : (
            <form onSubmit={handleManualRegister} className="space-y-3 bg-white rounded-xl border border-primary/10 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="text-xs font-medium text-text-muted mb-1 block">Name</label><input required value={manualReg.name} onChange={(e) => setManualReg({ ...manualReg, name: e.target.value })} className="w-full border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white" placeholder="Name" /></div>
                <div><label className="text-xs font-medium text-text-muted mb-1 block">Email</label><input required type="email" value={manualReg.email} onChange={(e) => setManualReg({ ...manualReg, email: e.target.value })} className="w-full border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white" placeholder="email@example.com" /></div>
                <div><label className="text-xs font-medium text-text-muted mb-1 block">Role</label><select value={manualReg.role} onChange={(e) => setManualReg({ ...manualReg, role: e.target.value as 'lead'|'follow' })} className="w-full border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white"><option value="lead">Lead</option><option value="follow">Follow</option></select></div>
                <div><label className="text-xs font-medium text-text-muted mb-1 block">Partner (optional)</label><input value={manualReg.partner_name} onChange={(e) => setManualReg({ ...manualReg, partner_name: e.target.value })} className="w-full border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white" placeholder="Partner name" /></div>
              </div>
              <div><label className="text-xs font-medium text-text-muted mb-1 block">Comment (optional)</label><input value={manualReg.comment} onChange={(e) => setManualReg({ ...manualReg, comment: e.target.value })} className="w-full border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white" placeholder="Any notes" /></div>
              {manualError && <p className="text-xs text-coral-dark bg-coral/10 px-3 py-2 rounded">{manualError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={manualSaving} className="text-xs font-semibold bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50">{manualSaving ? 'Saving...' : 'Save'}</button>
                <button type="button" onClick={() => { setAddingRegFor(null); setManualError(''); }} className="text-xs text-text-muted hover:text-primary px-3 py-2">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

const HISTORY_EVENT_TONE: Record<RegistrationHistory['event_type'], string> = { created: 'bg-primary/10 text-primary', status_changed: 'bg-accent/20 text-accent-dark', email_sent: 'bg-teal/15 text-teal-dark', email_failed: 'bg-coral/15 text-coral-dark', email_skipped: 'bg-slate-200 text-slate-600' };

function formatHistoryEventLabel(entry: RegistrationHistory): string { switch (entry.event_type) { case 'created': return 'Created'; case 'status_changed': return 'Status Changed'; case 'email_sent': return 'Email Sent'; case 'email_failed': return 'Email Failed'; case 'email_skipped': return 'Email Skipped'; default: return entry.event_type; } }

function formatHistoryDetails(entry: RegistrationHistory): string {
  if (entry.event_type === 'status_changed') { const oldStatus = entry.old_status || 'unknown'; const newStatus = entry.new_status || 'unknown'; return `Status: ${oldStatus} -> ${newStatus}`; }
  if (entry.event_type === 'created') { return `Registration created with status ${entry.new_status || 'unknown'} (${entry.triggered_by.replaceAll('_', ' ')})`; }
  if (entry.event_type === 'email_sent' || entry.event_type === 'email_failed' || entry.event_type === 'email_skipped') { const emailType = entry.email_type || 'email'; const recipient = entry.email_recipient ? ` to ${entry.email_recipient}` : ''; return `${emailType.replaceAll('_', ' ')}${recipient}`; }
  return '';
}

function ClassDetailView({ dc, sessions, classRegs, regCounts, history, currentUser, onUpdate, addingRegFor, setAddingRegFor }: { dc: DanceClass; sessions: ClassSession[]; classRegs: Registration[]; regCounts: { leads: number; follows: number; pending: number; confirmed: number; waitlisted: number; cancelled: number }; history: RegistrationHistory[]; currentUser: any; onUpdate: () => void; addingRegFor: string | null; setAddingRegFor: (v: string | null) => void; }) {
  const fmt = (v: string | null | undefined) => v || '-';
  const fmtDate = (v: string | null | undefined) => { if (!v) return '-'; return new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Title (DE)</span><p className="font-medium">{fmt(dc.title_de)}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Title (EN)</span><p className="font-medium">{fmt(dc.title_en)}</p></div>
        <div className="md:col-span-2"><span className="text-text-muted text-xs uppercase tracking-wider">Description (DE)</span><p className="whitespace-pre-wrap">{fmt(dc.description_de)}</p></div>
        <div className="md:col-span-2"><span className="text-text-muted text-xs uppercase tracking-wider">Description (EN)</span><p className="whitespace-pre-wrap">{fmt(dc.description_en)}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Level</span><p>{fmt(dc.level)}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Dance</span><p>{fmt(dc.dance)}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Teachers</span><p>{fmt(dc.teachers)}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Location</span><p>{dc.location_url ? <a href={dc.location_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{dc.location || dc.location_url}</a> : fmt(dc.location)}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Location details</span><p>{fmt(dc.location_details)}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Max Leads</span><p>{dc.max_leads}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Max Follows</span><p>{dc.max_follows}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Price (EUR)</span><p>{dc.price_eur != null ? `${dc.price_eur} €` : '-'}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Public</span><p>{dc.is_public ? 'Yes' : 'No'}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Preview Mode</span><p>{dc.is_preview ? 'Yes' : 'No'}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Registration opens</span><p>{fmtDate(dc.registration_opens_at)}</p></div>
        <div><span className="text-text-muted text-xs uppercase tracking-wider">Registration closes</span><p>{fmtDate(dc.registration_closes_at)}</p></div>
        {(dc.preview_text_de || dc.preview_text_en) && (
          <div className="md:col-span-2 mt-2">
            <span className="text-text-muted text-xs uppercase tracking-wider">Preview Text</span>
            {dc.preview_text_de && <p className="text-sm mt-0.5 bg-amber-50 border border-amber-200 rounded px-3 py-2"><span className="font-semibold">DE:</span> {dc.preview_text_de}</p>}
            {dc.preview_text_en && <p className="text-sm mt-0.5 bg-amber-50 border border-amber-200 rounded px-3 py-2"><span className="font-semibold">EN:</span> {dc.preview_text_en}</p>}
          </div>
        )}
        {sessions.length > 0 && (
          <div className="md:col-span-2 mt-2">
            <span className="text-text-muted text-xs uppercase tracking-wider">Sessions</span>
            <div className="mt-1 space-y-1">
              {sessions.sort((a, b) => (a.session_date ?? '').localeCompare(b.session_date ?? '')).map((s, i) => (
                <div key={s.id || i} className="flex items-center gap-3 text-sm bg-white rounded px-3 py-1.5 border border-gray-100">
                  <span className="font-medium">{s.session_date ? new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</span>
                  <span className="text-text-muted">{s.start_time?.slice(0, 5) || '?'} – {s.end_time?.slice(0, 5) || '?'}</span>
                  {s.note && <span className="text-text-muted italic">{s.note}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <h4 className="eyebrow text-coral">Registrations</h4>
          <div className="flex gap-1.5 text-[10px] flex-wrap">
            {regCounts.confirmed > 0 && <span className="bg-teal/15 text-teal-dark px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">✓ {regCounts.confirmed} confirmed</span>}
            {regCounts.pending > 0 && <span className="bg-accent/15 text-accent-dark px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">⏳ {regCounts.pending} pending</span>}
            {regCounts.waitlisted > 0 && <span className="bg-slate-200/70 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">⏸ {regCounts.waitlisted} waitlisted</span>}
            {regCounts.cancelled > 0 && <span className="bg-coral/15 text-coral-dark px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">✕ {regCounts.cancelled} cancelled</span>}
          </div>
        </div>
        <InlineRegistrations classRegs={classRegs} history={history} danceClass={dc} currentUser={currentUser} onUpdate={onUpdate} addingRegFor={addingRegFor} setAddingRegFor={setAddingRegFor} />
      </div>
    </div>
  );
}
