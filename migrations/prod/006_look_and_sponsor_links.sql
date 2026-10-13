-- Passthrough 1: one custom accent colour per event (null = the theme's own), and an optional link per sponsor.
BEGIN;
ALTER TABLE events ADD COLUMN accent_color text CHECK (accent_color ~ '^#[0-9A-F]{6}$');
ALTER TABLE sponsors ADD COLUMN url text NOT NULL DEFAULT '' CHECK (length(url) <= 500 AND (url = '' OR url ~ '^https?://[^[:space:]]+$'));
COMMIT;
