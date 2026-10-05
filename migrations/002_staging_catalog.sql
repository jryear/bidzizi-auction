BEGIN;
ALTER TABLE bz_orgs ADD COLUMN IF NOT EXISTS lock_marker boolean NOT NULL DEFAULT false;
ALTER TABLE bz_people ADD COLUMN IF NOT EXISTS lock_marker boolean NOT NULL DEFAULT false;
ALTER TABLE bz_staff_grants ADD COLUMN IF NOT EXISTS lock_marker boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS bz_event_view_grants (
  person_id uuid NOT NULL REFERENCES bz_people(id),
  event_id uuid NOT NULL REFERENCES bz_events(id),
  active boolean NOT NULL DEFAULT true,
  lock_marker boolean NOT NULL DEFAULT false,
  PRIMARY KEY(person_id,event_id)
);
CREATE TABLE IF NOT EXISTS bz_catalog_approvals (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  org_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>0),
  approved_by uuid NOT NULL REFERENCES bz_people(id),
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  local_date text NOT NULL,
  local_start text NOT NULL,
  local_end text NOT NULL,
  timezone text NOT NULL,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  organization_snapshot jsonb NOT NULL CHECK(jsonb_typeof(organization_snapshot)='object'),
  event_snapshot jsonb NOT NULL CHECK(jsonb_typeof(event_snapshot)='object'),
  CHECK(opens_at<closes_at),
  FOREIGN KEY(event_id,org_id) REFERENCES bz_events(id,org_id),
  UNIQUE(id,event_id,org_id)
);
CREATE TABLE IF NOT EXISTS bz_catalog_lots (
  approval_id uuid NOT NULL,
  event_id uuid NOT NULL,
  org_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  position integer NOT NULL CHECK(position>=0),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND snapshot->>'id'=lot_id::text),
  PRIMARY KEY(approval_id,lot_id),
  UNIQUE(approval_id,position),
  FOREIGN KEY(approval_id,event_id,org_id) REFERENCES bz_catalog_approvals(id,event_id,org_id)
);
CREATE OR REPLACE FUNCTION public.bz_catalog_phase(opens_at timestamptz,closes_at timestamptz,at_time timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN at_time<opens_at THEN 'scheduled' WHEN at_time<closes_at THEN 'open' ELSE 'closed' END
$$;
COMMIT;
