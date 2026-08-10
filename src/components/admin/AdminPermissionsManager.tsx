import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { DanceClass, AdminUser } from '../../lib/database.types';
import { useAdminUserManagement } from '../../lib/useAdminPermissions';

interface Props {
  classes: DanceClass[];
}

interface UserWithPermissions extends AdminUser {
  assignedClasses: string[];
}

export default function AdminPermissionsManager({ classes }: Props) {
  const [users, setUsers] = useState<UserWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [promotingUser, setPromotingUser] = useState<string | null>(null);

  const { loadAdmins, grantPermission, revokePermission, setSuperAdmin } = useAdminUserManagement();

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      // List all admin users
      const { data: adminList, error: listError } = await supabase.rpc('list_admin_users');
      if (listError) throw listError;

      // For each user, fetch their class permissions (if not super admin)
      const usersWithPerms: UserWithPermissions[] = [];

      for (const admin of (adminList as AdminUser[]) || []) {
        if (admin.is_super_admin) {
          usersWithPerms.push({ ...admin, assignedClasses: [] });
        } else {
          const { data: perms } = await supabase
            .from('class_admin_permissions')
            .select('dance_class_id')
            .eq('user_id', admin.id);

          usersWithPerms.push({
            ...admin,
            assignedClasses: perms?.map(p => p.dance_class_id) || [],
          });
        }
      }

      setUsers(usersWithPerms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  async function togglePermission(userId: string, classId: string, currentlyHas: boolean) {
    setSaving(prev => ({ ...prev, [`${userId}-${classId}`]: true }));

    try {
      if (currentlyHas) {
        await revokePermission(userId, classId);
      } else {
        await grantPermission(userId, classId);
      }

      // Update local state
      setUsers(prev => prev.map(u => {
        if (u.id !== userId) return u;
        return {
          ...u,
          assignedClasses: currentlyHas
            ? u.assignedClasses.filter(id => id !== classId)
            : [...u.assignedClasses, classId],
        };
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update permission');
    } finally {
      setSaving(prev => ({ ...prev, [`${userId}-${classId}`]: false }));
    }
  }

  async function toggleSuperAdmin(user: UserWithPermissions) {
    if (user.is_super_admin) {
      // Confirm before demoting
      if (!confirm(`Remove super admin privileges from ${user.email}? They will lose access to all classes unless you assign specific ones.`)) {
        return;
      }
    }

    setPromotingUser(user.id);

    try {
      await setSuperAdmin(user.id, !user.is_super_admin);

      // Update local state
      setUsers(prev => prev.map(u => {
        if (u.id !== user.id) return u;
        return {
          ...u,
          is_super_admin: !u.is_super_admin,
          assignedClasses: !u.is_super_admin ? [] : u.assignedClasses,
        };
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setPromotingUser(null);
    }
  }

  // Get current user to prevent self-demotion
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 bg-gray-200 rounded-lg" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-coral/10 text-coral-dark border border-coral/20 rounded-xl p-6">
        <p className="font-semibold mb-2">Error loading permissions</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={loadUsers}
          className="mt-4 px-4 py-2 bg-white rounded-lg text-sm font-medium hover:bg-coral/10 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <p className="eyebrow text-coral mb-1">Access Control</p>
        <h2 className="font-display text-3xl font-bold tracking-tight text-primary">Admin Permissions</h2>
        <p className="text-sm text-text-muted mt-1">
          Manage admin roles and class assignments. Super admins have full access to all classes.
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mb-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-coral" />
          <span className="text-text-muted">Super Admin (full access)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-text-muted">Limited Admin (assigned only)</span>
        </div>
      </div>

      {/* All Admins List */}
      <div className="space-y-3">
        {users.length === 0 ? (
          <div className="bg-primary/[0.02] rounded-xl border border-primary/10 border-dashed p-8 text-center">
            <div className="text-4xl mb-3">👤</div>
            <p className="text-sm text-text-muted">
              No admin users found. Create admin users in Supabase Authentication first.
            </p>
          </div>
        ) : (
          users.map(admin => {
            const isCurrentUser = admin.id === currentUserId;
            const isExpanded = expandedUser === admin.id;

            return (
              <div
                key={admin.id}
                className={`bg-white rounded-xl border shadow-soft overflow-hidden ${
                  admin.is_super_admin ? 'border-coral/30' : 'border-primary/10'
                }`}
              >
                {/* Header - User info */}
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      admin.is_super_admin ? 'bg-coral/10' : 'bg-amber-100'
                    }`}>
                      {admin.is_super_admin ? (
                        <svg className="w-5 h-5 text-coral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-primary">{admin.email}</p>
                      <p className={`text-xs font-medium ${admin.is_super_admin ? 'text-coral' : 'text-amber-600'}`}>
                        {admin.is_super_admin ? 'Super Admin' : `Limited Admin • ${admin.assignedClasses.length} classes assigned`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Super Admin Toggle */}
                    <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                      admin.is_super_admin
                        ? 'bg-coral/10 border-coral/30'
                        : 'bg-bg-warm/50 border-primary/10 hover:border-primary/30'
                    } ${isCurrentUser ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <input
                        type="checkbox"
                        checked={admin.is_super_admin}
                        onChange={() => toggleSuperAdmin(admin)}
                        disabled={isCurrentUser || promotingUser === admin.id}
                        className="w-4 h-4 accent-coral"
                      />
                      <span className={`text-xs font-medium ${admin.is_super_admin ? 'text-coral' : 'text-text-muted'}`}>
                        Super Admin
                      </span>
                      {promotingUser === admin.id && (
                        <span className="animate-pulse">...</span>
                      )}
                    </label>

                    {/* Expand button (only for limited admins) */}
                    {!admin.is_super_admin && (
                      <button
                        onClick={() => setExpandedUser(isExpanded ? null : admin.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors"
                      >
                        {isExpanded ? 'Collapse' : 'Assign Classes'}
                        <svg
                          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}

                    {isCurrentUser && (
                      <span className="text-xs text-text-muted bg-primary/5 px-2 py-1 rounded">You</span>
                    )}
                  </div>
                </div>

                {/* Expanded - Class assignment grid (only for limited admins) */}
                {!admin.is_super_admin && isExpanded && (
                  <div className="border-t border-primary/5 px-4 pb-4">
                    <div className="pt-4 mb-3">
                      <p className="text-sm font-medium text-primary mb-1">Assign Classes</p>
                      <p className="text-xs text-text-muted">Toggle to grant or revoke access to each class</p>
                    </div>

                    {classes.length === 0 ? (
                      <p className="text-sm text-text-muted py-4">No classes available to assign.</p>
                    ) : (
                      <div className="grid gap-2 max-h-96 overflow-y-auto pr-2">
                        {classes
                          .slice()
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .map(dc => {
                            const hasAccess = admin.assignedClasses.includes(dc.id);
                            const isSaving = saving[`${admin.id}-${dc.id}`];

                            return (
                              <label
                                key={dc.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                  hasAccess
                                    ? 'bg-teal/5 border-teal/30 hover:bg-teal/10'
                                    : 'bg-white border-primary/10 hover:border-primary/30'
                                } ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={hasAccess}
                                  onChange={() => togglePermission(admin.id, dc.id, hasAccess)}
                                  disabled={isSaving}
                                  className="w-4 h-4 accent-coral"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className={`font-medium text-sm truncate ${hasAccess ? 'text-teal-dark' : 'text-primary'}`}>
                                    {dc.title_de}
                                  </p>
                                  <p className="text-xs text-text-muted truncate">
                                    {dc.level} {dc.dance && `• ${dc.dance}`}
                                  </p>
                                </div>
                                {dc.is_public ? (
                                  <span className="text-[10px] font-medium text-teal-dark bg-teal/10 px-2 py-0.5 rounded-full">
                                    published
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-text-muted bg-bg-warm px-2 py-0.5 rounded-full">
                                    draft
                                  </span>
                                )}
                              </label>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* How to add new admins */}
      <div className="mt-8 bg-bg-warm/30 rounded-xl p-4 border border-primary/10">
        <p className="font-medium text-primary mb-1 flex items-center gap-2">
          <svg className="w-4 h-4 text-coral" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          How to add new admin users
        </p>
        <ol className="text-sm text-text-muted list-decimal list-inside space-y-1 mt-2">
          <li>Go to your Supabase Dashboard → Authentication → Users</li>
          <li>Click "Add user" and enter the email and password</li>
          <li>The new user can then log in at <code className="bg-white px-1 py-0.5 rounded text-xs">/admin/login</code></li>
          <li>Return here to assign them specific classes or make them Super Admin</li>
        </ol>
      </div>
    </div>
  );
}
