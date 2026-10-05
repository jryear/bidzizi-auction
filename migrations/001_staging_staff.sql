BEGIN;
CREATE TABLE IF NOT EXISTS bz_orgs (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  initials text NOT NULL
);
CREATE TABLE IF NOT EXISTS bz_people (
  id uuid PRIMARY KEY,
  alias text UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_test boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS bz_staff_grants (
  person_id uuid NOT NULL REFERENCES bz_people(id),
  org_id uuid NOT NULL REFERENCES bz_orgs(id),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(person_id,org_id)
);
CREATE TABLE IF NOT EXISTS bz_sessions (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  person_id uuid NOT NULL REFERENCES bz_people(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bz_sessions_person_idx ON bz_sessions(person_id);
CREATE TABLE IF NOT EXISTS bz_events (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES bz_orgs(id),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  draft jsonb NOT NULL CHECK(jsonb_typeof(draft)='object'),
  created_by uuid NOT NULL REFERENCES bz_people(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,org_id)
);
CREATE INDEX IF NOT EXISTS bz_events_org_idx ON bz_events(org_id,updated_at);
CREATE TABLE IF NOT EXISTS bz_lots (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  org_id uuid NOT NULL,
  position integer NOT NULL CHECK(position>=0),
  data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND data->>'id'=id::text),
  FOREIGN KEY(event_id,org_id) REFERENCES bz_events(id,org_id),
  UNIQUE(event_id,position)
);
CREATE TABLE IF NOT EXISTS bz_requests (
  actor_id uuid NOT NULL REFERENCES bz_people(id),
  operation text NOT NULL,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL,
  status integer NOT NULL CHECK(status IN (200,201)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,operation,request_id)
);
COMMIT;
