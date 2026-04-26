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

export default function RegistrationTable({ registrations, classes, onUpdate }: Props) {
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(emptyForm);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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

  // Count leads/follows for filtered class
  const leadsCount = filtered.filter((r) => r.role === 'lead' && ['pending', 'confirmed'].includes(r.status)).length;
  const followsCount = filtered.filter((r) => r.role === 'follow' && ['pending', 'confirmed'].includes(r.status)).length;
  const selectedClass = filterClassId !== 'all' ? classMap.get(filterClassId) : null;

  async function updateStatus(registrationId: string, newStatus: string) {
    setUpdating((prev) => new Set(prev).add(registrationId));

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

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-warning',
    confirmed: 'bg-green-100 text-success',
    waitlisted: 'bg-gray-100 text-text-muted',
    cancelled: 'bg-red-100 text-error',
  };

  return (
    <div>
      {/* Filters */}
      <div className="bg-surface rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </div>
          <select
            value={filterClassId}
            onChange={(e) => setFilterClassId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary/30 outline-none"
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.title_de}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary/30 outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="pending">⏳ Pending</option>
            <option value="confirmed">✅ Confirmed</option>
            <option value="waitlisted">⏸ Waitlisted</option>
            <option value="cancelled">❌ Cancelled</option>
          </select>
          {(filterClassId !== 'all' || filterStatus !== 'all' || searchQuery) && (
            <button
              onClick={() => { setFilterClassId('all'); setFilterStatus('all'); setSearchQuery(''); }}
              className="text-xs text-text-muted hover:text-text px-2 py-1 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 mt-2">
          <span className="text-xs text-text-muted">{filtered.length} of {registrations.length} registrations</span>
          {selectedClass && (
            <span className="text-xs font-medium">
              Leads: {leadsCount}/{selectedClass.max_leads} · Follows: {followsCount}/{selectedClass.max_follows}
            </span>
          )}
        </div>
      </div>

      {/* Bulk Actions + Add Participant */}
      {filterClassId !== 'all' && (
        <div className="flex flex-wrap gap-2 mb-4">
          {!showAdd ? (
            <button
              onClick={() => { setShowAdd(true); setAddError(null); }}
              className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded transition-colors font-medium"
            >
              + Add Participant
            </button>
          ) : (
            <button
              onClick={() => { setShowAdd(false); setAddError(null); setAddForm(emptyForm); }}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-text px-3 py-1.5 rounded transition-colors font-medium"
            >
              Cancel
            </button>
          )}
          <button onClick={() => bulkUpdateByRole('lead', 'confirmed')} className="text-xs bg-green-100 hover:bg-green-200 text-success px-3 py-1.5 rounded transition-colors">
            Confirm pending Leads
          </button>
          <button onClick={() => bulkUpdateByRole('follow', 'confirmed')} className="text-xs bg-green-100 hover:bg-green-200 text-success px-3 py-1.5 rounded transition-colors">
            Confirm pending Follows
          </button>
        </div>
      )}

      {/* Add Participant Form */}
      {filterClassId !== 'all' && showAdd && (
        <form
          onSubmit={submitAddParticipant}
          className="bg-surface rounded-xl border border-gray-200 shadow-sm p-5 mb-6"
        >
          <h3 className="text-base font-semibold mb-4">Add Participant Manually</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-sm font-medium">Name *</span>
              <input
                type="text"
                required
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Email *</span>
              <input
                type="email"
                required
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Role *</span>
              <select
                value={addForm.role}
                onChange={(e) => setAddForm({ ...addForm, role: e.target.value as 'lead' | 'follow' })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              >
                <option value="lead">Lead</option>
                <option value="follow">Follow</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Partner Name</span>
              <input
                type="text"
                value={addForm.partner_name}
                onChange={(e) => setAddForm({ ...addForm, partner_name: e.target.value })}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-medium">Comment</span>
              <input
                type="text"
                value={addForm.comment}
                onChange={(e) => setAddForm({ ...addForm, comment: e.target.value })}
                placeholder="e.g. Phone registration"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              />
            </label>
          </div>
          {addError && (
            <p className="mt-3 text-sm text-error">{addError}</p>
          )}
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-text-muted">The participant will receive a confirmation email.</span>
            <button
              type="submit"
              disabled={addSubmitting}
              className="bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors"
            >
              {addSubmitting ? 'Saving...' : 'Register & Send Email'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-surface rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 text-left text-xs text-text-muted">
                <th className="py-3 px-4 font-medium">Name</th>
                <th className="py-3 px-4 font-medium">Email</th>
                <th className="py-3 px-4 font-medium">Class</th>
                <th className="py-3 px-4 font-medium">Role</th>
                <th className="py-3 px-4 font-medium">Partner</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((reg) => {
                const dc = classMap.get(reg.dance_class_id);
                const isUpdating = updating.has(reg.id);

                return (
                  <tr key={reg.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="py-2.5 px-4 font-medium">{reg.name}</td>
                    <td className="py-2.5 px-4 text-text-muted">{reg.email}</td>
                    <td className="py-2.5 px-4 text-xs">{dc?.title_de ?? '—'}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-xs font-semibold ${reg.role === 'lead' ? 'text-primary' : 'text-accent-dark'}`}>
                        {reg.role === 'lead' ? 'Lead' : 'Follow'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-text-muted">{reg.partner_name || '—'}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusColors[reg.status]}`}>
                        {reg.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-text-muted text-xs tabular-nums">
                      {new Date(reg.created_at).toLocaleDateString('de-AT')}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex gap-1">
                        {reg.status !== 'confirmed' && (
                          <button
                            onClick={() => updateStatus(reg.id, 'confirmed')}
                            disabled={isUpdating}
                            className="text-[10px] font-medium bg-green-50 hover:bg-green-100 text-green-700 px-2 py-1 rounded-md disabled:opacity-50 transition-colors"
                          >
                            {isUpdating ? '...' : 'Confirm'}
                          </button>
                        )}
                        {reg.status !== 'waitlisted' && (
                          <button
                            onClick={() => updateStatus(reg.id, 'waitlisted')}
                            disabled={isUpdating}
                            className="text-[10px] font-medium bg-gray-50 hover:bg-gray-100 text-gray-600 px-2 py-1 rounded-md disabled:opacity-50 transition-colors"
                          >
                            Waitlist
                          </button>
                        )}
                        {reg.status !== 'cancelled' && (
                          <button
                            onClick={() => updateStatus(reg.id, 'cancelled')}
                            disabled={isUpdating}
                            className="text-[10px] font-medium bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded-md disabled:opacity-50 transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-text-muted">No registrations found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
