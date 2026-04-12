-- Initial schema for Collegiate Shag Workshops
-- Run with: supabase db push (or execute manually in Supabase SQL Editor)

-- ============================================
-- Table: dance_classes
-- ============================================
CREATE TABLE IF NOT EXISTS public.dance_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_de text NOT NULL,
  title_en text NOT NULL,
  description_de text,
  description_en text,
  level text,
  location text,
  location_url text,
  max_leads smallint NOT NULL CHECK (max_leads > 0),
  max_follows smallint NOT NULL CHECK (max_follows > 0),
  price_eur numeric(6,2),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.dance_classes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- Table: class_sessions (individual dates per class)
-- ============================================
CREATE TABLE IF NOT EXISTS public.class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dance_class_id uuid NOT NULL REFERENCES public.dance_classes(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_class_sessions_class_id
  ON public.class_sessions (dance_class_id);

CREATE INDEX idx_class_sessions_date
  ON public.class_sessions (session_date);

-- ============================================
-- Table: registrations
-- ============================================
CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dance_class_id uuid NOT NULL REFERENCES public.dance_classes(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('lead', 'follow')),
  partner_name text,
  comment text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'waitlisted', 'cancelled')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_registrations_class_email
  ON public.registrations (dance_class_id, email);

CREATE INDEX idx_registrations_class_id
  ON public.registrations (dance_class_id);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE public.dance_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- dance_classes: public can view classes marked as public
CREATE POLICY "Public can view classes"
  ON public.dance_classes
  FOR SELECT
  USING (is_public = true);

-- dance_classes: authenticated users (admin) can do everything
CREATE POLICY "Admin full access to classes"
  ON public.dance_classes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- class_sessions: public can view sessions of public classes
CREATE POLICY "Public can view sessions"
  ON public.class_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dance_classes
      WHERE id = dance_class_id AND is_public = true
    )
  );

-- class_sessions: admin can manage sessions
CREATE POLICY "Admin full access to sessions"
  ON public.class_sessions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- registrations: admin can read all
CREATE POLICY "Admin can view registrations"
  ON public.registrations
  FOR SELECT
  TO authenticated
  USING (true);

-- registrations: admin can update (confirm/cancel)
CREATE POLICY "Admin can update registrations"
  ON public.registrations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- registrations: admin can delete
CREATE POLICY "Admin can delete registrations"
  ON public.registrations
  FOR DELETE
  TO authenticated
  USING (true);

-- Service role (edge functions) can insert registrations
-- Note: Edge functions use the service_role key which bypasses RLS

-- ============================================
-- View: registration counts per class
-- ============================================
CREATE OR REPLACE VIEW public.class_registration_counts AS
SELECT
  dc.id AS dance_class_id,
  COALESCE(SUM(CASE WHEN r.role = 'lead' AND r.status IN ('pending', 'confirmed') THEN 1 ELSE 0 END), 0) AS lead_count,
  COALESCE(SUM(CASE WHEN r.role = 'follow' AND r.status IN ('pending', 'confirmed') THEN 1 ELSE 0 END), 0) AS follow_count,
  dc.max_leads,
  dc.max_follows,
  dc.max_leads - COALESCE(SUM(CASE WHEN r.role = 'lead' AND r.status IN ('pending', 'confirmed') THEN 1 ELSE 0 END), 0) AS leads_available,
  dc.max_follows - COALESCE(SUM(CASE WHEN r.role = 'follow' AND r.status IN ('pending', 'confirmed') THEN 1 ELSE 0 END), 0) AS follows_available
FROM public.dance_classes dc
LEFT JOIN public.registrations r ON r.dance_class_id = dc.id
GROUP BY dc.id, dc.max_leads, dc.max_follows;

-- ============================================
-- Grants
-- ============================================
GRANT SELECT ON public.class_sessions TO anon;
GRANT ALL ON public.class_sessions TO authenticated;
GRANT SELECT ON public.class_registration_counts TO anon;
GRANT SELECT ON public.class_registration_counts TO authenticated;
