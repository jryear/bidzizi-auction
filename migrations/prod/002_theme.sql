-- Per-event visual theme for the participant pages.
BEGIN;
ALTER TABLE events ADD COLUMN theme text NOT NULL DEFAULT 'classic' CHECK (theme IN ('classic', 'midnight', 'garden', 'coral'));
COMMIT;
