-- Allow limited admins (with a write permission) to create draft classes
-- (e.g. by copying an existing class) and to edit classes/sessions they may write.

-- Creating: only drafts, and only for admins that hold a write permission somewhere
CREATE POLICY "Limited admin can create draft classes"
  ON public.dance_classes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_public = false
    AND EXISTS (
      SELECT 1 FROM public.class_admin_permissions
      WHERE user_id = auth.uid() AND can_write = true
    )
  );

CREATE POLICY "Limited admin can update writable classes"
  ON public.dance_classes
  FOR UPDATE
  TO authenticated
  USING (public.has_class_permission(auth.uid(), id, 'write'))
  WITH CHECK (public.has_class_permission(auth.uid(), id, 'write'));

-- Creator automatically gets full permissions on the class they created
CREATE OR REPLACE FUNCTION public.grant_creator_class_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    INSERT INTO public.class_admin_permissions
      (user_id, dance_class_id, created_by, can_read, can_write, can_delete)
    VALUES (auth.uid(), NEW.id, auth.uid(), true, true, true)
    ON CONFLICT (user_id, dance_class_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_creator_class_permission ON public.dance_classes;
CREATE TRIGGER trg_grant_creator_class_permission
  AFTER INSERT ON public.dance_classes
  FOR EACH ROW EXECUTE FUNCTION public.grant_creator_class_permission();

-- Sessions follow the class write permission
CREATE POLICY "Limited admin can insert sessions"
  ON public.class_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_class_permission(auth.uid(), dance_class_id, 'write'));

CREATE POLICY "Limited admin can update sessions"
  ON public.class_sessions
  FOR UPDATE
  TO authenticated
  USING (public.has_class_permission(auth.uid(), dance_class_id, 'write'))
  WITH CHECK (public.has_class_permission(auth.uid(), dance_class_id, 'write'));

CREATE POLICY "Limited admin can delete sessions"
  ON public.class_sessions
  FOR DELETE
  TO authenticated
  USING (public.has_class_permission(auth.uid(), dance_class_id, 'write'));
