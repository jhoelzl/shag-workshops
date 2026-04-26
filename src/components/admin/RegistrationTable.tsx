import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { DanceClass, Registration } from '../../lib/database.types';

interface Props {
  registrations: Registration[];
  classes: DanceClass[];
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

export default function RegistrationTable({ registrations, classes, onUpdate }: Props) {
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(emptyForm);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const classMap = new Map(classes.map((c) => [c.id, c]));

  const filtered = registrations.filter((r) => {
    if (filterClassId !== 'all' && r.dance_class_id !== filterClassId) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false;
    }
    return true;
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

  const hasFilters = filterClassId !== 'all' || filterStatus !== 'all' || searchQuery;

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-6">
        <p className="eyebrow text-coral mb-1">Registrations</p>
        <h2 className="font-display text-3xl font-bold tracking-tight text-primary">All Sign-Ups</h2>
        <p className="text-sm text-text-muted mt-1">Manage participant statuses and track the registration pipeline.</p>
      </div>

      {/* Filters card */}
      <div className="bg-surface/80 backdrop-blur rounded-2xl border border-primary/5 shadow-soft p-5 mb-5">
        <div className="flex flex-wrap gap-3 items-center">
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
          {hasFilters && (
            <button
              onClick={() => { setFilterClassId('all'); setFilterStatus('all'); setSearchQuery(''); }}
              className="text-xs font-semibold text-coral hover:text-coral-dark px-2 py-1 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

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
                <th className="py-3 px-4"></th>
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

                return (
                  <tr key={reg.id} className={`border-t border-primary/5 hover:bg-bg-warm/20 transition-colors align-middle ${isUpdating ? 'opacity-50' : ''}`}>
                    <td className="py-3 px-5">
                      <div className="font-semibold text-primary">{reg.name}</div>
                      <div className="text-xs text-text-muted">{reg.email}</div>
                    </td>
                    <td className="py-3 px-4 text-text-muted text-xs max-w-[180px] truncate">{dc?.title_de ?? '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${reg.role === 'lead' ? 'bg-primary/8 text-primary' : 'bg-coral/10 text-coral-dark'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${reg.role === 'lead' ? 'bg-primary' : 'bg-coral'}`} />
                        {reg.role === 'lead' ? 'Lead' : 'Follow'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-text-muted text-xs">{reg.partner_name || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${meta.bg} ${meta.text} ring-1 ${meta.ring}`}>
                        <span>{meta.icon}</span>
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-text-muted text-xs tabular-nums">
                      {new Date(reg.created_at).toLocaleDateString('de-AT')}
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
                      <button
                        onClick={() => setOpenMenu(isMenuOpen ? null : reg.id)}
                        disabled={isUpdating}
                        className="text-text-muted hover:text-primary hover:bg-primary/5 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                        aria-label="More actions"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>
                      </button>
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
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-text-muted">
                    <div className="text-4xl mb-2 opacity-30">✦</div>
                    <p className="font-semibold">No registrations found</p>
                    <p className="text-xs mt-1">Try adjusting your filters.</p>
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

const inputCls = "mt-1 w-full bg-white/60 border border-primary/10 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-coral/30 focus:border-coral outline-none transition";

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
