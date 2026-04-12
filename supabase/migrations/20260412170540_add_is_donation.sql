-- Add voluntary donation toggle
ALTER TABLE dance_classes ADD COLUMN is_donation boolean NOT NULL DEFAULT false;
