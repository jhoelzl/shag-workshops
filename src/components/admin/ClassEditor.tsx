import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { DanceClass, ClassSession } from '../../lib/database.types';
import { getClassState } from '../../lib/classState';

interface Props {
  classes: DanceClass[];
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
  location: '',
  location_url: '',
  max_leads: 10,
  max_follows: 10,
  price_eur: 0,
  registration_opens_at: '',
  registration_closes_at: '',
  is_public: false,
};

const EMPTY_SESSION: SessionDraft = {
  session_date: '',
  start_time: '19:00',
  end_time: '20:00',
  note: '',
};

export default function ClassEditor({ classes, onUpdate }: Props) {
  const [editing, setEditing] = useState<Partial<DanceClass> | null>(null);
  const [sessions, setSessions] = useState<SessionDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [classSessionsMap, setClassSessionsMap] = useState<Record<string, ClassSession[]>>({});

  // Load sessions for all classes
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

  // Generate weekly dates helper
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

    const payload = {
      title_de: editing.title_de,
      title_en: editing.title_en,
      description_de: editing.description_de || null,
      description_en: editing.description_en || null,
      level: editing.level || null,
      location: editing.location || null,
      location_url: editing.location_url || null,
      max_leads: editing.max_leads,
      max_follows: editing.max_follows,
      price_eur: editing.price_eur ?? null,
      registration_opens_at: editing.registration_opens_at || null,
      registration_closes_at: editing.registration_closes_at || null,
      is_public: editing.is_public ?? false,
    };

    let classId = editing.id;

    if (classId) {
      await supabase.from('dance_classes').update(payload).eq('id', classId);
    } else {
      const { data } = await supabase.from('dance_classes').insert(payload).select('id').single();
      classId = data?.id;
    }

    if (classId) {
      // Delete existing sessions and re-insert
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
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Dance Classes</h2>
        {!isCreatingNew && (
          <button
            onClick={() => startEditing()}
            className="bg-primary hover:bg-primary-light text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
          >
            + New Class
          </button>
        )}
      </div>

      {/* New Class Form (inline at the top) */}
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

      {/* Class List */}
      <div className="space-y-3 mb-8">
        {classes.map((dc) => (
          <div key={dc.id}>
            {isEditingThis(dc.id) ? (
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
                title={`Edit: ${dc.title_de}`}
              />
            ) : (
              <div className={`bg-surface rounded-lg shadow-sm border border-gray-100 p-4 flex items-center justify-between ${editing ? 'opacity-50' : ''}`}>
                <div>
                  <div className="font-medium">{dc.title_de} / {dc.title_en}</div>
                  <div className="text-sm text-text-muted">
                    {dc.level} · {getClassDateSummary(dc.id)} · {dc.max_leads}L/{dc.max_follows}F
                    {(() => {
                      const state = getClassState(classSessionsMap[dc.id] || [], dc.registration_opens_at, dc.registration_closes_at);
                      if (state === 'open') return <span className="text-green-600 ml-2 font-medium">OPEN</span>;
                      if (state === 'archived') return <span className="text-text-muted ml-2 font-medium">ARCHIVED</span>;
                      return <span className="text-accent ml-2 font-medium">UPCOMING</span>;
                    })()}
                    {!dc.is_public && <span className="text-text-muted ml-2 font-medium">DRAFT</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEditing(dc)}
                    disabled={!!editing}
                    className="text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50 px-3 py-1 rounded transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => duplicateClass(dc)}
                    disabled={!!editing}
                    className="text-sm bg-blue-50 hover:bg-blue-100 text-primary disabled:opacity-50 px-3 py-1 rounded transition-colors"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleDelete(dc.id)}
                    disabled={!!editing}
                    className="text-sm bg-red-50 hover:bg-red-100 text-error disabled:opacity-50 px-3 py-1 rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {classes.length === 0 && !isCreatingNew && <p className="text-text-muted text-center py-8">No classes yet.</p>}
      </div>
    </div>
  );
}

// Inline Class Form
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
    <form onSubmit={handleSave} className="bg-surface rounded-xl shadow-md border-2 border-primary/20 p-6">
      <h3 className="text-lg font-bold mb-4">{title}</h3>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="Title (DE)" value={editing.title_de ?? ''} onChange={(v) => setEditing({ ...editing, title_de: v })} required />
        <Input label="Title (EN)" value={editing.title_en ?? ''} onChange={(v) => setEditing({ ...editing, title_en: v })} required />
        <div>
          <label className="block text-sm font-medium mb-1">Level</label>
          <select
            value={editing.level ?? ''}
            onChange={(e) => setEditing({ ...editing, level: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">—</option>
            <option value="Beginner">Beginner</option>
            <option value="Beginner/Improver">Beginner/Improver</option>
            <option value="Improver">Improver</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Intermediate/Advanced">Intermediate/Advanced</option>
            <option value="Advanced">Advanced</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mt-4">
        <TextArea label="Description (DE)" value={editing.description_de ?? ''} onChange={(v) => setEditing({ ...editing, description_de: v })} hint="Markdown: **fett**, Zeilenumbruch = neue Zeile, - für Listen" />
        <TextArea label="Description (EN)" value={editing.description_en ?? ''} onChange={(v) => setEditing({ ...editing, description_en: v })} hint="Markdown: **bold**, newline = line break, - for lists" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
        <Input label="Location" value={editing.location ?? ''} onChange={(v) => setEditing({ ...editing, location: v })} />
        <Input label="Location URL (Google Maps)" value={editing.location_url ?? ''} onChange={(v) => setEditing({ ...editing, location_url: v })} placeholder="https://maps.google.com/..." />
        <Input label="Price (EUR)" type="number" value={String(editing.price_eur ?? 0)} onChange={(v) => setEditing({ ...editing, price_eur: Number(v) })} />
        <Input label="Max Leads" type="number" value={String(editing.max_leads ?? 10)} onChange={(v) => setEditing({ ...editing, max_leads: Number(v) })} required />
        <Input label="Max Follows" type="number" value={String(editing.max_follows ?? 10)} onChange={(v) => setEditing({ ...editing, max_follows: Number(v) })} required />
        <Input
          label="Registration Opens At"
          type="datetime-local"
          value={editing.registration_opens_at ? editing.registration_opens_at.slice(0, 16) : ''}
          onChange={(v) => setEditing({ ...editing, registration_opens_at: v ? new Date(v).toISOString() : '' })}
        />
        <Input
          label="Registration Closes At"
          type="datetime-local"
          value={editing.registration_closes_at ? editing.registration_closes_at.slice(0, 16) : ''}
          onChange={(v) => setEditing({ ...editing, registration_closes_at: v ? new Date(v).toISOString() : '' })}
        />
        <div className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            id="is_public"
            checked={editing.is_public ?? false}
            onChange={(e) => setEditing({ ...editing, is_public: e.target.checked })}
            className="accent-primary"
          />
          <label htmlFor="is_public" className="text-sm">Public (im Frontend sichtbar)</label>
        </div>
      </div>

      {/* Sessions Section */}
      <div className="mt-6 border-t pt-4">
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-bold text-sm">Sessions ({sessions.length})</h4>
          <div className="flex gap-2">
            <GenerateButton onGenerate={generateWeeklyDates} />
            <button
              type="button"
              onClick={addSession}
              className="text-xs bg-primary/10 hover:bg-primary/20 text-primary font-medium px-3 py-1 rounded transition-colors"
            >
              + Add Date
            </button>
          </div>
        </div>

        {sessions.length === 0 && (
          <p className="text-text-muted text-sm text-center py-4">No sessions yet. Add individual dates or generate weekly dates.</p>
        )}

        <div className="space-y-2">
          {sessions.map((s, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
              <input
                type="date"
                value={s.session_date}
                onChange={(e) => updateSession(i, 'session_date', e.target.value)}
                required
                className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 min-w-0"
              />
              <input
                type="time"
                value={s.start_time}
                onChange={(e) => updateSession(i, 'start_time', e.target.value)}
                required
                className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
              />
              <span className="text-text-muted text-xs">–</span>
              <input
                type="time"
                value={s.end_time}
                onChange={(e) => updateSession(i, 'end_time', e.target.value)}
                required
                className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
              />
              <input
                type="text"
                value={s.note}
                onChange={(e) => updateSession(i, 'note', e.target.value)}
                placeholder="Note"
                className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
              />
              <button
                type="button"
                onClick={() => removeSession(i)}
                className="text-error hover:text-red-700 text-lg font-bold px-1"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 border-t pt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-text-muted hover:text-text transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-light disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg transition-colors text-sm">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// Generate weekly dates helper popup
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs bg-accent/15 hover:bg-accent/25 text-accent-dark font-medium px-3 py-1 rounded transition-colors"
      >
        Generate Weekly
      </button>
    );
  }

  return (
    <div className="absolute bg-surface border shadow-lg rounded-lg p-4 z-10 right-0 w-72">
      <h5 className="font-bold text-sm mb-3">Generate Weekly Dates</h5>
      <div className="space-y-2">
        <div>
          <label className="text-xs font-medium">First Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium">Number of Weeks</label>
          <input type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium">Start Time</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium">End Time</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-text-muted hover:text-text px-2 py-1">Cancel</button>
        <button type="button" onClick={handleGenerate} className="text-xs bg-primary text-white px-3 py-1 rounded">Generate</button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
      />
    </div>
  );
}

function TextArea({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-y"
      />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
