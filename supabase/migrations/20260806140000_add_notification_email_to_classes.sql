-- Add notification_email column to dance_classes table
-- Allows sending organizer notifications to a class-specific email in addition to the default

ALTER TABLE public.dance_classes
ADD COLUMN IF NOT EXISTS notification_email text;

COMMENT ON COLUMN public.dance_classes.notification_email IS 'Optional email address to receive organizer notifications in addition to the default address';
