-- ============================================
-- Migration: Add Class-Level Admin Permissions (RBAC)
-- Creates junction table for admin-to-class mapping
-- Updates RLS policies for restricted access
-- ============================================

-- ============================================
-- Table: class_admin_permissions
-- Maps admin users to classes they can manage
-- ============================================
CREATE TABLE IF NOT EXISTS public.class_admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dance_class_id uuid NOT NULL REFERENCES public.dance_classes(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, dance_class_id)
);

CREATE INDEX idx_class_admin_permissions_user_id
  ON public.class_admin_permissions (user_id);
CREATE INDEX idx_class_admin_permissions_class_id
  ON public.class_admin_permissions (dance_class_id);

-- Enable RLS on the permissions table
ALTER TABLE public.class_admin_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Helper function: Check if user is super admin
-- Super admin stored in auth.users raw_user_meta_data->>'role'
-- ============================================
CREATE OR REPLACE FUNCTION public.is_super_admin(uid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = uid
    AND raw_user_meta_data->>'role' = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Helper function: Check if user can access specific class
-- ============================================
CREATE OR REPLACE FUNCTION public.can_access_class(uid uuid, class_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN public.is_super_admin(uid) OR EXISTS (
    SELECT 1 FROM public.class_admin_permissions
    WHERE user_id = uid AND dance_class_id = class_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Drop old unrestricted admin policies
-- ============================================
DROP POLICY IF EXISTS "Admin full access to classes" ON public.dance_classes;
DROP POLICY IF EXISTS "Admin full access to sessions" ON public.class_sessions;
DROP POLICY IF EXISTS "Admin can view registrations" ON public.registrations;
DROP POLICY IF EXISTS "Admin can update registrations" ON public.registrations;
DROP POLICY IF EXISTS "Admin can delete registrations" ON public.registrations;

-- ============================================
-- Updated RLS Policies for dance_classes
-- ============================================

-- SELECT: Admin can view their assigned classes OR super admin views all
CREATE POLICY "Admin can view assigned classes"
  ON public.dance_classes
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.class_admin_permissions
      WHERE user_id = auth.uid() AND dance_class_id = id
    )
  );

-- ALL operations: Only super admin can create/update/delete classes
CREATE POLICY "Super admin can manage all classes"
  ON public.dance_classes
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================
-- Updated RLS Policies for class_sessions
-- ============================================

-- SELECT: Admin can view sessions of their assigned classes
CREATE POLICY "Admin can view sessions of assigned classes"
  ON public.class_sessions
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.class_admin_permissions
      WHERE user_id = auth.uid() AND dance_class_id = class_sessions.dance_class_id
    )
  );

-- ALL operations: Only super admin can manage sessions
CREATE POLICY "Super admin can manage all sessions"
  ON public.class_sessions
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================
-- Updated RLS Policies for registrations
-- ============================================

-- SELECT: Admin can view registrations of their assigned classes
CREATE POLICY "Admin can view registrations of assigned classes"
  ON public.registrations
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.class_admin_permissions
      WHERE user_id = auth.uid() AND dance_class_id = registrations.dance_class_id
    )
  );

-- UPDATE: Admin can update registrations of their assigned classes
CREATE POLICY "Admin can update registrations of assigned classes"
  ON public.registrations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.class_admin_permissions
      WHERE user_id = auth.uid() AND dance_class_id = registrations.dance_class_id
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.class_admin_permissions
      WHERE user_id = auth.uid() AND dance_class_id = registrations.dance_class_id
    )
  );

-- DELETE: Admin can delete registrations of their assigned classes
CREATE POLICY "Admin can delete registrations of assigned classes"
  ON public.registrations
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.class_admin_permissions
      WHERE user_id = auth.uid() AND dance_class_id = registrations.dance_class_id
    )
  );

-- ============================================
-- Secure function: List admin users (super admin only)
-- Needed for permission management UI
-- ============================================
CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE(id uuid, email text, is_super_admin boolean)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can list users';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, (u.raw_user_meta_data->>'role' = 'super_admin')
    FROM auth.users u
    ORDER BY u.email;
END;
$$;

-- ============================================
-- Secure function: Get current user's permissions
-- Returns list of class IDs the current user can access
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_class_permissions()
RETURNS TABLE(dance_class_id uuid)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF public.is_super_admin(auth.uid()) THEN
    -- Super admin gets all class IDs
    RETURN QUERY SELECT dc.id FROM public.dance_classes dc;
  ELSE
    -- Regular admin gets only their assigned classes
    RETURN QUERY
      SELECT cap.dance_class_id
      FROM public.class_admin_permissions cap
      WHERE cap.user_id = auth.uid();
  END IF;
END;
$$;

-- ============================================
-- RLS Policies for class_admin_permissions table
-- ============================================

-- Only super admins can insert/update/delete permissions
CREATE POLICY "Super admin can manage permissions"
  ON public.class_admin_permissions
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Users can view their own permissions
CREATE POLICY "Users can view their own permissions"
  ON public.class_admin_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================
-- Grants
-- ============================================
GRANT ALL ON public.class_admin_permissions TO authenticated;
GRANT SELECT ON public.class_admin_permissions TO anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_class(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_class_permissions() TO authenticated;
