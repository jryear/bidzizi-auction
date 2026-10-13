BEGIN;
-- Per-reference positioning lets duplicated events share immutable assets independently.
ALTER TABLE events ADD COLUMN cover_focal jsonb NOT NULL DEFAULT '{"x":0.5,"y":0.5}'
  CHECK (jsonb_typeof(cover_focal->'x') = 'number' AND jsonb_typeof(cover_focal->'y') = 'number'
    AND cover_focal ? 'x' AND cover_focal ? 'y'
    AND (cover_focal->>'x')::numeric BETWEEN 0 AND 1 AND (cover_focal->>'y')::numeric BETWEEN 0 AND 1);
ALTER TABLE items ADD COLUMN image_focal jsonb NOT NULL DEFAULT '{"x":0.5,"y":0.5}'
  CHECK (jsonb_typeof(image_focal->'x') = 'number' AND jsonb_typeof(image_focal->'y') = 'number'
    AND image_focal ? 'x' AND image_focal ? 'y'
    AND (image_focal->>'x')::numeric BETWEEN 0 AND 1 AND (image_focal->>'y')::numeric BETWEEN 0 AND 1);
COMMIT;
