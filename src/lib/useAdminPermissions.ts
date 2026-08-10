import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import type { AdminUser } from './database.types';

export type AdminPermission = {
  isSuperAdmin: boolean;
  allowedClassIds: Set<string>;
  loading: boolean;
  error: string | null;
};

export function useAdminPermissions() {
  const [permissions, setPermissions] = useState<AdminPermission>({
    isSuperAdmin: false,
    allowedClassIds: new Set(),
    loading: true,
    error: null,
  });

  const refreshPermissions = useCallback(async () => {
    try {
      setPermissions(prev => ({ ...prev, loading: true, error: null }));

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPermissions({
          isSuperAdmin: false,
          allowedClassIds: new Set(),
          loading: false,
          error: 'Not authenticated',
        });
        return;
      }

      // Check if super admin via the is_super_admin function
      const { data: isSuperAdmin, error: superAdminError } = await supabase
        .rpc('is_super_admin', { uid: user.id });

      if (superAdminError) throw superAdminError;

      if (isSuperAdmin) {
        // Super admin - fetch all class IDs
        const { data: allClasses, error: classesError } = await supabase
          .from('dance_classes')
          .select('id');

        if (classesError) throw classesError;

        setPermissions({
          isSuperAdmin: true,
          allowedClassIds: new Set(allClasses?.map(c => c.id) || []),
          loading: false,
          error: null,
        });
      } else {
        // Regular admin - fetch only assigned class IDs
        const { data: allowedClasses, error: permError } = await supabase
          .from('class_admin_permissions')
          .select('dance_class_id')
          .eq('user_id', user.id);

        if (permError) throw permError;

        setPermissions({
          isSuperAdmin: false,
          allowedClassIds: new Set(allowedClasses?.map(p => p.dance_class_id) || []),
          loading: false,
          error: null,
        });
      }
    } catch (err) {
      setPermissions(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load permissions',
      }));
    }
  }, []);

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  const canAccessClass = useCallback((classId: string): boolean => {
    return permissions.isSuperAdmin || permissions.allowedClassIds.has(classId);
  }, [permissions.isSuperAdmin, permissions.allowedClassIds]);

  return {
    ...permissions,
    canAccessClass,
    refreshPermissions,
  };
}

// Hook for super admin to manage other admins' permissions
export function useAdminUserManagement() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const checkSuperAdmin = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase.rpc('is_super_admin', { uid: user.id });
    return data || false;
  }, []);

  const loadAdmins = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const isSuper = await checkSuperAdmin();
      setIsSuperAdmin(isSuper);

      if (!isSuper) {
        setError('Only super admins can manage permissions');
        setLoading(false);
        return;
      }

      const { data, error: listError } = await supabase.rpc('list_admin_users');

      if (listError) throw listError;

      setAdmins(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  }, [checkSuperAdmin]);

  const grantPermission = useCallback(async (userId: string, classId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('class_admin_permissions')
      .insert({
        user_id: userId,
        dance_class_id: classId,
        created_by: user.id,
      });

    if (error) throw error;
  }, []);

  const revokePermission = useCallback(async (userId: string, classId: string) => {
    const { error } = await supabase
      .from('class_admin_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('dance_class_id', classId);

    if (error) throw error;
  }, []);

  const getUserPermissions = useCallback(async (userId: string): Promise<string[]> => {
    const { data, error } = await supabase
      .from('class_admin_permissions')
      .select('dance_class_id')
      .eq('user_id', userId);

    if (error) throw error;
    return data?.map(p => p.dance_class_id) || [];
  }, []);

  const setSuperAdmin = useCallback(async (userId: string, makeSuper: boolean) => {
    const { error } = await supabase.rpc('set_super_admin', {
      target_user_id: userId,
      is_super: makeSuper,
    });

    if (error) throw error;
  }, []);

  return {
    admins,
    loading,
    error,
    isSuperAdmin,
    loadAdmins,
    grantPermission,
    revokePermission,
    getUserPermissions,
    setSuperAdmin,
  };
}
