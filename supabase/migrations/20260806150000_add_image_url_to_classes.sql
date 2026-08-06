-- Add image_url column to dance_classes table
-- Allows each class to have an optional header background image

ALTER TABLE public.dance_classes
ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.dance_classes.image_url IS 'Optional URL to a header background image for the class card';
