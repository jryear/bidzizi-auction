-- Passthrough 1: how other participants see bidders. Staff always see full identities.
--   name_business (default) | business (business only) | anonymous ("Bidder 12", a stable per-event number)
BEGIN;

ALTER TABLE events ADD COLUMN bidder_display text NOT NULL DEFAULT 'name_business'
  CHECK (bidder_display IN ('name_business', 'business', 'anonymous'));

-- Every participant gets a stable number within their event, in join order.
ALTER TABLE participants ADD COLUMN bidder_number integer CHECK (bidder_number > 0);
UPDATE participants p SET bidder_number = n.rn
  FROM (SELECT id, row_number() OVER (PARTITION BY event_id ORDER BY created_at, id) AS rn FROM participants) n
 WHERE n.id = p.id;
ALTER TABLE participants ALTER COLUMN bidder_number SET NOT NULL;
ALTER TABLE participants ADD CONSTRAINT participants_event_bidder_number_key UNIQUE (event_id, bidder_number);

COMMIT;
