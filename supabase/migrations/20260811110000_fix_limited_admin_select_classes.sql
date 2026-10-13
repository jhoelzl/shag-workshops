-- Fix: unqualified "id" inside the EXISTS subquery resolved to
-- class_admin_permissions.id, so assigned (non-public) classes were never visible.
DROP POLICY IF EXISTS "Admin can view assigned classes" ON public.dance_classes;

CREATE POLICY "Admin can view assigned classes"
  ON public.dance_classes
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.class_admin_permissions cap
      WHERE cap.user_id = auth.uid()
        AND cap.dance_class_id = dance_classes.id
    )
  );
