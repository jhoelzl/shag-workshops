-- Per-admin permission: may create new classes (manual create + copy)

CREATE TABLE IF NOT EXISTS public.admin_create_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  can_create_classes boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_create_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own create permission"
  ON public.admin_create_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Super admin can manage create permissions"
  ON public.admin_create_permissions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

GRANT SELECT ON public.admin_create_permissions TO authenticated;

CREATE OR REPLACE FUNCTION public.can_create_classes(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(uid)
    OR EXISTS (
      SELECT 1 FROM public.admin_create_permissions
      WHERE user_id = uid AND can_create_classes = true
    );
$$;
GRANT EXECUTE ON FUNCTION public.can_create_classes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_can_create_classes(target_user_id uuid, allowed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can change this permission';
  END IF;
  INSERT INTO public.admin_create_permissions (user_id, can_create_classes, updated_at)
  VALUES (target_user_id, allowed, now())
  ON CONFLICT (user_id) DO UPDATE
    SET can_create_classes = EXCLUDED.can_create_classes, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_can_create_classes(uuid, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.list_admin_users();
CREATE FUNCTION public.list_admin_users()
RETURNS TABLE(id uuid, email text, is_super_admin boolean, can_create_classes boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can list users';
  END IF;
  RETURN QUERY
    SELECT u.id,
           u.email::text,
           COALESCE((u.raw_user_meta_data->>'role') = 'super_admin', false),
           COALESCE(p.can_create_classes, false)
    FROM auth.users u
    LEFT JOIN public.admin_create_permissions p ON p.user_id = u.id
    ORDER BY u.email;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_admin_users() TO authenticated;

-- Replace the insert policy
DROP POLICY IF EXISTS "Limited admin can create draft classes" ON public.dance_classes;
CREATE POLICY "Limited admin can create draft classes"
  ON public.dance_classes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_public = false
    AND public.can_create_classes(auth.uid())
  );

-- Backfill: existing admins with write access keep their current ability
INSERT INTO public.admin_create_permissions (user_id, can_create_classes)
SELECT DISTINCT user_id, true
FROM public.class_admin_permissions
WHERE can_write = true
ON CONFLICT (user_id) DO NOTHING;
