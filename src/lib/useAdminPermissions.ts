import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import type { AdminUser } from './database.types';

export type AdminPermission = {
  isSuperAdmin: boolean;
  allowedClassIds: Set<string>;
  classPermissions: Record<string, { read: boolean; write: boolean; delete: boolean }>;
  loading: boolean;
  error: string | null;
};

export type ClassPermission = {
  read: boolean;
  write: boolean;
  delete: boolean;
};

export function useAdminPermissions() {
  const [permissions, setPermissions] = useState<AdminPermission>({
    isSuperAdmin: false,
    allowedClassIds: new Set(),
    classPermissions: {},
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
          classPermissions: {},
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
        // Super admin - fetch all class IDs with full permissions
        const { data: allClasses, error: classesError } = await supabase
          .from('dance_classes')
          .select('id');

        if (classesError) throw classesError;

        const classMap: Record<string, ClassPermission> = {};
        allClasses?.forEach(c => {
          classMap[c.id] = { read: true, write: true, delete: true };
        });

        setPermissions({
          isSuperAdmin: true,
          allowedClassIds: new Set(allClasses?.map(c => c.id) || []),
          classPermissions: classMap,
          loading: false,
          error: null,
        });
      } else {
        // Regular admin - fetch assigned classes with their granular permissions
        const { data: allowedClasses, error: permError } = await supabase
          .from('class_admin_permissions')
          .select('dance_class_id, can_read, can_write, can_delete')
          .eq('user_id', user.id);

        if (permError) throw permError;

        const classMap: Record<string, ClassPermission> = {};
        allowedClasses?.forEach(p => {
          classMap[p.dance_class_id] = {
            read: p.can_read,
            write: p.can_write,
            delete: p.can_delete,
          };
        });

        setPermissions({
          isSuperAdmin: false,
          allowedClassIds: new Set(allowedClasses?.map(p => p.dance_class_id) || []),
          classPermissions: classMap,
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

  const getClassPermission = useCallback((classId: string): ClassPermission => {
    if (permissions.isSuperAdmin) {
      return { read: true, write: true, delete: true };
    }
    return permissions.classPermissions[classId] || { read: false, write: false, delete: false };
  }, [permissions.isSuperAdmin, permissions.classPermissions]);

  const canReadClass = useCallback((classId: string): boolean => {
    return permissions.isSuperAdmin || permissions.classPermissions[classId]?.read || false;
  }, [permissions.isSuperAdmin, permissions.classPermissions]);

  const canWriteClass = useCallback((classId: string): boolean => {
    return permissions.isSuperAdmin || permissions.classPermissions[classId]?.write || false;
  }, [permissions.isSuperAdmin, permissions.classPermissions]);

  const canDeleteClass = useCallback((classId: string): boolean => {
    return permissions.isSuperAdmin || permissions.classPermissions[classId]?.delete || false;
  }, [permissions.isSuperAdmin, permissions.classPermissions]);

  return {
    ...permissions,
    canAccessClass,
    getClassPermission,
    canReadClass,
    canWriteClass,
    canDeleteClass,
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

  const grantPermission = useCallback(async (
    userId: string,
    classId: string,
    permissions: ClassPermission = { read: true, write: true, delete: false }
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('class_admin_permissions')
      .insert({
        user_id: userId,
        dance_class_id: classId,
        created_by: user.id,
        can_read: permissions.read,
        can_write: permissions.write,
        can_delete: permissions.delete,
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

  const updatePermissions = useCallback(async (
    userId: string,
    classId: string,
    permissions: ClassPermission
  ) => {
    const { error } = await supabase.rpc('update_class_permissions', {
      target_user_id: userId,
      class_id: classId,
      read_perm: permissions.read,
      write_perm: permissions.write,
      delete_perm: permissions.delete,
    });

    if (error) throw error;
  }, []);

  const getUserPermissions = useCallback(async (userId: string): Promise<{ classId: string; permissions: ClassPermission }[]> => {
    const { data, error } = await supabase
      .from('class_admin_permissions')
      .select('dance_class_id, can_read, can_write, can_delete')
      .eq('user_id', userId);

    if (error) throw error;
    return data?.map(p => ({
      classId: p.dance_class_id,
      permissions: {
        read: p.can_read,
        write: p.can_write,
        delete: p.can_delete,
      },
    })) || [];
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
    updatePermissions,
    getUserPermissions,
    setSuperAdmin,
  };
}
