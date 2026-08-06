-- Add customizable donation text fields to dance_classes table
-- These fields allow per-class customization of the donation display text

ALTER TABLE dance_classes
ADD COLUMN IF NOT EXISTS donation_text_de TEXT,
ADD COLUMN IF NOT EXISTS donation_text_en TEXT,
ADD COLUMN IF NOT EXISTS donation_subtext_de TEXT,
ADD COLUMN IF NOT EXISTS donation_subtext_en TEXT;

COMMENT ON COLUMN dance_classes.donation_text_de IS 'Main donation text in German (default: Freiwillige Spende)';
COMMENT ON COLUMN dance_classes.donation_text_en IS 'Main donation text in English (default: Voluntary donation)';
COMMENT ON COLUMN dance_classes.donation_subtext_de IS 'Secondary donation text in German (default: Zur Deckung der Saalmiete)';
COMMENT ON COLUMN dance_classes.donation_subtext_en IS 'Secondary donation text in English (default: To help cover the studio rental)';
