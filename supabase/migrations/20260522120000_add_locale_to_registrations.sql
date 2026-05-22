-- Add locale to registrations so the language chosen during signup can be
-- reused by later admin-triggered emails (confirmation, waitlist, cancellation).
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'de'
    CHECK (locale IN ('de', 'en'));
