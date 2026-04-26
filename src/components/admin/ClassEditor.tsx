import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { DanceClass, ClassSession, Registration, Database } from '../../lib/database.types';
import { getClassState, type ClassState } from '../../lib/classState';

interface Props {
  classes: DanceClass[];
  registrations: Registration[];
  onUpdate: () => void;
}

interface SessionDraft {
  id?: string;
  session_date: string;
  start_time: string;
  end_time: string;
  note: string;
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

export default function ClassEditor({ classes, registrations, onUpdate }: Props) {
  const [editing, setEditing] = useState<Partial<DanceClass> | null>(null);
  const [sessions, setSessions] = useState<SessionDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [classSessionsMap, setClassSessionsMap] = useState<Record<string, ClassSession[]>>({});
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [viewClassId, setViewClassId] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterDance, setFilterDance] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<ClassState | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [addingRegFor, setAddingRegFor] = useState<string | null>(null);

  useEffect(() => {
    async function loadSessions() {
      const { data } = await supabase
        .from('class_sessions')
        .select('*')
        .order('session_date', { ascending: true });
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

  const availableLevels = useMemo(() => {
    const levels = new Set(classes.map((c) => c.level).filter(Boolean));
    return Array.from(levels).sort();
  }, [classes]);

  const availableDances = useMemo(() => {
    const dances = new Set(classes.map((c) => c.dance).filter(Boolean));
    return Array.from(dances).sort();
  }, [classes]);

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
    setEditing({
      ...dc,
      id: undefined,
      title_de: `${dc.title_de} (Kopie)`,
      title_en: `${dc.title_en} (Copy)`,
      is_public: false,
    });
    setSessions(existing.map((s) => ({
      session_date: s.session_date,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      note: s.note || '',
    })));
  }

  function startEditing(dc?: DanceClass) {
    if (dc) {
      setEditing({ ...dc });
      const existing = classSessionsMap[dc.id] || [];
      setSessions(existing.map((s) => ({
        id: s.id,
        session_date: s.session_date,
        start_time: s.start_time.slice(0, 5),
        end_time: s.end_time.slice(0, 5),
        note: s.note || '',
      })));
    } else {
      setEditing({ ...EMPTY_CLASS });
      setSessions([]);
    }
  }

  function addSession() {
    const lastSession = sessions[sessions.length - 1];
    const newSession = lastSession
      ? { ...EMPTY_SESSION, start_time: lastSession.start_time, end_time: lastSession.end_time }
      : { ...EMPTY_SESSION };
    setSessions([...sessions, newSession]);
  }

  function removeSession(index: number) {
    setSessions(sessions.filter((_, i) => i !== index));
  }

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
      dates.push({
        session_date: d.toISOString().split('T')[0],
        start_time: startTime,
        end_time: endTime,
        note: '',
      });
    }
    setSessions([...sessions, ...dates]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);

    const basePayload: Database['public']['Tables']['dance_classes']['Update'] = {
      description_de: editing.description_de || null,
      description_en: editing.description_en || null,
      level: editing.level || null,
      dance: editing.dance || null,
      teachers: editing.teachers || null,
      location: editing.location || null,
      location_url: editing.location_url || null,
      max_leads: editing.max_leads ?? 10,
      max_follows: editing.max_follows ?? 10,
      min_leads: editing.min_leads ?? 3,
      min_follows: editing.min_follows ?? 3,
      price_eur: editing.price_eur ?? null,
      registration_opens_at: editing.registration_opens_at || null,
      registration_closes_at: editing.registration_closes_at || null,
      is_public: editing.is_public ?? false,
      is_donation: editing.is_donation ?? false,
      what_to_bring_de: editing.what_to_bring_de || null,
      what_to_bring_en: editing.what_to_bring_en || null,
    };

    let classId = editing.id;

    if (classId) {
      await supabase
        .from('dance_classes')
        .update({
          ...basePayload,
          title_de: editing.title_de ?? '',
          title_en: editing.title_en ?? '',
        })
        .eq('id', classId);
    } else {
      const insertPayload: Database['public']['Tables']['dance_classes']['Insert'] = {
        ...basePayload,
        title_de: editing.title_de ?? '',
        title_en: editing.title_en ?? '',
        max_leads: editing.max_leads ?? 10,
        max_follows: editing.max_follows ?? 10,
      };
      const { data } = await supabase.from('dance_classes').insert(insertPayload).select('id').single();
      classId = data?.id;
    }

    if (classId) {
      await supabase.from('class_sessions').delete().eq('dance_class_id', classId);
      if (sessions.length > 0) {
        const sessionPayload = sessions
          .filter((s) => s.session_date && s.start_time && s.end_time)
          .map((s) => ({
            dance_class_id: classId!,
            session_date: s.session_date,
            start_time: s.start_time,
            end_time: s.end_time,
            note: s.note || null,
          }));
        if (sessionPayload.length > 0) {
          await supabase.from('class_sessions').insert(sessionPayload);
        }
      }
    }

    setSaving(false);
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

  const isEditingThis = (id: string) => editing?.id === id;
  const isCreatingNew = editing && !editing.id;

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow text-coral mb-1">Catalog</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-primary">Dance Classes</h2>
          <p className="text-sm text-text-muted mt-1">Create and manage workshops, sessions, and registrations.</p>
        </div>
        {!isCreatingNew && (
          <button
            onClick={() => startEditing()}
            className="bg-gradient-to-br from-coral to-coral-dark hover:brightness-105 text-white font-semibold px-5 py-2.5 rounded-full transition-all text-sm shadow-[0_4px_14px_-4px_rgba(231,111,81,0.5)]"
          >
            + New Class
          </button>
        )}
      </div>

      {/* Filters */}
      {!editing && (
        <div className="bg-surface/80 backdrop-blur rounded-2xl border border-primary/5 shadow-soft p-5 mb-6">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search classes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-white/60 border border-primary/10 rounded-xl text-sm focus:ring-2 focus:ring-coral/30 focus:border-coral outline-none transition"
              />
            </div>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="border border-primary/10 rounded-xl px-3 py-2.5 text-sm bg-white/60 focus:ring-2 focus:ring-coral/30 outline-none transition cursor-pointer"
            >
              <option value="all">All Levels</option>
              {availableLevels.map((l) => (
                <option key={l} value={l!}>{l}</option>
              ))}
            </select>
            <select
              value={filterDance}
              onChange={(e) => setFilterDance(e.target.value)}
              className="border border-primary/10 rounded-xl px-3 py-2.5 text-sm bg-white/60 focus:ring-2 focus:ring-coral/30 outline-none transition cursor-pointer"
            >
              <option value="all">All Dances</option>
              {availableDances.map((d) => (
                <option key={d} value={d!}>{d}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ClassState | 'all')}
              className="border border-primary/10 rounded-xl px-3 py-2.5 text-sm bg-white/60 focus:ring-2 focus:ring-coral/30 outline-none transition cursor-pointer"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {(filterLevel !== 'all' || filterDance !== 'all' || filterStatus !== 'all' || searchQuery) && (
              <button
                onClick={() => { setFilterLevel('all'); setFilterDance('all'); setFilterStatus('all'); setSearchQuery(''); }}
                className="text-xs font-semibold text-coral hover:text-coral-dark px-2 py-1 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="text-xs text-text-muted mt-2">
            {filteredClasses.length} of {classes.length} classes
          </div>
        </div>
      )}

      {/* New Class Form */}
      {isCreatingNew && (
        <div className="mb-6">
          <ClassForm
            editing={editing}
            setEditing={setEditing}
            sessions={sessions}
            setSessions={setSessions}
            addSession={addSession}
            removeSession={removeSession}
            updateSession={updateSession}
            generateWeeklyDates={generateWeeklyDates}
            handleSave={handleSave}
            saving={saving}
            onCancel={() => setEditing(null)}
            title="New Class"
          />
        </div>
      )}

      {/* Class Cards */}
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
                <ClassForm
                  editing={editing!}
                  setEditing={setEditing}
                  sessions={sessions}
                  setSessions={setSessions}
                  addSession={addSession}
                  removeSession={removeSession}
                  updateSession={updateSession}
                  generateWeeklyDates={generateWeeklyDates}
                  handleSave={handleSave}
                  saving={saving}
                  onCancel={() => setEditing(null)}
                  title={`Edit: ${dc.title_de}`}
                />
              ) : (
                <div className={`bg-surface/80 backdrop-blur rounded-2xl border shadow-soft transition-all ${editing ? 'opacity-40 pointer-events-none' : 'border-primary/5 hover:shadow-lift hover:-translate-y-0.5'}`}>
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setViewClassId(isViewing ? null : dc.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-display font-bold text-base truncate text-primary">{dc.title_de}</h3>
                          <StatusBadge state={state} />
                          {!dc.is_public && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary/8 text-primary/60 px-2 py-0.5 rounded-full">Draft</span>
                          )}
                          <svg className={`w-4 h-4 text-text-muted transition-transform ${isViewing ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                        <div className="text-sm text-text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                          {dc.level && (
                            <span className="inline-flex items-center gap-1">
                              <LevelDot level={dc.level} />
                              {dc.level}
                            </span>
                          )}
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
                        <button
                          onClick={() => setExpandedClassId(isExpanded ? null : dc.id)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${isExpanded ? 'bg-primary text-white' : 'bg-primary/5 hover:bg-primary/10 text-primary'}`}
                          title="Show registrations"
                        >
                          {classRegs.length} Reg.
                        </button>
                        <button onClick={() => startEditing(dc)} className="text-xs font-semibold bg-primary/5 hover:bg-primary/10 text-primary px-3 py-1.5 rounded-full transition-colors">Edit</button>
                        <button onClick={() => duplicateClass(dc)} className="text-xs font-semibold bg-teal/10 hover:bg-teal/20 text-teal-dark px-3 py-1.5 rounded-full transition-colors">Duplicate</button>
                        <button onClick={() => handleDelete(dc.id)} className="text-xs font-semibold bg-coral/10 hover:bg-coral/20 text-coral-dark px-3 py-1.5 rounded-full transition-colors">Delete</button>
                      </div>
                    </div>
                  </div>

                  {isViewing && (
                    <div className="border-t border-primary/5 bg-bg-warm/20 px-5 py-5">
                      <ClassDetailView dc={dc} sessions={classSessions} classRegs={classRegs} regCounts={counts} onUpdate={onUpdate} addingRegFor={addingRegFor} setAddingRegFor={setAddingRegFor} />
                    </div>
                  )}

                  {!isViewing && isExpanded && (
                    <div className="border-t border-primary/5 bg-bg-warm/20 rounded-b-2xl">
                      <InlineRegistrations
                        classRegs={classRegs}
                        danceClass={dc}
                        onUpdate={onUpdate}
                        addingRegFor={addingRegFor}
                        setAddingRegFor={setAddingRegFor}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filteredClasses.length === 0 && !isCreatingNew && (
          <div className="text-center py-12 text-text-muted">
            <p className="text-lg mb-1">No classes found</p>
            <p className="text-sm">Try adjusting your filters or create a new class.</p>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const color = level.includes('Beginner') ? 'bg-teal' : level.includes('Intermediate') ? 'bg-accent' : level.includes('Advanced') ? 'bg-coral' : 'bg-slate-400';
  return <span className={`w-2 h-2 rounded-full inline-block ${color}`} />;
}

function CapacityBar({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const color = pct >= 100 ? 'bg-coral' : pct >= 75 ? 'bg-accent' : 'bg-teal';
  return (
    <div className="flex items-center gap-2 text-xs min-w-[120px]">
      <span className="text-text-muted font-semibold w-14">{label}</span>
      <div className="flex-1 bg-primary/5 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-text-muted tabular-nums font-semibold">{current}/{max}</span>
    </div>
  );
}

type RegStatus = 'pending' | 'confirmed' | 'waitlisted' | 'cancelled';

const REG_STATUS_META: Record<RegStatus, { label: string; icon: string; bg: string; ring: string; text: string; dot: string }> = {
  pending:    { label: 'Pending',    icon: '⏳', bg: 'bg-accent/15',     ring: 'ring-accent/30',     text: 'text-accent-dark', dot: 'bg-accent' },
  confirmed:  { label: 'Confirmed',  icon: '✓', bg: 'bg-teal/15',       ring: 'ring-teal/30',       text: 'text-teal-dark',   dot: 'bg-teal' },
  waitlisted: { label: 'Waitlisted', icon: '⏸', bg: 'bg-slate-200/70',  ring: 'ring-slate-400/30',  text: 'text-slate-600',   dot: 'bg-slate-400' },
  cancelled:  { label: 'Cancelled',  icon: '✕', bg: 'bg-coral/15',      ring: 'ring-coral/30',      text: 'text-coral-dark',  dot: 'bg-coral' },
};

const REG_TRANSITIONS: Record<RegStatus, { to: RegStatus; label: string }[]> = {
  pending:    [{ to: 'confirmed', label: 'Confirm' }, { to: 'waitlisted', label: 'Waitlist' }, { to: 'cancelled', label: 'Cancel' }],
  confirmed:  [{ to: 'waitlisted', label: 'Waitlist' }, { to: 'cancelled', label: 'Cancel' }],
  waitlisted: [{ to: 'confirmed', label: 'Confirm' }, { to: 'cancelled', label: 'Cancel' }],
  cancelled:  [{ to: 'confirmed', label: 'Re-confirm' }, { to: 'waitlisted', label: 'Waitlist' }],
};

function RegStatusPill({ status }: { status: RegStatus }) {
  const m = REG_STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${m.bg} ${m.ring} ${m.text}`}>
      <span aria-hidden>{m.icon}</span>{m.label}
    </span>
  );
}

function TransitionButton({ to, label, disabled, onClick }: { to: RegStatus; label: string; disabled: boolean; onClick: () => void }) {
  const m = REG_STATUS_META[to];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full transition disabled:opacity-50 ${m.bg} ${m.text} hover:brightness-95 ring-1 ${m.ring}`}
      title={`Change to ${m.label}`}
    >
      <span aria-hidden>→</span><span aria-hidden>{m.icon}</span>{label}
    </button>
  );
}

function InlineRegistrations({
  classRegs,
  danceClass,
  onUpdate,
  addingRegFor,
  setAddingRegFor,
}: {
  classRegs: Registration[];
  danceClass: DanceClass;
  onUpdate: () => void;
  addingRegFor: string | null;
  setAddingRegFor: (v: string | null) => void;
}) {
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [manualReg, setManualReg] = useState({ name: '', email: '', role: 'lead' as 'lead' | 'follow', partner_name: '', comment: '' });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');

  const sorted = [...classRegs].sort((a, b) => {
    const order: Record<string, number> = { confirmed: 0, pending: 1, waitlisted: 2, cancelled: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  async function updateStatus(registrationId: string, newStatus: string) {
    setUpdating((prev) => new Set(prev).add(registrationId));
    const { data: { session } } = await supabase.auth.getSession();
    const functionsUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1`;
    await fetch(`${functionsUrl}/confirm-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ registration_id: registrationId, new_status: newStatus }),
    });
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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
        headers.apikey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
        headers.Authorization = `Bearer ${import.meta.env.PUBLIC_SUPABASE_ANON_KEY}`;
      }

      const response = await fetch(`${functionsUrl}/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dance_class_id: danceClass.id,
          role: manualReg.role,
          name: manualReg.name.trim(),
          email: manualReg.email.trim().toLowerCase(),
          partner_name: manualReg.partner_name.trim() || null,
          comment: manualReg.comment.trim() || null,
          locale: 'de',
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setManualError(data.message || data.error || 'Registration failed');
      } else {
        setManualReg({ name: '', email: '', role: 'lead', partner_name: '', comment: '' });
        setAddingRegFor(null);
        onUpdate();
      }
    } catch {
      setManualError('Network error');
    } finally {
      setManualSaving(false);
    }
  }

  async function bulkConfirmByRole(role: 'lead' | 'follow') {
    const pending = classRegs.filter((r) => r.role === role && r.status === 'pending');
    if (pending.length === 0) return;
    if (!confirm(`Confirm all ${pending.length} pending ${role}s?`)) return;
    for (const reg of pending) {
      await updateStatus(reg.id, 'confirmed');
    }
  }

  const isAdding = addingRegFor === danceClass.id;

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setAddingRegFor(isAdding ? null : danceClass.id)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${isAdding ? 'bg-primary/10 text-primary' : 'bg-coral/10 hover:bg-coral/20 text-coral-dark'}`}
        >
          {isAdding ? 'Cancel' : '+ Add Participant'}
        </button>
        <button onClick={() => bulkConfirmByRole('lead')} className="text-xs font-semibold bg-teal/10 hover:bg-teal/20 text-teal-dark px-3 py-1.5 rounded-full transition-colors">
          ✓ Confirm pending Leads
        </button>
        <button onClick={() => bulkConfirmByRole('follow')} className="text-xs font-semibold bg-teal/10 hover:bg-teal/20 text-teal-dark px-3 py-1.5 rounded-full transition-colors">
          ✓ Confirm pending Follows
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleManualRegister} className="bg-white/70 backdrop-blur rounded-2xl border border-coral/30 shadow-soft p-5 mb-4">
          <h4 className="font-display font-bold text-base mb-3 text-primary">Add Participant Manually</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1 text-text-muted uppercase tracking-wider">Name <span className="text-coral">*</span></label>
              <input type="text" value={manualReg.name} onChange={(e) => setManualReg({ ...manualReg, name: e.target.value })} required className="w-full bg-white/60 border border-primary/10 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-coral/30 focus:border-coral outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-text-muted uppercase tracking-wider">Email <span className="text-coral">*</span></label>
              <input type="email" value={manualReg.email} onChange={(e) => setManualReg({ ...manualReg, email: e.target.value })} required className="w-full bg-white/60 border border-primary/10 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-coral/30 focus:border-coral outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-text-muted uppercase tracking-wider">Role <span className="text-coral">*</span></label>
              <select value={manualReg.role} onChange={(e) => setManualReg({ ...manualReg, role: e.target.value as 'lead' | 'follow' })} className="w-full bg-white/60 border border-primary/10 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-coral/30 outline-none transition cursor-pointer">
                <option value="lead">Lead</option>
                <option value="follow">Follow</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-text-muted uppercase tracking-wider">Partner Name</label>
              <input type="text" value={manualReg.partner_name} onChange={(e) => setManualReg({ ...manualReg, partner_name: e.target.value })} className="w-full bg-white/60 border border-primary/10 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-coral/30 focus:border-coral outline-none transition" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1 text-text-muted uppercase tracking-wider">Comment</label>
              <input type="text" value={manualReg.comment} onChange={(e) => setManualReg({ ...manualReg, comment: e.target.value })} placeholder="e.g. Phone registration" className="w-full bg-white/60 border border-primary/10 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-coral/30 focus:border-coral outline-none transition" />
            </div>
          </div>
          {manualError && <p className="text-coral-dark text-xs mt-2 font-semibold">{manualError}</p>}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-primary/5">
            <p className="text-xs text-text-muted">The participant will receive a confirmation email.</p>
            <button type="submit" disabled={manualSaving} className="bg-gradient-to-br from-coral to-coral-dark hover:brightness-105 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-full text-sm transition-all shadow-[0_4px_14px_-4px_rgba(231,111,81,0.5)]">
              {manualSaving ? 'Saving...' : 'Register & Send Email'}
            </button>
          </div>
        </form>
      )}

      {sorted.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-primary/5 bg-white/60 backdrop-blur">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-text-muted bg-primary/5">
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Email</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Partner</th>
                <th className="py-2.5 px-3">Current Status</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Change Status</th>
                <th className="py-2.5 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((reg) => {
                const isUpdating = updating.has(reg.id);
                const status = reg.status as RegStatus;
                const transitions = REG_TRANSITIONS[status] ?? [];
                return (
                  <tr key={reg.id} className="border-t border-primary/5 hover:bg-white/80 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-primary">{reg.name}</td>
                    <td className="py-2.5 px-3 text-text-muted">{reg.email}</td>
                    <td className="py-2.5 px-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${reg.role === 'lead' ? 'bg-primary/8 text-primary' : 'bg-coral/15 text-coral-dark'}`}>
                        {reg.role === 'lead' ? 'Lead' : 'Follow'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-text-muted">{reg.partner_name || '—'}</td>
                    <td className="py-2.5 px-3">
                      <RegStatusPill status={status} />
                    </td>
                    <td className="py-2.5 px-3 text-text-muted text-xs tabular-nums">{new Date(reg.created_at).toLocaleDateString('de-AT')}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {transitions.map((t) => (
                          <TransitionButton key={t.to} to={t.to} label={t.label} disabled={isUpdating} onClick={() => updateStatus(reg.id, t.to)} />
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 relative">
                      <button
                        onClick={() => setOpenMenu(openMenu === reg.id ? null : reg.id)}
                        className="text-text-muted hover:text-primary p-1 rounded-full hover:bg-primary/5 transition"
                        title="More actions"
                      >
                        ⋯
                      </button>
                      {openMenu === reg.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                          <div className="absolute right-2 top-8 z-20 bg-white rounded-xl shadow-lift border border-primary/10 py-1 min-w-[180px]">
                            <button
                              onClick={() => deleteRegistration(reg)}
                              className="w-full text-left text-xs font-semibold text-coral-dark hover:bg-coral/10 px-3 py-2 transition"
                            >
                              🗑 Delete permanently
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-text-muted text-sm text-center py-6">✦ No registrations yet.</p>
      )}
    </div>
  );
}

function ClassDetailView({ dc, sessions, classRegs, regCounts, onUpdate, addingRegFor, setAddingRegFor }: {
  dc: DanceClass;
  sessions: ClassSession[];
  classRegs: Registration[];
  regCounts: { leads: number; follows: number; pending: number; confirmed: number; waitlisted: number; cancelled: number };
  onUpdate: () => void;
  addingRegFor: string | null;
  setAddingRegFor: (v: string | null) => void;
}) {
  const fmt = (v: string | null | undefined) => v || '—';
  const fmtDate = (v: string | null | undefined) => {
    if (!v) return '—';
    return new Date(v).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Title (DE)</span>
        <p className="font-medium">{fmt(dc.title_de)}</p>
      </div>
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Title (EN)</span>
        <p className="font-medium">{fmt(dc.title_en)}</p>
      </div>
      <div className="md:col-span-2">
        <span className="text-text-muted text-xs uppercase tracking-wider">Description (DE)</span>
        <p className="whitespace-pre-wrap">{fmt(dc.description_de)}</p>
      </div>
      <div className="md:col-span-2">
        <span className="text-text-muted text-xs uppercase tracking-wider">Description (EN)</span>
        <p className="whitespace-pre-wrap">{fmt(dc.description_en)}</p>
      </div>
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Level</span>
        <p>{fmt(dc.level)}</p>
      </div>
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Dance</span>
        <p>{fmt(dc.dance)}</p>
      </div>
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Teachers</span>
        <p>{fmt(dc.teachers)}</p>
      </div>
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Location</span>
        <p>
          {dc.location_url ? (
            <a href={dc.location_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{dc.location || dc.location_url}</a>
          ) : (
            fmt(dc.location)
          )}
        </p>
      </div>
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Max Leads</span>
        <p>{dc.max_leads}</p>
      </div>
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Max Follows</span>
        <p>{dc.max_follows}</p>
      </div>
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Price (EUR)</span>
        <p>{dc.price_eur != null ? `${dc.price_eur} €` : '—'}</p>
      </div>
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Public</span>
        <p>{dc.is_public ? 'Yes' : 'No'}</p>
      </div>
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Registration opens</span>
        <p>{fmtDate(dc.registration_opens_at)}</p>
      </div>
      <div>
        <span className="text-text-muted text-xs uppercase tracking-wider">Registration closes</span>
        <p>{fmtDate(dc.registration_closes_at)}</p>
      </div>

      {sessions.length > 0 && (
        <div className="md:col-span-2 mt-2">
          <span className="text-text-muted text-xs uppercase tracking-wider">Sessions</span>
          <div className="mt-1 space-y-1">
            {sessions
              .sort((a, b) => (a.session_date ?? '').localeCompare(b.session_date ?? ''))
              .map((s, i) => (
                <div key={s.id || i} className="flex items-center gap-3 text-sm bg-white rounded px-3 py-1.5 border border-gray-100">
                  <span className="font-medium">
                    {s.session_date ? new Date(s.session_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                  </span>
                  <span className="text-text-muted">
                    {s.start_time?.slice(0, 5) || '?'} – {s.end_time?.slice(0, 5) || '?'}
                  </span>
                  {s.note && <span className="text-text-muted italic">{s.note}</span>}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>

    {/* Registrations */}
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
      <InlineRegistrations
        classRegs={classRegs}
        danceClass={dc}
        onUpdate={onUpdate}
        addingRegFor={addingRegFor}
        setAddingRegFor={setAddingRegFor}
      />
    </div>
    </div>
  );
}

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
  return (
    <form onSubmit={handleSave} className="bg-surface/85 backdrop-blur rounded-2xl shadow-lift border border-coral/20 p-6 space-y-6">
      <h3 className="font-display text-xl font-bold text-primary">{title}</h3>

      {/* ── Basic Info ── */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">Basic Info</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Title (DE)" value={editing.title_de ?? ''} onChange={(v) => setEditing({ ...editing, title_de: v })} required />
          <Input label="Title (EN)" value={editing.title_en ?? ''} onChange={(v) => setEditing({ ...editing, title_en: v })} required />
          <div>
            <label className="block text-sm font-medium mb-1">Dance</label>
            <select value={editing.dance ?? ''} onChange={(e) => setEditing({ ...editing, dance: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">—</option>
              {DANCES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Level</label>
            <select value={editing.level ?? ''} onChange={(e) => setEditing({ ...editing, level: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">—</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <Input label="Teachers" value={editing.teachers ?? ''} onChange={(v) => setEditing({ ...editing, teachers: v })} placeholder="e.g. Alice & Bob" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea label="Description (DE)" value={editing.description_de ?? ''} onChange={(v) => setEditing({ ...editing, description_de: v })} hint="Markdown: **bold**, newline = line break, - for lists" />
          <TextArea label="Description (EN)" value={editing.description_en ?? ''} onChange={(v) => setEditing({ ...editing, description_en: v })} hint="Markdown: **bold**, newline = line break, - for lists" />
        </div>
      </fieldset>

      {/* ── Location & Pricing ── */}
      <fieldset className="space-y-4 border-t pt-4">
        <legend className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">Location & Pricing</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Location" value={editing.location ?? ''} onChange={(v) => setEditing({ ...editing, location: v })} />
          <Input label="Location URL (Google Maps)" value={editing.location_url ?? ''} onChange={(v) => setEditing({ ...editing, location_url: v })} placeholder="https://maps.google.com/..." />
          <div>
            <Input label="Price (EUR)" type="number" value={String(editing.price_eur ?? 0)} onChange={(v) => setEditing({ ...editing, price_eur: Number(v) })} />
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" id="is_donation" checked={editing.is_donation ?? false} onChange={(e) => setEditing({ ...editing, is_donation: e.target.checked })} className="accent-primary" />
              <span className="text-xs text-text-muted">Donation-based (no fixed price)</span>
            </label>
          </div>
        </div>
      </fieldset>

      {/* ── Capacity ── */}
      <fieldset className="space-y-4 border-t pt-4">
        <legend className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">Capacity</legend>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Input label="Max Leads" type="number" value={String(editing.max_leads ?? 10)} onChange={(v) => setEditing({ ...editing, max_leads: Number(v) })} required />
          <Input label="Max Follows" type="number" value={String(editing.max_follows ?? 10)} onChange={(v) => setEditing({ ...editing, max_follows: Number(v) })} required />
          <Input label="Min Leads" type="number" value={String(editing.min_leads ?? 3)} onChange={(v) => setEditing({ ...editing, min_leads: Number(v) })} />
          <Input label="Min Follows" type="number" value={String(editing.min_follows ?? 3)} onChange={(v) => setEditing({ ...editing, min_follows: Number(v) })} />
        </div>
      </fieldset>

      {/* ── What to Bring ── */}
      <fieldset className="space-y-4 border-t pt-4">
        <legend className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">What to Bring</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea label="What to Bring (DE)" value={editing.what_to_bring_de ?? ''} onChange={(v) => setEditing({ ...editing, what_to_bring_de: v })} hint="One item per line, use - for bullet list" />
          <TextArea label="What to Bring (EN)" value={editing.what_to_bring_en ?? ''} onChange={(v) => setEditing({ ...editing, what_to_bring_en: v })} hint="One item per line, use - for bullet list" />
        </div>
      </fieldset>

      {/* ── Registration & Visibility ── */}
      <fieldset className="space-y-4 border-t pt-4">
        <legend className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">Registration & Visibility</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Registration Opens At" type="datetime-local" value={editing.registration_opens_at ? editing.registration_opens_at.slice(0, 16) : ''} onChange={(v) => setEditing({ ...editing, registration_opens_at: v ? new Date(v).toISOString() : '' })} />
          <Input label="Registration Closes At" type="datetime-local" value={editing.registration_closes_at ? editing.registration_closes_at.slice(0, 16) : ''} onChange={(v) => setEditing({ ...editing, registration_closes_at: v ? new Date(v).toISOString() : '' })} />
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" id="is_public" checked={editing.is_public ?? false} onChange={(e) => setEditing({ ...editing, is_public: e.target.checked })} className="accent-primary" />
            <label htmlFor="is_public" className="text-sm">Public (visible on website)</label>
          </div>
        </div>
      </fieldset>

      <div className="mt-6 border-t pt-4">
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-bold text-sm">Sessions ({sessions.length})</h4>
          <div className="flex gap-2">
            <GenerateButton onGenerate={generateWeeklyDates} />
            <button type="button" onClick={addSession} className="text-xs bg-primary/10 hover:bg-primary/20 text-primary font-medium px-3 py-1 rounded transition-colors">+ Add Date</button>
          </div>
        </div>
        {sessions.length === 0 && <p className="text-text-muted text-sm text-center py-4">No sessions yet. Add individual dates or generate weekly dates.</p>}
        <div className="space-y-2">
          {sessions.map((s, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
              <input type="date" value={s.session_date} onChange={(e) => updateSession(i, 'session_date', e.target.value)} required className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 min-w-0" />
              <input type="time" value={s.start_time} onChange={(e) => updateSession(i, 'start_time', e.target.value)} required className="border border-gray-300 rounded px-2 py-1 text-sm w-24" />
              <span className="text-text-muted text-xs">–</span>
              <input type="time" value={s.end_time} onChange={(e) => updateSession(i, 'end_time', e.target.value)} required className="border border-gray-300 rounded px-2 py-1 text-sm w-24" />
              <input type="text" value={s.note} onChange={(e) => updateSession(i, 'note', e.target.value)} placeholder="Note" className="border border-gray-300 rounded px-2 py-1 text-sm w-32" />
              <button type="button" onClick={() => removeSession(i)} className="text-error hover:text-red-700 text-lg font-bold px-1" title="Remove">×</button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 border-t border-primary/5 pt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-text-muted hover:text-text transition-colors">Cancel</button>
        <button type="submit" disabled={saving} className="bg-gradient-to-br from-coral to-coral-dark hover:brightness-105 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-full transition-all text-sm shadow-[0_4px_14px_-4px_rgba(231,111,81,0.5)]">
          {saving ? 'Saving...' : 'Save'}
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

  function handleGenerate() {
    if (!startDate || weeks < 1) return;
    onGenerate(startDate, weeks, startTime, endTime);
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs bg-accent/15 hover:bg-accent/25 text-accent-dark font-medium px-3 py-1 rounded transition-colors">Generate Weekly</button>
    );
  }

  return (
    <div className="absolute bg-surface border shadow-lg rounded-lg p-4 z-10 right-0 w-72">
      <h5 className="font-bold text-sm mb-3">Generate Weekly Dates</h5>
      <div className="space-y-2">
        <div><label className="text-xs font-medium">First Date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs font-medium">Number of Weeks</label><input type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs font-medium">Start Time</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs font-medium">End Time</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" /></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-text-muted hover:text-text px-2 py-1">Cancel</button>
        <button type="button" onClick={handleGenerate} className="text-xs bg-primary text-white px-3 py-1 rounded">Generate</button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
    </div>
  );
}

function TextArea({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-y" />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
