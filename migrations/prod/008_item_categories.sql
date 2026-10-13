-- Items workspace: each event keeps its own ordered category list. Items still name their category in items.category;
-- the list adds order (guest chips follow it) and lets staff create a category before any item uses it.
BEGIN;

UPDATE items SET category = btrim(regexp_replace(category, '\s+', ' ', 'g'))
 WHERE category <> btrim(regexp_replace(category, '\s+', ' ', 'g'));
ALTER TABLE items ADD CONSTRAINT items_category_tidy CHECK (category = btrim(regexp_replace(category, '\s+', ' ', 'g')));

ALTER TABLE events ADD COLUMN categories jsonb NOT NULL DEFAULT '[]'
  CHECK (jsonb_typeof(categories) = 'array' AND jsonb_array_length(categories) <= 100);
UPDATE events e SET categories = coalesce((
  SELECT jsonb_agg(x.category ORDER BY x.first)
    FROM (SELECT category, min(position) AS first FROM items WHERE event_id = e.id AND category <> '' GROUP BY category) x), '[]');

CREATE INDEX items_event_category_idx ON items (event_id, lower(category));

COMMIT;
