-- Add auto_confirm column to dance_classes table
-- When enabled, registrations are automatically confirmed without manual admin action

ALTER TABLE public.dance_classes
ADD COLUMN IF NOT EXISTS auto_confirm boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dance_classes.auto_confirm IS 'When true, registrations are automatically confirmed upon submission';
