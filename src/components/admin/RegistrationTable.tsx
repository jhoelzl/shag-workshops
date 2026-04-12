import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { DanceClass, Registration } from '../../lib/database.types';

interface Props {
  registrations: Registration[];
  classes: DanceClass[];
  onUpdate: () => void;
}

export default function RegistrationTable({ registrations, classes, onUpdate }: Props) {
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  const filtered = filterClassId === 'all'
    ? registrations
    : registrations.filter((r) => r.dance_class_id === filterClassId);

  const classMap = new Map(classes.map((c) => [c.id, c]));

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
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div>
          <label className="text-sm font-medium mr-2">Filter by class:</label>
          <select
            value={filterClassId}
            onChange={(e) => setFilterClassId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.title_de}</option>
            ))}
          </select>
        </div>

        {selectedClass && (
          <div className="flex gap-4 text-sm">
            <span className="font-medium">Leads: {leadsCount}/{selectedClass.max_leads}</span>
            <span className="font-medium">Follows: {followsCount}/{selectedClass.max_follows}</span>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {filterClassId !== 'all' && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => bulkUpdateByRole('lead', 'confirmed')} className="text-xs bg-green-100 hover:bg-green-200 text-success px-3 py-1.5 rounded transition-colors">
            Confirm all pending Leads
          </button>
          <button onClick={() => bulkUpdateByRole('follow', 'confirmed')} className="text-xs bg-green-100 hover:bg-green-200 text-success px-3 py-1.5 rounded transition-colors">
            Confirm all pending Follows
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-text-muted">
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">Email</th>
              <th className="py-2 px-3">Class</th>
              <th className="py-2 px-3">Role</th>
              <th className="py-2 px-3">Partner</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Date</th>
              <th className="py-2 px-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((reg) => {
              const dc = classMap.get(reg.dance_class_id);
              const isUpdating = updating.has(reg.id);

              return (
                <tr key={reg.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium">{reg.name}</td>
                  <td className="py-2 px-3">{reg.email}</td>
                  <td className="py-2 px-3 text-xs">{dc?.title_de ?? '—'}</td>
                  <td className="py-2 px-3">
                    <span className={`font-medium ${reg.role === 'lead' ? 'text-primary' : 'text-accent-dark'}`}>
                      {reg.role}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-text-muted">{reg.partner_name || '—'}</td>
                  <td className="py-2 px-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded ${statusColors[reg.status]}`}>
                      {reg.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-text-muted text-xs">
                    {new Date(reg.created_at).toLocaleDateString('de')}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1">
                      {reg.status !== 'confirmed' && (
                        <button
                          onClick={() => updateStatus(reg.id, 'confirmed')}
                          disabled={isUpdating}
                          className="text-xs bg-green-50 hover:bg-green-100 text-success px-2 py-1 rounded disabled:opacity-50"
                        >
                          {isUpdating ? '...' : 'Confirm'}
                        </button>
                      )}
                      {reg.status !== 'waitlisted' && (
                        <button
                          onClick={() => updateStatus(reg.id, 'waitlisted')}
                          disabled={isUpdating}
                          className="text-xs bg-gray-50 hover:bg-gray-100 text-text-muted px-2 py-1 rounded disabled:opacity-50"
                        >
                          Waitlist
                        </button>
                      )}
                      {reg.status !== 'cancelled' && (
                        <button
                          onClick={() => updateStatus(reg.id, 'cancelled')}
                          disabled={isUpdating}
                          className="text-xs bg-red-50 hover:bg-red-100 text-error px-2 py-1 rounded disabled:opacity-50"
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
                <td colSpan={8} className="py-8 text-center text-text-muted">No registrations found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
