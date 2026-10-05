# Proposed003 independent SQL observation boundary

Names below are concrete proposed interfaces, not a migration implementation.
Candidate migration003 supplies records; the evidence never creates missing
product schema.001/002 migrations remain protected. FK/check/index design must
preserve these semantic scopes; the test observes direct rows and actual transport.

| Table | Required observation columns and scope |
| --- | --- |
| bz_businesses | id UUID, name TEXT, active BOOL, lock_marker BOOL |
| bz_business_person_memberships | person_id/business_id composite key; can_bid, active, lock_marker BOOL |
| bz_org_business_memberships | org_id/business_id composite key; active, lock_marker BOOL |
| bz_event_bidder_admissions | person_id/event_id composite key; access BID or VIEW, active, lock_marker BOOL |
| bz_lot_standing | release_id/lot_id composite key referencing immutable selected lot; event_id/org_id, ruleset_id, currency, increment_minor, amount_cap_minor; current_amount_minor, leading_business_id, accepted_bid_id nullable; accepted_bid_count/version integers; updated_at timestamptz |
| bz_manual_bids | id UUID, actor_id/business_id/request_id/event_id/org_id/release_id/lot_id; amount_minor integer, ruleset_id/currency, standing_version, decided_at timestamptz; unique actor/request |
| bz_bid_receipts | actor_id/request_id composite key; receipt JSONB complete immutable DTO, http_status201 or409; full original scoped payload or an equivalent immutable fingerprint, never globally UUID-owned |

Monetary SQL types must hold all versioned cap values exactly; bigint is suitable.
Standing version/count agree with accepted bid/receipt rows. Receipt/bid/standing
changes are one transaction. Terminal rejection records no accepted bid.

Inherited002 tables/columns: bz_catalog_approvals, bz_catalog_lots and
bz_event_view_grants(person_id,event_id,active,lock_marker). Inherited001 people,
sessions, orgs, staff grants, events/lots/requests retain their exact schemas.
Existing lock_marker additions come from002, not edits to001 migration.

The harness runs candidate migrations as a separate non-superuser owner, seeds
fixed synthetic people/releases/memberships independently, then starts the app
with a different NOINHERIT, nonowner, nonsuperuser local role. Authority tables:
SELECT plus UPDATE(lock_marker) only. Sessions: SELECT/INSERT, UPDATE(revoked_at).
Draft events/lots: inherited CRUD. Catalog, manual bids and receipts: SELECT/INSERT
only. Operational standing: SELECT/INSERT/UPDATE. No authority-field or immutable
history UPDATE/DELETE; no schema/DB/role creation or TEMP privilege.

clock_timestamp() is captured after the lot lock for decision time and after any
authority wait for current session expiry. Existing now() does not advance across
a wait. Independent pg_stat_activity blockingPID barriers prove the request was
actually queued while initially open/unexpired. Holds remain below the existing
five-second statement timeout; no production/test clock endpoint is introduced.
