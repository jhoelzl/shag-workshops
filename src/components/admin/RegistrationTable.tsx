import { Fragment, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { DanceClass, Registration, RegistrationHistory } from '../../lib/database.types';

interface Props {
  registrations: Registration[];
  history: RegistrationHistory[];
  classes: DanceClass[];
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

const STATUS_META: Record<Status, { label: string; icon: string; bg: string; ring: string; text: string; dot: string; description: string }> = {
  pending: {
    label: 'Pending',
    icon: '⏳',
    bg: 'bg-accent/15',
    ring: 'ring-accent/30',
    text: 'text-accent-dark',
    dot: 'bg-accent',
    description: 'Awaiting confirmation',
  },
  confirmed: {
    label: 'Confirmed',
    icon: '✓',
    bg: 'bg-teal/15',
    ring: 'ring-teal/30',
    text: 'text-teal-dark',
    dot: 'bg-teal',
    description: 'Spot secured',
  },
  waitlisted: {
    label: 'Waitlisted',
    icon: '⏸',
    bg: 'bg-slate-200/70',
    ring: 'ring-slate-400/30',
    text: 'text-slate-600',
    dot: 'bg-slate-400',
    description: 'On the waiting list',
  },
  cancelled: {
    label: 'Cancelled',
    icon: '✕',
    bg: 'bg-coral/15',
    ring: 'ring-coral/30',
    text: 'text-coral-dark',
    dot: 'bg-coral',
    description: 'Registration cancelled',
  },
};

// Allowed transitions from each current status (excluding self).
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

export default function RegistrationTable({ registrations, history, classes, currentUser, onUpdate }: Props) {
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<'all' | 'lead' | 'follow'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(emptyForm);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const classMap = new Map(classes.map((c) => [c.id, c]));
  const historyByRegistration = history.reduce((acc, entry) => {
    if (!acc.has(entry.registration_id)) {
      acc.set(entry.registration_id, []);
    }
    acc.get(entry.registration_id)!.push(entry);
    return acc;
  }, new Map<string, RegistrationHistory[]>());

  const filtered = registrations.filter((r) => {
    if (filterClassId !== 'all' && r.dance_class_id !== filterClassId) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterRole !== 'all' && r.role !== filterRole) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return 0;
  });

  const leadsCount = filtered.filter((r) => r.role === 'lead' && ['pending', 'confirmed'].includes(r.status)).length;
  const followsCount = filtered.filter((r) => r.role === 'follow' && ['pending', 'confirmed'].includes(r.status)).length;
  const selectedClass = filterClassId !== 'all' ? classMap.get(filterClassId) : null;

  const statusCounts: Record<Status, number> = {
    pending: filtered.filter((r) => r.status === 'pending').length,
    confirmed: filtered.filter((r) => r.status === 'confirmed').length,
    waitlisted: filtered.filter((r) => r.status === 'waitlisted').length,
    cancelled: filtered.filter((r) => r.status === 'cancelled').length,
  };

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

    setUpdating((prev) => {
      const next = new Set(prev);
      next.delete(registrationId);
      return next;
    });
    onUpdate();
  }

  async function deleteRegistration(reg: Registration) {
    if (!confirm(`Delete registration for "${reg.name}" (${reg.email})?\n\nThis permanently removes the entry. This cannot be undone.`)) return;
    setUpdating((prev) => new Set(prev).add(reg.id));
    setOpenMenu(null);

    const { error } = await supabase.from('registrations').delete().eq('id', reg.id);
    if (error) alert(`Delete failed: ${error.message}`);

    setUpdating((prev) => {
      const next = new Set(prev);
      next.delete(reg.id);
      return next;
    });
    onUpdate();
  }

  async function submitAddParticipant(e: React.FormEvent) {
    e.preventDefault();
    if (filterClassId === 'all') return;
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
          dance_class_id: filterClassId,
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
      if (!res.ok) {
        setAddError(json?.error || 'Registration failed');
        return;
      }
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
    for (const reg of pending) {
      await updateStatus(reg.id, newStatus);
    }
  }

  function exportFilteredAsCsv() {
    if (filtered.length === 0) return;

    const headers = ['Name', 'Email', 'Role', 'Partner', 'Status', 'Class', 'Comment', 'Date'];
    const rows = filtered.map((reg) => {
      const danceClass = classMap.get(reg.dance_class_id);
      return [
        reg.name,
        reg.email,
        reg.role,
        reg.partner_name || '',
        reg.status,
        danceClass?.title_de || '',
        reg.comment || '',
        new Date(reg.created_at).toISOString(),
      ];
    });

    const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
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

  const hasFilters = filterClassId !== 'all' || filterStatus !== 'all' || filterRole !== 'all' || sortBy !== 'newest' || searchQuery;

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-6">
        <p className="eyebrow text-coral mb-1">Registrations</p>
        <h2 className="font-display text-3xl font-bold tracking-tight text-primary">All Sign-Ups</h2>
        <p className="text-sm text-text-muted mt-1">Manage participant statuses and track the registration pipeline.</p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <RegStatCard
          count={registrations.filter(r => r.status === 'pending').length}
          label="Pending"
          icon="⏳"
          color="amber"
          onClick={() => { setFilterStatus('pending'); setFilterClassId('all'); }}
          isActive={filterStatus === 'pending' && filterClassId === 'all'}
        />
        <RegStatCard
          count={registrations.filter(r => r.status === 'confirmed').length}
          label="Confirmed"
          icon="✓"
          color="teal"
          onClick={() => { setFilterStatus('confirmed'); setFilterClassId('all'); }}
          isActive={filterStatus === 'confirmed' && filterClassId === 'all'}
        />
        <RegStatCard
          count={registrations.filter(r => r.status === 'waitlisted').length}
          label="Waitlisted"
          icon="⏸"
          color="slate"
          onClick={() => { setFilterStatus('waitlisted'); setFilterClassId('all'); }}
          isActive={filterStatus === 'waitlisted' && filterClassId === 'all'}
        />
        <RegStatCard
          count={registrations.length}
          label="Total"
          icon="👥"
          color="primary"
          onClick={() => { setFilterStatus('all'); setFilterClassId('all'); }}
          isActive={filterStatus === 'all' && filterClassId === 'all'}
        />
      </div>

      {/* Filters card */}
      <div className="bg-surface/80 backdrop-blur rounded-2xl border border-primary/5 shadow-soft p-5 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 bg-white/60 border border-primary/10 rounded-xl text-sm focus:ring-2 focus:ring-coral/30 focus:border-coral outline-none transition"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              className="border border-primary/10 rounded-xl px-3 py-2.5 text-sm bg-white/60 focus:ring-2 focus:ring-coral/30 outline-none transition cursor-pointer"
            >
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.title_de}</option>
              ))}
            </select>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${showFilters ? 'bg-coral text-white' : 'bg-white/60 border border-primary/10 text-text-muted hover:text-primary'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
              More
              {(filterRole !== 'all' || sortBy !== 'newest') && <span className="flex h-2 w-2 rounded-full bg-accent" />}
            </button>
            {hasFilters && (
              <button
                onClick={() => { setFilterClassId('all'); setFilterStatus('all'); setFilterRole('all'); setSortBy('newest'); setSearchQuery(''); }}
                className="text-xs font-semibold text-coral hover:text-coral-dark px-3 py-2 rounded-lg hover:bg-coral/5 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-primary/5 flex flex-wrap gap-4 items-center animate-fade-up">
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted font-medium">Role:</span>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value as 'all' | 'lead' | 'follow')}
                className="border border-primary/10 rounded-xl px-3 py-2 text-sm bg-white/60 focus:ring-2 focus:ring-coral/30 outline-none transition cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="lead">Lead</option>
                <option value="follow">Follow</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted font-medium">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}
                className="border border-primary/10 rounded-xl px-3 py-2 text-sm bg-white/60 focus:ring-2 focus:ring-coral/30 outline-none transition cursor-pointer"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>
          </div>
        )}

        {/* Status filter chips */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            onClick={() => setFilterStatus('all')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${filterStatus === 'all' ? 'bg-primary text-white shadow-soft' : 'bg-primary/5 text-primary/70 hover:bg-primary/10'}`}
          >
            All <span className="opacity-70 ml-1">{filtered.length}</span>
          </button>
          {(['pending', 'confirmed', 'waitlisted', 'cancelled'] as Status[]).map((s) => {
            const meta = STATUS_META[s];
            const active = filterStatus === s;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all inline-flex items-center gap-1.5 ${active ? `${meta.bg} ${meta.text} ring-1 ${meta.ring}` : 'bg-primary/5 text-primary/70 hover:bg-primary/10'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label} <span className="opacity-70">{statusCounts[s]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-primary/5 text-xs text-text-muted">
          <span>{filtered.length} of {registrations.length} registrations</span>
          {selectedClass && (
            <span className="font-semibold text-primary">
              Leads: <span className="tabular-nums">{leadsCount}/{selectedClass.max_leads}</span> · Follows: <span className="tabular-nums">{followsCount}/{selectedClass.max_follows}</span>
            </span>
          )}
        </div>
      </div>

      {/* Bulk Actions + Add */}
      {filterClassId !== 'all' && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={exportFilteredAsCsv}
            disabled={filtered.length === 0}
            className="text-xs font-semibold bg-primary/5 hover:bg-primary/10 text-primary px-4 py-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export as CSV
          </button>
          {!showAdd ? (
            <button
              onClick={() => { setShowAdd(true); setAddError(null); }}
              className="text-xs font-semibold bg-gradient-to-br from-coral to-coral-dark hover:brightness-105 text-white px-4 py-2 rounded-full shadow-[0_4px_14px_-4px_rgba(231,111,81,0.5)] transition-all"
            >
              + Add Participant
            </button>
          ) : (
            <button
              onClick={() => { setShowAdd(false); setAddError(null); setAddForm(emptyForm); }}
              className="text-xs font-semibold bg-primary/5 hover:bg-primary/10 text-primary px-4 py-2 rounded-full transition-colors"
            >
              Cancel
            </button>
          )}
          {statusCounts.pending > 0 && (
            <>
              <button onClick={() => bulkUpdateByRole('lead', 'confirmed')} className="text-xs font-semibold bg-teal/10 hover:bg-teal/20 text-teal-dark px-4 py-2 rounded-full transition-colors">
                ✓ Confirm pending Leads
              </button>
              <button onClick={() => bulkUpdateByRole('follow', 'confirmed')} className="text-xs font-semibold bg-teal/10 hover:bg-teal/20 text-teal-dark px-4 py-2 rounded-full transition-colors">
                ✓ Confirm pending Follows
              </button>
            </>
          )}
        </div>
      )}

      {/* Add form */}
      {filterClassId !== 'all' && showAdd && (
        <form
          onSubmit={submitAddParticipant}
          className="bg-surface/80 backdrop-blur rounded-2xl border border-coral/20 shadow-soft p-6 mb-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-full bg-coral/15 text-coral inline-flex items-center justify-center">＋</span>
            <h3 className="font-display text-lg font-bold text-primary">Add Participant Manually</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <Field label="Partner Name">
              <input type="text" value={addForm.partner_name} onChange={(e) => setAddForm({ ...addForm, partner_name: e.target.value })} className={inputCls} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Comment">
                <input type="text" value={addForm.comment} onChange={(e) => setAddForm({ ...addForm, comment: e.target.value })} placeholder="e.g. Phone registration" className={inputCls} />
              </Field>
            </div>
          </div>
          {addError && <p className="mt-3 text-sm text-coral-dark">{addError}</p>}
          <div className="mt-5 pt-4 border-t border-primary/5 flex items-center justify-between">
            <span className="text-xs text-text-muted">Participant will receive a confirmation email.</span>
            <button
              type="submit"
              disabled={addSubmitting}
              className="bg-gradient-to-br from-coral to-coral-dark hover:brightness-105 text-white text-sm font-semibold px-5 py-2.5 rounded-full disabled:opacity-50 transition-all shadow-[0_4px_14px_-4px_rgba(231,111,81,0.5)]"
            >
              {addSubmitting ? 'Saving...' : 'Register & Send Email'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-surface/80 backdrop-blur rounded-2xl border border-primary/5 shadow-soft overflow-visible">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-warm/30 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <th className="py-3 px-5">Participant</th>
                <th className="py-3 px-4">Class</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Partner</th>
                <th className="py-3 px-4">Current Status</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Change Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((reg, index) => {
                const dc = classMap.get(reg.dance_class_id);
                const isUpdating = updating.has(reg.id);
                const status = reg.status as Status;
                const meta = STATUS_META[status] || STATUS_META.pending;
                const transitions = TRANSITIONS[status] || [];
                const isMenuOpen = openMenu === reg.id;
                const openUpward = index >= filtered.length - 2;
                const entries = historyByRegistration.get(reg.id) || [];
                const isHistoryOpen = openHistory === reg.id;

                return (
                  <Fragment key={reg.id}>
                    <tr className={`border-t border-primary/5 hover:bg-bg-warm/20 transition-colors align-middle ${isUpdating ? 'opacity-50' : ''}`}>
                      <td className="py-3 px-5">
                        <div className="font-semibold text-primary">{reg.name}</div>
                        <div className="text-xs text-text-muted">{reg.email}</div>
                        {reg.comment && (
                          <div className="text-[11px] text-text-muted italic mt-0.5 max-w-[200px] truncate" title={reg.comment}>
                            💬 {reg.comment}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-text-muted text-xs max-w-[180px] truncate">{dc?.title_de ?? '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${reg.role === 'lead' ? 'bg-primary/8 text-primary' : 'bg-coral/10 text-coral-dark'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${reg.role === 'lead' ? 'bg-primary' : 'bg-coral'}`} />
                          {reg.role === 'lead' ? 'Lead' : 'Follow'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-text-muted text-xs">{reg.partner_name || '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${meta.bg} ${meta.text} ring-1 ${meta.ring}`}>
                          <span>{meta.icon}</span>
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-text-muted text-xs tabular-nums">
                        {new Date(reg.created_at).toLocaleDateString('en-US')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {transitions.map((t) => (
                            <TransitionButton
                              key={t.to}
                              from={status}
                              to={t.to}
                              label={t.label}
                              disabled={isUpdating}
                              onClick={() => updateStatus(reg.id, t.to)}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 relative">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setOpenHistory(isHistoryOpen ? null : reg.id)}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-primary/10 bg-primary/5 hover:bg-primary/10 text-primary/80 transition-colors"
                            disabled={isUpdating}
                          >
                            History ({entries.length})
                          </button>
                          <button
                            onClick={() => setOpenMenu(isMenuOpen ? null : reg.id)}
                            disabled={isUpdating}
                            className="text-text-muted hover:text-primary hover:bg-primary/5 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                            aria-label="More actions"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>
                          </button>
                        </div>
                        {isMenuOpen && (
                          <>
                            <button
                              type="button"
                              className="fixed inset-0 z-10 cursor-default"
                              onClick={() => setOpenMenu(null)}
                              aria-label="Close menu"
                            />
                            <div className={`absolute right-3 z-20 bg-white rounded-xl shadow-lift border border-primary/10 py-1 min-w-[180px] ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                              <button
                                onClick={() => deleteRegistration(reg)}
                                className="w-full text-left text-xs font-semibold text-coral-dark hover:bg-coral/10 px-4 py-2 transition-colors flex items-center gap-2"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>
                                Delete permanently
                              </button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                    {isHistoryOpen && (
                      <tr className="bg-bg-warm/20 border-t border-primary/5">
                        <td colSpan={8} className="px-5 py-4">
                          {entries.length === 0 ? (
                            <p className="text-xs text-text-muted">No history entries yet for this registration.</p>
                          ) : (
                            <div className="space-y-2">
                              {entries.slice(0, 12).map((entry) => {
                                const tone = HISTORY_EVENT_TONE[entry.event_type];
                                return (
                                  <div key={entry.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 bg-white/70 border border-primary/10 rounded-xl px-3 py-2.5">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${tone}`}>{formatHistoryEventLabel(entry)}</span>
                                        <span className="text-[11px] text-text-muted">{new Date(entry.created_at).toLocaleString('en-US')}</span>
                                      </div>
                                      <p className="text-xs text-primary mt-1">{formatHistoryDetails(entry)}</p>
                                      {(entry.event_type === 'email_sent' || entry.event_type === 'email_failed') && (() => { const id = getMetadataRecord(entry)?.id as string | undefined; return id ? <a href={`https://resend.com/emails/${id}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-teal-dark underline mt-0.5 inline-block">Resend Log →</a> : null; })()}
                                      {entry.note && <p className="text-[11px] text-text-muted mt-0.5">{entry.note}</p>}
                                    </div>
                                    {getHistoryActorLabel(entry, currentUser) && (
                                      <span className="text-[11px] text-text-muted">by {getHistoryActorLabel(entry, currentUser)}</span>
                                    )}
                                  </div>
                                );
                              })}
                              {entries.length > 12 && (
                                <p className="text-[11px] text-text-muted">Showing latest 12 of {entries.length} entries.</p>
                              )}
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
                  <td colSpan={8} className="py-16 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/5 mb-4">
                      <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <p className="font-semibold text-text-muted mb-1">
                      {searchQuery ? 'No matching registrations' : filterClassId !== 'all' ? 'No registrations for this class' : 'No registrations yet'}
                    </p>
                    <p className="text-xs text-text-muted/70 max-w-sm mx-auto mb-4">
                      {searchQuery
                        ? `No registrations match "${searchQuery}". Try a different search term or adjust your filters.`
                        : filterClassId !== 'all'
                          ? 'This class has no registrations yet. Share the workshop link to get sign-ups.'
                          : 'Registrations will appear here when participants sign up for workshops.'
                      }
                    </p>
                    {hasFilters && (
                      <button
                        onClick={() => { setFilterClassId('all'); setFilterStatus('all'); setFilterRole('all'); setSortBy('newest'); setSearchQuery(''); }}
                        className="text-sm font-medium text-coral hover:text-coral-dark px-4 py-2 rounded-lg hover:bg-coral/5 transition-colors"
                      >
                        Clear all filters
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status legend */}
      <div className="mt-5 bg-surface/60 backdrop-blur rounded-2xl border border-primary/5 p-4">
        <p className="eyebrow text-text-muted mb-2">Status Legend</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['pending', 'confirmed', 'waitlisted', 'cancelled'] as Status[]).map((s) => {
            const meta = STATUS_META[s];
            return (
              <div key={s} className="flex items-start gap-2">
                <span className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full ${meta.bg} ${meta.text} text-[10px] font-bold`}>
                  {meta.icon}
                </span>
                <div>
                  <div className={`text-xs font-bold uppercase tracking-wider ${meta.text}`}>{meta.label}</div>
                  <div className="text-[11px] text-text-muted">{meta.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Quick stat card for registrations
function RegStatCard({ count, label, icon, color, onClick, isActive }: {
  count: number;
  label: string;
  icon: string;
  color: 'amber' | 'teal' | 'slate' | 'primary';
  onClick: () => void;
  isActive: boolean;
}) {
  const colors = {
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', ring: 'ring-amber-300' },
    teal: { bg: 'bg-teal/10', text: 'text-teal-dark', border: 'border-teal/20', ring: 'ring-teal/30' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', ring: 'ring-slate-300' },
    primary: { bg: 'bg-primary/5', text: 'text-primary', border: 'border-primary/15', ring: 'ring-primary/25' },
  };
  const c = colors[color];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${c.bg} ${c.border} ${isActive ? `ring-2 ${c.ring} shadow-md` : 'hover:shadow-soft hover:scale-[1.02]'}`}
    >
      <span className={`text-lg ${c.text}`}>{icon}</span>
      <div>
        <div className={`text-2xl font-display font-bold ${c.text}`}>{count}</div>
        <div className={`text-xs font-medium ${c.text} opacity-80`}>{label}</div>
      </div>
    </button>
  );
}

const inputCls = "mt-1 w-full bg-white/60 border border-primary/10 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-coral/30 focus:border-coral outline-none transition";

const HISTORY_EVENT_TONE: Record<RegistrationHistory['event_type'], string> = {
  created: 'bg-primary/10 text-primary',
  status_changed: 'bg-accent/20 text-accent-dark',
  email_sent: 'bg-teal/15 text-teal-dark',
  email_failed: 'bg-coral/15 text-coral-dark',
  email_skipped: 'bg-slate-200 text-slate-600',
};

function formatHistoryEventLabel(entry: RegistrationHistory): string {
  switch (entry.event_type) {
    case 'created':
      return 'Created';
    case 'status_changed':
      return 'Status Changed';
    case 'email_sent':
      return 'Email Sent';
    case 'email_failed':
      return 'Email Failed';
    case 'email_skipped':
      return 'Email Skipped';
    default:
      return entry.event_type;
  }
}

function formatHistoryDetails(entry: RegistrationHistory): string {
  if (entry.event_type === 'status_changed') {
    const oldStatus = entry.old_status || 'unknown';
    const newStatus = entry.new_status || 'unknown';
    return `Status: ${oldStatus} -> ${newStatus}`;
  }

  if (entry.event_type === 'created') {
    return `Registration created with status ${entry.new_status || 'unknown'} (${entry.triggered_by.replaceAll('_', ' ')})`;
  }

  if (entry.event_type === 'email_sent' || entry.event_type === 'email_failed' || entry.event_type === 'email_skipped') {
    const emailType = entry.email_type || 'email';
    const recipient = entry.email_recipient ? ` to ${entry.email_recipient}` : '';
    return `${emailType.replaceAll('_', ' ')}${recipient}`;
  }

  return entry.event_type;
}

function getUserDisplayLabel(user: any): string | null {
  if (!user) return null;
  const fullName = [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ').trim();
  return user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.display_name || fullName || user.email || null;
}

function getMetadataRecord(entry: RegistrationHistory): Record<string, unknown> | null {
  if (!entry.metadata || typeof entry.metadata !== 'object' || Array.isArray(entry.metadata)) {
    return null;
  }
  return entry.metadata as Record<string, unknown>;
}

function getHistoryActorLabel(entry: RegistrationHistory, currentUser: any): string | null {
  const metadata = getMetadataRecord(entry);
  const actorName = typeof metadata?.actor_name === 'string' ? metadata.actor_name : null;
  const actorEmail = typeof metadata?.actor_email === 'string' ? metadata.actor_email : null;
  if (actorName) return actorName;
  if (entry.actor_user_id && currentUser?.id === entry.actor_user_id) {
    return getUserDisplayLabel(currentUser);
  }
  if (actorEmail) return actorEmail;
  if (entry.actor_user_id) return `${entry.actor_user_id.slice(0, 8)}...`;
  return null;
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

function TransitionButton({ from, to, label, onClick, disabled }: { from: Status; to: Status; label: string; onClick: () => void; disabled: boolean }) {
  const target = STATUS_META[to];
  const styles: Record<Status, string> = {
    confirmed: 'bg-teal/10 hover:bg-teal/20 text-teal-dark border-teal/20',
    pending: 'bg-accent/10 hover:bg-accent/20 text-accent-dark border-accent/20',
    waitlisted: 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200',
    cancelled: 'bg-coral/10 hover:bg-coral/20 text-coral-dark border-coral/20',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={`Move from ${STATUS_META[from].label} to ${target.label}`}
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all disabled:opacity-50 inline-flex items-center gap-1 ${styles[to]}`}
    >
      <span aria-hidden>→</span>
      <span>{target.icon}</span>
      {label}
    </button>
  );
}

function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
