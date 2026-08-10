-- ============================================
-- Migration: Add granular permissions (read/write/delete) for limited admins
-- Allows super admins to control exactly what limited admins can do
-- ============================================

-- ============================================
-- Add permission columns to class_admin_permissions
-- ============================================
ALTER TABLE public.class_admin_permissions
  ADD COLUMN IF NOT EXISTS can_read boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_write boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_delete boolean NOT NULL DEFAULT false;

-- ============================================
-- Helper function: Check if user has specific permission for a class
-- ============================================
CREATE OR REPLACE FUNCTION public.has_class_permission(uid uuid, class_id uuid, permission text)
RETURNS boolean AS $$
DECLARE
  has_perm boolean;
BEGIN
  IF public.is_super_admin(uid) THEN
    RETURN true;
  END IF;

  SELECT CASE permission
    WHEN 'read' THEN can_read
    WHEN 'write' THEN can_write
    WHEN 'delete' THEN can_delete
    ELSE false
  END INTO has_perm
  FROM public.class_admin_permissions
  WHERE user_id = uid AND dance_class_id = class_id;

  RETURN COALESCE(has_perm, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Drop and recreate RLS policies for granular permissions
-- ============================================

-- registrations: UPDATE (write permission required)
DROP POLICY IF EXISTS "Admin can update registrations of assigned classes" ON public.registrations;
CREATE POLICY "Admin can update registrations of assigned classes"
  ON public.registrations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.class_admin_permissions
        WHERE user_id = auth.uid() AND dance_class_id = registrations.dance_class_id
      )
      AND public.has_class_permission(auth.uid(), registrations.dance_class_id, 'write')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.class_admin_permissions
        WHERE user_id = auth.uid() AND dance_class_id = registrations.dance_class_id
      )
      AND public.has_class_permission(auth.uid(), registrations.dance_class_id, 'write')
    )
  );

-- registrations: DELETE (delete permission required)
DROP POLICY IF EXISTS "Admin can delete registrations of assigned classes" ON public.registrations;
CREATE POLICY "Admin can delete registrations of assigned classes"
  ON public.registrations
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.class_admin_permissions
        WHERE user_id = auth.uid() AND dance_class_id = registrations.dance_class_id
      )
      AND public.has_class_permission(auth.uid(), registrations.dance_class_id, 'delete')
    )
  );

-- ============================================
-- Secure function: Update class permissions (super admin only)
-- ============================================
CREATE OR REPLACE FUNCTION public.update_class_permissions(
  target_user_id uuid,
  class_id uuid,
  read_perm boolean,
  write_perm boolean,
  delete_perm boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can update permissions';
  END IF;

  UPDATE public.class_admin_permissions
  SET can_read = read_perm,
      can_write = write_perm,
      can_delete = delete_perm
  WHERE user_id = target_user_id AND dance_class_id = class_id;
END;
$$;

-- ============================================
-- Grants
-- ============================================
GRANT EXECUTE ON FUNCTION public.has_class_permission(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_class_permissions(uuid, uuid, boolean, boolean, boolean) TO authenticated;
