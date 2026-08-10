-- ============================================
-- Migration: Add set_super_admin function for role management
-- Allows super admins to promote/demote other admins via UI
-- ============================================

-- ============================================
-- Secure function: Set user as super admin (super admin only)
-- ============================================
CREATE OR REPLACE FUNCTION public.set_super_admin(target_user_id uuid, is_super boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can change admin roles';
  END IF;

  IF is_super THEN
    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "super_admin"}'::jsonb
    WHERE id = target_user_id;
  ELSE
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data - 'role'
    WHERE id = target_user_id;
  END IF;
END;
$$;

-- ============================================
-- Grants
-- ============================================
GRANT EXECUTE ON FUNCTION public.set_super_admin(uuid, boolean) TO authenticated;
