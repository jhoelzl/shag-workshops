import { Fragment, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { DanceClass, Registration, RegistrationHistory, ClassSession } from '../../lib/database.types';

interface Props {
  registrations: Registration[];
  history: RegistrationHistory[];
  classes: DanceClass[];
  sessionsMap: Record<string, ClassSession[]>;
  currentUser: any;
  onUpdate: () => void;
}

interface AddForm {
  name: string;
  email: string;
  role: 'lead' | 'follow';
  partner_name: string;
  comment: string;
}

const emptyForm: AddForm = { name: '', email: '', role: 'lead', partner_name: '', comment: '' };

type Status = 'pending' | 'confirmed' | 'waitlisted' | 'cancelled';

const STATUS_META: Record<Status, { label: string; icon: string; bg: string; color: string }> = {
  pending: { label: 'Pending', icon: '⏳', bg: 'bg-amber-50', color: 'text-amber-700' },
  confirmed: { label: 'Confirmed', icon: '✓', bg: 'bg-teal/10', color: 'text-teal-dark' },
  waitlisted: { label: 'Waitlisted', icon: '⏸', bg: 'bg-slate-100', color: 'text-slate-600' },
  cancelled: { label: 'Cancelled', icon: '✕', bg: 'bg-coral/10', color: 'text-coral-dark' },
};

const TRANSITIONS: Record<Status, { to: Status; label: string }[]> = {
  pending: [
    { to: 'confirmed', label: 'Confirm' },
    { to: 'waitlisted', label: 'Waitlist' },
    { to: 'cancelled', label: 'Cancel' },
  ],
  confirmed: [
    { to: 'waitlisted', label: 'Waitlist' },
    { to: 'cancelled', label: 'Cancel' },
  ],
  waitlisted: [
    { to: 'confirmed', label: 'Confirm' },
    { to: 'cancelled', label: 'Cancel' },
  ],
  cancelled: [
    { to: 'confirmed', label: 'Re-confirm' },
    { to: 'waitlisted', label: 'Waitlist' },
  ],
};

export default function RegistrationTable({ registrations, history, classes, sessionsMap, currentUser, onUpdate }: Props) {
  // Filters
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');

  // UI state
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(emptyForm);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const classMap = new Map(classes.map((c) => [c.id, c]));
  const historyByRegistration = history.reduce((acc, entry) => {
    if (!acc.has(entry.registration_id)) acc.set(entry.registration_id, []);
    acc.get(entry.registration_id)!.push(entry);
    return acc;
  }, new Map<string, RegistrationHistory[]>());

  // Determine archived classes (no future sessions)
  const now = new Date();
  const today = useMemo(() => now.toISOString().split('T')[0], []);

  const archivedClassIds = useMemo(() => {
    return new Set(
      classes
        .filter((c) => {
          const sessions = sessionsMap[c.id] || [];
          const hasFutureSessions = sessions.some((s) => s.session_date >= today);
          return !hasFutureSessions && sessions.length > 0;
        })
        .map((c) => c.id)
    );
  }, [classes, sessionsMap, today]);

  const activeClasses = useMemo(() => classes.filter(c => !archivedClassIds.has(c.id)), [classes, archivedClassIds]);

  // Apply filters
  const filtered = registrations.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (classFilter !== 'all' && r.dance_class_id !== classFilter) return false;
    if (!showArchived && archivedClassIds.has(r.dance_class_id)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = r.name.toLowerCase().includes(q);
      const matchesEmail = r.email.toLowerCase().includes(q);
      const matchesClass = classes.find(c => c.id === r.dance_class_id)?.title_de?.toLowerCase().includes(q);
      if (!matchesName && !matchesEmail && !matchesClass) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return 0;
  });

  const selectedClass = classFilter !== 'all' ? classMap.get(classFilter) : null;

  // Stats excluding archived by default
  const stats = {
    pending: registrations.filter(r => r.status === 'pending' && !archivedClassIds.has(r.dance_class_id)).length,
    confirmed: registrations.filter(r => r.status === 'confirmed' && !archivedClassIds.has(r.dance_class_id)).length,
    waitlisted: registrations.filter(r => r.status === 'waitlisted' && !archivedClassIds.has(r.dance_class_id)).length,
    total: registrations.filter(r => !archivedClassIds.has(r.dance_class_id)).length,
    archivedCount: registrations.filter(r => archivedClassIds.has(r.dance_class_id)).length,
  };

  const hasFilters = statusFilter !== 'all' || classFilter !== 'all' || searchQuery || showArchived;

  async function updateStatus(registrationId: string, newStatus: string) {
    setUpdating((prev) => new Set(prev).add(registrationId));
    setOpenMenu(null);
    const { data: { session } } = await supabase.auth.getSession();
    const functionsUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1`;
    await fetch(`${functionsUrl}/confirm-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ registration_id: registrationId, new_status: newStatus }),
    });
    setUpdating((prev) => { const next = new Set(prev); next.delete(registrationId); return next; });
    onUpdate();
  }

  async function deleteRegistration(reg: Registration) {
    if (!confirm(`Delete registration for "${reg.name}" (${reg.email})?\n\nThis permanently removes the entry. This cannot be undone.`)) return;
    setUpdating((prev) => new Set(prev).add(reg.id));
    setOpenMenu(null);
    const { error } = await supabase.from('registrations').delete().eq('id', reg.id);
    if (error) alert(`Delete failed: ${error.message}`);
    setUpdating((prev) => { const next = new Set(prev); next.delete(reg.id); return next; });
    onUpdate();
  }

  async function submitAddParticipant(e: React.FormEvent) {
    e.preventDefault();
    if (classFilter === 'all') return;
    setAddError(null);
    setAddSubmitting(true);
    const { data: { session } } = await supabase.auth.getSession();
    const functionsUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1`;
    try {
      const res = await fetch(`${functionsUrl}/admin-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          dance_class_id: classFilter,
          name: addForm.name.trim(),
          email: addForm.email.trim(),
          role: addForm.role,
          partner_name: addForm.partner_name.trim() || undefined,
          comment: addForm.comment.trim() || undefined,
          locale: 'de',
          send_email: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setAddError(json?.error || 'Registration failed'); return; }
      setAddForm(emptyForm);
      setShowAdd(false);
      onUpdate();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setAddSubmitting(false);
    }
  }

  async function bulkUpdateByRole(role: 'lead' | 'follow', newStatus: string) {
    const pending = filtered.filter((r) => r.role === role && r.status === 'pending');
    if (pending.length === 0) return;
    if (!confirm(`Set all ${pending.length} pending ${role}s to "${newStatus}"?`)) return;
    for (const reg of pending) await updateStatus(reg.id, newStatus);
  }

  function exportFilteredAsCsv() {
    if (filtered.length === 0) return;
    const headers = ['Name', 'Email', 'Role', 'Partner', 'Status', 'Class', 'Comment', 'Date'];
    const rows = filtered.map((reg) => {
      const dc = classMap.get(reg.dance_class_id);
      return [reg.name, reg.email, reg.role, reg.partner_name || '', reg.status, dc?.title_de || '', reg.comment || '', new Date(reg.created_at).toISOString()];
    });
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `registrations-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-up space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">Registrations</h2>
            {hasFilters && (
              <button
                onClick={() => { setStatusFilter('all'); setClassFilter('all'); setSearchQuery(''); setShowArchived(false); }}
                className="text-xs font-medium text-coral hover:text-coral-dark px-2 py-1 rounded-full bg-coral/5 hover:bg-coral/10 transition-colors"
              >
                Reset filters
              </button>
            )}
          </div>
          <p className="text-sm text-text-muted mt-0.5">
            {showArchived
              ? `${registrations.length} total registrations`
              : `${stats.total} from active classes · ${stats.archivedCount} from archived hidden`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {classFilter !== 'all' && (
            <>
              <button
                onClick={() => { setShowAdd(true); setAddError(null); }}
                className="text-xs font-semibold bg-gradient-to-br from-coral to-coral-dark hover:brightness-105 text-white px-4 py-2 rounded-full shadow-[0_4px_14px_-4px_rgba(231,111,81,0.5)] transition-all"
              >
                + Add Participant
              </button>
              <button
                onClick={exportFilteredAsCsv}
                disabled={filtered.length === 0}
                className="text-xs font-semibold bg-white border border-primary/10 hover:bg-bg-warm/50 text-primary px-4 py-2 rounded-full transition-colors disabled:opacity-50"
              >
                Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats as Tab Buttons */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <StatBtn count={stats.pending} label="Pending" active={statusFilter === 'pending'} onClick={() => setStatusFilter(s => s === 'pending' ? 'all' : 'pending')} />
        <StatBtn count={stats.confirmed} label="Confirmed" active={statusFilter === 'confirmed'} onClick={() => setStatusFilter(s => s === 'confirmed' ? 'all' : 'confirmed')} />
        <StatBtn count={stats.waitlisted} label="Waitlisted" active={statusFilter === 'waitlisted'} onClick={() => setStatusFilter(s => s === 'waitlisted' ? 'all' : 'waitlisted')} />
        <StatBtn count={showArchived ? registrations.length : stats.total} label={showArchived ? 'All' : 'Active'} active={statusFilter === 'all' && !showArchived} onClick={() => { setStatusFilter('all'); setShowArchived(false); }} />
      </div>

      {/* Search & Class Filter in one row */}
      <div className="bg-white rounded-xl border border-primary/10 p-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search name, email, or class..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-bg-warm/30 border border-transparent rounded-lg text-sm focus:ring-2 focus:ring-coral/30 outline-none transition"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-2 bg-bg-warm/30 border border-transparent rounded-lg text-sm focus:ring-2 focus:ring-coral/30 outline-none cursor-pointer min-w-[180px]"
            >
              <option value="all">All Classes</option>
              {activeClasses.map((c) => <option key={c.id} value={c.id}>{c.title_de}</option>)}
              {classes.some(c => archivedClassIds.has(c.id)) && (
                <>
                  <option value="" disabled>─── Archived ───</option>
                  {classes.filter(c => archivedClassIds.has(c.id)).map(c => (
                    <option key={c.id} value={c.id}>{c.title_de}</option>
                  ))}
                </>
              )}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}
              className="px-3 py-2 bg-bg-warm/30 border border-transparent rounded-lg text-sm focus:ring-2 focus:ring-coral/30 outline-none cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">A-Z</option>
            </select>
          </div>
        </div>

        {/* Archive toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-bg-warm">
          <label className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-9 h-5 rounded-full transition-colors ${showArchived ? 'bg-coral' : 'bg-slate-300'} relative`}>
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${showArchived ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="sr-only" />
            <span className="text-xs text-text-muted group-hover:text-text transition-colors">Include archived classes</span>
          </label>
          <span className="text-xs text-text-muted/60 font-medium">{filtered.length} results</span>
        </div>
      </div>

      {/* Bulk actions when a class is selected */}
      {classFilter !== 'all' && selectedClass && (
        <div className="flex items-center gap-4 p-3 bg-teal/5 rounded-xl">
          <div className="flex-1">
            <span className="text-sm font-semibold text-primary">{selectedClass.title_de}</span>
            <span className="text-xs text-text-muted ml-2">
              {filtered.filter(r => r.status === 'pending').length} pending · {filtered.filter(r => r.status === 'confirmed').length} confirmed
            </span>
          </div>
          {filtered.some(r => r.status === 'pending') && (
            <div className="flex gap-2">
              <button onClick={() => bulkUpdateByRole('lead', 'confirmed')} className="text-xs font-medium bg-teal/20 hover:bg-teal/30 text-teal-dark px-3 py-1.5 rounded-full transition-colors">
                ✓ All Leads
              </button>
              <button onClick={() => bulkUpdateByRole('follow', 'confirmed')} className="text-xs font-medium bg-coral/20 hover:bg-coral/30 text-coral-dark px-3 py-1.5 rounded-full transition-colors">
                ✓ All Follows
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add Form */}
      {classFilter !== 'all' && showAdd && (
        <form onSubmit={submitAddParticipant} className="bg-surface/80 backdrop-blur rounded-xl border border-coral/20 shadow-soft p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-7 h-7 rounded-full bg-coral/15 text-coral text-sm inline-flex items-center justify-center">＋</span>
            <h3 className="font-display text-base font-bold text-primary">Add Participant Manually</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Name" required>
              <input type="text" required value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Email" required>
              <input type="email" required value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Role" required>
              <select value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value as 'lead' | 'follow' })} className={inputCls}>
                <option value="lead">Lead</option>
                <option value="follow">Follow</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Partner Name">
                  <input type="text" value={addForm.partner_name} onChange={(e) => setAddForm({ ...addForm, partner_name: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Comment">
                  <input type="text" value={addForm.comment} onChange={(e) => setAddForm({ ...addForm, comment: e.target.value })} placeholder="e.g. Phone registration" className={inputCls} />
                </Field>
              </div>
            </div>
          </div>
          {addError && <p className="mt-3 text-sm text-coral-dark">{addError}</p>}
          <div className="mt-4 pt-3 border-t border-primary/5 flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setShowAdd(false); setAddForm(emptyForm); }} className="text-xs font-semibold text-text-muted hover:text-primary px-4 py-2 rounded-full transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={addSubmitting}
              className="bg-gradient-to-br from-coral to-coral-dark hover:brightness-105 text-white text-xs font-semibold px-5 py-2 rounded-full disabled:opacity-50 transition-all shadow-[0_4px_14px_-4px_rgba(231,111,81,0.5)]"
            >
              {addSubmitting ? 'Saving...' : 'Register & Send Email'}
            </button>
          </div>
        </form>
      )}

      {/* Registrations Table */}
      <div className="bg-white rounded-xl border border-primary/10 shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-warm/50 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <th className="py-3 px-4">Participant</th>
                <th className="py-3 px-4">Class</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((reg, index) => {
                const dc = classMap.get(reg.dance_class_id);
                const isUpdating = updating.has(reg.id);
                const status = reg.status as Status;
                const meta = STATUS_META[status];
                const transitions = TRANSITIONS[status] || [];
                const isMenuOpen = openMenu === reg.id;
                const openUpward = index >= filtered.length - 2;
                const entries = historyByRegistration.get(reg.id) || [];
                const isHistoryOpen = openHistory === reg.id;
                const isArchived = archivedClassIds.has(reg.dance_class_id);

                return (
                  <Fragment key={reg.id}>
                    <tr className={`border-t border-bg-warm hover:bg-bg-warm/30 transition-colors align-middle ${isUpdating ? 'opacity-50' : ''} ${isArchived ? 'bg-slate-50/50' : ''}`}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-primary">{reg.name}</div>
                        <div className="text-xs text-text-muted">{reg.email}</div>
                      </td>
                      <td className="py-3 px-4 text-text-muted text-xs">
                        <span className={isArchived ? 'text-slate-400' : ''}>{dc?.title_de ?? '-'}</span>
                        {isArchived && <span className="ml-1.5 text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">archived</span>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${reg.role === 'lead' ? 'bg-primary/8 text-primary' : 'bg-coral/10 text-coral-dark'}`}>
                          {reg.role === 'lead' ? 'Lead' : 'Follow'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${meta.bg} ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-text-muted text-xs tabular-nums">
                        {new Date(reg.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          {transitions.map((t) => (
                            <TransitionBtn key={t.to} to={t.to} label={t.label} onClick={() => updateStatus(reg.id, t.to)} disabled={isUpdating} />
                          ))}
                          <button
                            onClick={() => setOpenMenu(isMenuOpen ? null : reg.id)}
                            disabled={isUpdating}
                            className="text-text-muted hover:text-primary hover:bg-bg-warm p-1.5 rounded-lg transition-colors ml-1"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>
                          </button>
                        </div>
                        {isMenuOpen && (
                          <>
                            <button type="button" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpenMenu(null)} />
                            <div className={`absolute right-3 z-20 bg-white rounded-xl shadow-lift border border-primary/10 py-1 min-w-[160px] ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                              <button onClick={() => setOpenHistory(isHistoryOpen ? null : reg.id)} className="w-full text-left text-xs font-medium text-text-muted hover:text-primary hover:bg-bg-warm/50 px-4 py-2 transition-colors">
                                History ({entries.length})
                              </button>
                              <div className="border-t border-bg-warm my-1" />
                              <button onClick={() => deleteRegistration(reg)} className="w-full text-left text-xs font-medium text-coral-dark hover:bg-coral/10 px-4 py-2 transition-colors">
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                    {isHistoryOpen && (
                      <tr className="bg-bg-warm/30 border-t border-bg-warm">
                        <td colSpan={6} className="px-4 py-3">
                          {entries.length === 0 ? (
                            <p className="text-xs text-text-muted">No history entries.</p>
                          ) : (
                            <div className="space-y-2">
                              {entries.slice(0, 8).map((entry) => (
                                <div key={entry.id} className="flex items-center gap-3 text-xs">
                                  <span className="text-[10px] text-text-muted tabular-nums">{new Date(entry.created_at).toLocaleDateString('de-DE')}</span>
                                  <span className={HISTORY_TONE[entry.event_type]}>{formatHistoryEventLabel(entry)}</span>
                                  <span className="flex-1 text-primary/70">{formatHistoryDetails(entry)}</span>
                                </div>
                              ))}
                              {entries.length > 8 && <p className="text-[10px] text-text-muted">+ {entries.length - 8} more entries</p>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-bg-warm mb-3">
                      <svg className="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <p className="font-semibold text-text-muted mb-1">
                      {searchQuery ? 'No matching registrations' : classFilter !== 'all' ? 'No registrations for this class' : 'No registrations yet'}
                    </p>
                    <p className="text-xs text-text-muted/70 max-w-sm mx-auto">
                      {searchQuery
                        ? `Try a different search term`
                        : classFilter !== 'all' ? 'Share the workshop link to get sign-ups.' : 'Registrations will appear here when participants sign up.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatBtn({ count, label, active, onClick }: { count: number; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-center py-3 px-2 rounded-xl border transition-all ${active ? 'bg-primary text-white border-primary shadow-md' : 'bg-bg-warm/50 border-transparent hover:bg-bg-warm text-text-muted hover:text-primary'}`}
    >
      <div className={`text-xl sm:text-2xl font-display font-bold ${active ? 'text-white' : 'text-primary'}`}>{count}</div>
      <div className={`text-[10px] sm:text-xs font-medium ${active ? 'text-white/90' : ''}`}>{label}</div>
    </button>
  );
}

function TransitionBtn({ to, label, onClick, disabled }: { to: Status; label: string; onClick: () => void; disabled: boolean }) {
  const styles: Record<Status, string> = {
    confirmed: 'bg-teal/10 hover:bg-teal/20 text-teal-dark',
    pending: 'bg-amber-50 hover:bg-amber-100 text-amber-700',
    waitlisted: 'bg-slate-100 hover:bg-slate-200 text-slate-600',
    cancelled: 'bg-coral/10 hover:bg-coral/20 text-coral-dark',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-[10px] font-medium px-2 py-1 rounded-full transition-colors disabled:opacity-40 ${styles[to]}`}
    >
      {label}
    </button>
  );
}

const HISTORY_TONE: Record<RegistrationHistory['event_type'], string> = {
  created: 'text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full',
  status_changed: 'text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full',
  email_sent: 'text-[10px] font-medium text-teal-dark bg-teal/10 px-2 py-0.5 rounded-full',
  email_failed: 'text-[10px] font-medium text-coral-dark bg-coral/10 px-2 py-0.5 rounded-full',
  email_skipped: 'text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full',
};

function formatHistoryEventLabel(entry: RegistrationHistory): string {
  switch (entry.event_type) {
    case 'created': return 'Created';
    case 'status_changed': return 'Status';
    case 'email_sent': return 'Sent';
    case 'email_failed': return 'Failed';
    case 'email_skipped': return 'Skipped';
    default: return entry.event_type;
  }
}

function formatHistoryDetails(entry: RegistrationHistory): string {
  if (entry.event_type === 'status_changed') {
    return `${entry.old_status || '?'} → ${entry.new_status || '?'}`;
  }
  if (entry.event_type === 'email_sent' || entry.event_type === 'email_failed') {
    return entry.email_recipient ? `to ${entry.email_recipient}` : '';
  }
  if (entry.event_type === 'created') {
    return entry.new_status || '';
  }
  return '';
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {label}{required && <span className="text-coral ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls = "mt-1 w-full bg-bg-warm/30 border border-transparent rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-coral/30 outline-none transition";

function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
