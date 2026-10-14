BEGIN;
-- Photo framing: the per-use focal point becomes a frame { x, y, zoom }. x and y keep their stored values; zoom starts at 1
-- (the cover fit every photo uses today). The columns keep their names, and zoom stays optional in the check, so an
-- older deployment still running during a release can keep writing { x, y } safely; readers treat a missing zoom as 1.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_cover_focal_check;
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_image_focal_check;
UPDATE events SET cover_focal = cover_focal || '{"zoom":1}'::jsonb WHERE NOT cover_focal ? 'zoom';
UPDATE items SET image_focal = image_focal || '{"zoom":1}'::jsonb WHERE NOT image_focal ? 'zoom';
ALTER TABLE events ALTER COLUMN cover_focal SET DEFAULT '{"x":0.5,"y":0.5,"zoom":1}';
ALTER TABLE items ALTER COLUMN image_focal SET DEFAULT '{"x":0.5,"y":0.5,"zoom":1}';
ALTER TABLE events ADD CONSTRAINT events_cover_frame_check CHECK (
  jsonb_typeof(cover_focal->'x') = 'number' AND jsonb_typeof(cover_focal->'y') = 'number'
  AND (cover_focal->>'x')::numeric BETWEEN 0 AND 1 AND (cover_focal->>'y')::numeric BETWEEN 0 AND 1
  AND (NOT cover_focal ? 'zoom' OR (jsonb_typeof(cover_focal->'zoom') = 'number' AND (cover_focal->>'zoom')::numeric BETWEEN 1 AND 4)));
ALTER TABLE items ADD CONSTRAINT items_image_frame_check CHECK (
  jsonb_typeof(image_focal->'x') = 'number' AND jsonb_typeof(image_focal->'y') = 'number'
  AND (image_focal->>'x')::numeric BETWEEN 0 AND 1 AND (image_focal->>'y')::numeric BETWEEN 0 AND 1
  AND (NOT image_focal ? 'zoom' OR (jsonb_typeof(image_focal->'zoom') = 'number' AND (image_focal->>'zoom')::numeric BETWEEN 1 AND 4)));
COMMIT;
