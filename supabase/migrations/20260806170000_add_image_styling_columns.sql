-- Add image_overlay_alpha and headline_color columns to dance_classes table
-- Allows customization of image overlay transparency and headline text color

ALTER TABLE public.dance_classes
ADD COLUMN IF NOT EXISTS image_overlay_alpha integer DEFAULT 40 CHECK (image_overlay_alpha >= 0 AND image_overlay_alpha <= 100);

ALTER TABLE public.dance_classes
ADD COLUMN IF NOT EXISTS headline_color text DEFAULT 'white' CHECK (headline_color IN ('white', 'black'));

COMMENT ON COLUMN public.dance_classes.image_overlay_alpha IS 'Overlay darkness on class header image (0-100, default 40)';
COMMENT ON COLUMN public.dance_classes.headline_color IS 'Headline text color on class header image (white or black)';
