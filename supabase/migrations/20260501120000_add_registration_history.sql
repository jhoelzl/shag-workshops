CREATE TABLE IF NOT EXISTS public.registration_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  dance_class_id uuid NOT NULL REFERENCES public.dance_classes(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_changed', 'email_sent', 'email_failed', 'email_skipped')),
  old_status text CHECK (old_status IS NULL OR old_status IN ('pending', 'confirmed', 'waitlisted', 'cancelled')),
  new_status text CHECK (new_status IS NULL OR new_status IN ('pending', 'confirmed', 'waitlisted', 'cancelled')),
  triggered_by text NOT NULL CHECK (triggered_by IN ('public_registration', 'admin_registration', 'admin_status_change', 'system')),
  actor_user_id uuid,
  email_type text,
  email_recipient text,
  email_subject text,
  note text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registration_history_registration_id
  ON public.registration_history (registration_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_history_class_id
  ON public.registration_history (dance_class_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_history_event_type
  ON public.registration_history (event_type);

ALTER TABLE public.registration_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view registration history"
  ON public.registration_history
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.registration_history TO authenticated;
