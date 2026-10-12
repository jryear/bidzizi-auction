-- BidZizi Real V1 core schema: host an event, join an event.
-- Design: docs/plans/REAL_V1_PRODUCT.md. Amounts are integer cents.
BEGIN;

CREATE TABLE orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email LIKE '%@%' AND length(email) <= 254),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  password_hash text NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE staff_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  staff_id uuid NOT NULL REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX staff_sessions_staff_idx ON staff_sessions (staff_id);

CREATE TABLE login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_hash text NOT NULL,
  ip_hash text NOT NULL,
  succeeded boolean NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_idx ON login_attempts (email_hash, at);
CREATE INDEX login_attempts_ip_idx ON login_attempts (ip_hash, at);

-- Images are normalized to webp server-side before insert.
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id),
  mime text NOT NULL CHECK (mime = 'image/webp'),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 3145728),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, org_id)
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id),
  join_code text NOT NULL UNIQUE CHECK (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  welcome text NOT NULL DEFAULT '' CHECK (length(welcome) <= 5000),
  venue text NOT NULL DEFAULT '' CHECK (length(venue) <= 300),
  winner_instructions text NOT NULL DEFAULT '' CHECK (length(winner_instructions) <= 5000),
  cover_asset_id uuid,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  access_ends_at timestamptz NOT NULL,
  -- draft: only staff see it. live: joinable and visible to participants.
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live')),
  entry_open boolean NOT NULL DEFAULT true,
  bid_mode text NOT NULL DEFAULT 'tiered' CHECK (bid_mode IN ('tiered', 'fixed')),
  tiers jsonb NOT NULL DEFAULT '[{"belowMinor":50000,"raiseMinor":2500},{"belowMinor":100000,"raiseMinor":5000},{"belowMinor":250000,"raiseMinor":10000},{"belowMinor":null,"raiseMinor":25000}]',
  fixed_increment_minor bigint CHECK (fixed_increment_minor IS NULL OR fixed_increment_minor BETWEEN 1 AND 100000000),
  donations_enabled boolean NOT NULL DEFAULT false,
  donation_deadline timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  CHECK (access_ends_at >= ends_at),
  CHECK (bid_mode <> 'fixed' OR fixed_increment_minor IS NOT NULL),
  CHECK (NOT donations_enabled OR donation_deadline IS NOT NULL),
  FOREIGN KEY (cover_asset_id, org_id) REFERENCES assets (id, org_id),
  UNIQUE (id, org_id)
);
CREATE INDEX events_org_idx ON events (org_id, starts_at DESC);

CREATE TABLE sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  org_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  logo_asset_id uuid,
  FOREIGN KEY (event_id, org_id) REFERENCES events (id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (logo_asset_id, org_id) REFERENCES assets (id, org_id)
);

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  org_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  short text NOT NULL DEFAULT '' CHECK (length(short) <= 500),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  category text NOT NULL DEFAULT '' CHECK (length(category) <= 100),
  donor text NOT NULL DEFAULT '' CHECK (length(donor) <= 200),
  image_asset_id uuid,
  opening_minor bigint NOT NULL CHECK (opening_minor BETWEEN 1 AND 1000000000),
  increment_override_minor bigint CHECK (increment_override_minor IS NULL OR increment_override_minor BETWEEN 1 AND 100000000),
  opens_at timestamptz,
  closes_at timestamptz,
  -- ready: visible to participants once the event is live.
  ready boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (opens_at IS NULL OR closes_at IS NULL OR opens_at < closes_at),
  FOREIGN KEY (event_id, org_id) REFERENCES events (id, org_id),
  FOREIGN KEY (image_asset_id, org_id) REFERENCES assets (id, org_id),
  UNIQUE (id, event_id)
);
CREATE INDEX items_event_idx ON items (event_id, position);

-- A participant is an event identity remembered on one device.
CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 60 AND display_name !~ '[[:cntrl:]]'),
  business_name text NOT NULL CHECK (length(btrim(business_name)) BETWEEN 1 AND 120 AND business_name !~ '[[:cntrl:]]'),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  join_request_id uuid NOT NULL,
  can_bid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, event_id),
  UNIQUE (event_id, join_request_id)
);

CREATE TABLE rejoin_codes (
  code_hash text PRIMARY KEY CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  participant_id uuid NOT NULL REFERENCES participants(id),
  issued_by uuid NOT NULL REFERENCES staff(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- One row per item, created with the item. Locked FOR UPDATE by every bid.
CREATE TABLE standings (
  item_id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  current_minor bigint,
  leader_id uuid,
  leading_bid_id uuid,
  bid_count integer NOT NULL DEFAULT 0 CHECK (bid_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (item_id, event_id) REFERENCES items (id, event_id),
  FOREIGN KEY (leader_id, event_id) REFERENCES participants (id, event_id),
  CHECK ((bid_count = 0 AND current_minor IS NULL AND leader_id IS NULL AND leading_bid_id IS NULL)
      OR (bid_count > 0 AND current_minor BETWEEN 1 AND 1000000000 AND leader_id IS NOT NULL AND leading_bid_id IS NOT NULL))
);

CREATE TABLE bids (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  request_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000),
  sequence integer NOT NULL CHECK (sequence > 0),
  decided_at timestamptz NOT NULL,
  FOREIGN KEY (item_id, event_id) REFERENCES items (id, event_id),
  FOREIGN KEY (participant_id, event_id) REFERENCES participants (id, event_id),
  UNIQUE (participant_id, request_id),
  UNIQUE (item_id, sequence),
  UNIQUE (id, item_id)
);
ALTER TABLE standings ADD FOREIGN KEY (leading_bid_id, item_id) REFERENCES bids (id, item_id);

-- Every decision, accepted or rejected, keyed by the participant's request.
CREATE TABLE bid_receipts (
  participant_id uuid NOT NULL REFERENCES participants(id),
  request_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES items(id),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  accepted boolean NOT NULL,
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
  PRIMARY KEY (participant_id, request_id)
);
CREATE INDEX bid_receipts_item_idx ON bid_receipts (item_id);

CREATE TABLE watches (
  participant_id uuid NOT NULL REFERENCES participants(id),
  item_id uuid NOT NULL REFERENCES items(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (participant_id, item_id)
);

CREATE TABLE recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  org_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  logo_asset_id uuid,
  removed boolean NOT NULL DEFAULT false,
  FOREIGN KEY (event_id, org_id) REFERENCES events (id, org_id),
  FOREIGN KEY (logo_asset_id, org_id) REFERENCES assets (id, org_id),
  UNIQUE (id, event_id)
);

CREATE TABLE pledges (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  request_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  recipient_name text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL,
  processed_at timestamptz,
  processed_by uuid REFERENCES staff(id),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  FOREIGN KEY (participant_id, event_id) REFERENCES participants (id, event_id),
  FOREIGN KEY (recipient_id, event_id) REFERENCES recipients (id, event_id),
  UNIQUE (participant_id, request_id)
);
CREATE INDEX pledges_event_idx ON pledges (event_id, recorded_at);

-- Winner decision per closed item. History lives in award_log.
CREATE TABLE awards (
  item_id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('assigned', 'fulfilled', 'no_winner')),
  bid_id uuid,
  participant_id uuid,
  amount_minor bigint,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 5000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid NOT NULL REFERENCES staff(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (item_id, event_id) REFERENCES items (id, event_id),
  FOREIGN KEY (bid_id, item_id) REFERENCES bids (id, item_id),
  FOREIGN KEY (participant_id, event_id) REFERENCES participants (id, event_id),
  CHECK ((status = 'no_winner' AND bid_id IS NULL AND participant_id IS NULL AND amount_minor IS NULL)
      OR (status <> 'no_winner' AND bid_id IS NOT NULL AND participant_id IS NOT NULL AND amount_minor IS NOT NULL))
);

CREATE TABLE award_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES items(id),
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  staff_id uuid NOT NULL REFERENCES staff(id),
  at timestamptz NOT NULL DEFAULT now()
);

-- Staff request idempotency for create-style actions.
CREATE TABLE staff_requests (
  staff_id uuid NOT NULL REFERENCES staff(id),
  request_id uuid NOT NULL,
  operation text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, request_id)
);

COMMIT;
