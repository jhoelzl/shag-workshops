-- Add preview_text_de / preview_text_en to dance_classes
-- When set, the frontend shows this text instead of the sessions list,
-- allowing a workshop to be publicly visible before dates are finalised.

ALTER TABLE public.dance_classes
  ADD COLUMN IF NOT EXISTS preview_text_de text,
  ADD COLUMN IF NOT EXISTS preview_text_en text,
  ADD COLUMN IF NOT EXISTS is_preview boolean NOT NULL DEFAULT false;
