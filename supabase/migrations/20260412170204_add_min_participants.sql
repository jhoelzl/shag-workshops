-- Add minimum participant fields (default 3 leads + 3 follows = 6 total)
ALTER TABLE dance_classes ADD COLUMN min_leads integer NOT NULL DEFAULT 3;
ALTER TABLE dance_classes ADD COLUMN min_follows integer NOT NULL DEFAULT 3;
