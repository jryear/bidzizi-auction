BEGIN;
CREATE TABLE IF NOT EXISTS bz_businesses (
 id uuid PRIMARY KEY, name text NOT NULL CHECK(length(name)>0), active boolean NOT NULL DEFAULT true,
 lock_marker boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS bz_business_person_memberships (
 person_id uuid NOT NULL REFERENCES bz_people(id), business_id uuid NOT NULL REFERENCES bz_businesses(id),
 can_bid boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true, lock_marker boolean NOT NULL DEFAULT false,
 PRIMARY KEY(person_id,business_id)
);
CREATE TABLE IF NOT EXISTS bz_org_business_memberships (
 org_id uuid NOT NULL REFERENCES bz_orgs(id), business_id uuid NOT NULL REFERENCES bz_businesses(id),
 active boolean NOT NULL DEFAULT true, lock_marker boolean NOT NULL DEFAULT false, PRIMARY KEY(org_id,business_id)
);
CREATE TABLE IF NOT EXISTS bz_event_bidder_admissions (
 person_id uuid NOT NULL REFERENCES bz_people(id), event_id uuid NOT NULL REFERENCES bz_events(id),
 access text NOT NULL CHECK(access IN ('VIEW','BID')), active boolean NOT NULL DEFAULT true,
 lock_marker boolean NOT NULL DEFAULT false, PRIMARY KEY(person_id,event_id)
);
CREATE TABLE IF NOT EXISTS bz_lot_standing (
 release_id uuid NOT NULL, lot_id uuid NOT NULL, event_id uuid NOT NULL, org_id uuid NOT NULL,
 ruleset_id text NOT NULL, currency text NOT NULL, increment_minor bigint NOT NULL CHECK(increment_minor>0),
 amount_cap_minor bigint NOT NULL CHECK(amount_cap_minor>0), current_amount_minor bigint,
 leading_business_id uuid REFERENCES bz_businesses(id), accepted_bid_id uuid,
 accepted_bid_count integer NOT NULL DEFAULT 0 CHECK(accepted_bid_count>=0),
 version integer NOT NULL DEFAULT 0 CHECK(version=accepted_bid_count), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(release_id,lot_id), FOREIGN KEY(release_id,lot_id) REFERENCES bz_catalog_lots(approval_id,lot_id),
 FOREIGN KEY(release_id,event_id,org_id) REFERENCES bz_catalog_approvals(id,event_id,org_id),
 CHECK((accepted_bid_count=0 AND current_amount_minor IS NULL AND leading_business_id IS NULL AND accepted_bid_id IS NULL)
 OR (accepted_bid_count>0 AND current_amount_minor>0 AND current_amount_minor<=amount_cap_minor AND leading_business_id IS NOT NULL AND accepted_bid_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS bz_manual_bids (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES bz_people(id), business_id uuid NOT NULL REFERENCES bz_businesses(id),
 request_id uuid NOT NULL, event_id uuid NOT NULL, org_id uuid NOT NULL, release_id uuid NOT NULL, lot_id uuid NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=1000000000),
 ruleset_id text NOT NULL, currency text NOT NULL, standing_version integer NOT NULL CHECK(standing_version>0),
 decided_at timestamptz NOT NULL,
 UNIQUE(actor_id,request_id), UNIQUE(id,release_id,lot_id), UNIQUE(release_id,lot_id,standing_version),
 FOREIGN KEY(release_id,lot_id) REFERENCES bz_catalog_lots(approval_id,lot_id),
 FOREIGN KEY(release_id,event_id,org_id) REFERENCES bz_catalog_approvals(id,event_id,org_id)
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='bz_standing_accepted_bid_fk' AND conrelid='bz_lot_standing'::regclass) THEN
  ALTER TABLE bz_lot_standing ADD CONSTRAINT bz_standing_accepted_bid_fk FOREIGN KEY(accepted_bid_id,release_id,lot_id) REFERENCES bz_manual_bids(id,release_id,lot_id);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS bz_bid_receipts (
 actor_id uuid NOT NULL REFERENCES bz_people(id), request_id uuid NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND receipt->>'actorId'=actor_id::text AND receipt->>'requestId'=request_id::text),
 http_status integer NOT NULL CHECK(http_status IN (201,409)), PRIMARY KEY(actor_id,request_id)
);
COMMIT;
