-- Passthrough 1: donations appear when an event has at least one nonprofit; the switch is gone.
BEGIN;
UPDATE events e SET donations_enabled = r.any,
       donation_deadline = CASE WHEN r.any THEN coalesce(e.donation_deadline, e.ends_at) ELSE e.donation_deadline END
  FROM (SELECT ev.id, EXISTS (SELECT 1 FROM recipients x WHERE x.event_id = ev.id AND NOT x.removed) AS any FROM events ev) r
 WHERE r.id = e.id;
COMMIT;
