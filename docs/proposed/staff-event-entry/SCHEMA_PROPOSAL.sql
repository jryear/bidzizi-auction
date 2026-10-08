-- DRAFT REVIEW MATERIAL ONLY. Do not install this file.
-- Function bodies / permissions require reviewed implementation + owner approval.
-- Future reserved migration: migrations/015_staff_event_entry.sql.
-- Preserve migrations001/002/003/009 and legacy event/org/enabled/slot/session IDs.
ALTER TABLE public.bz_demo_event_entries
 ADD COLUMN entry_revision integer NOT NULL DEFAULT 1 CHECK(entry_revision>0),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ADD COLUMN updated_by uuid REFERENCES public.bz_people(id);

CREATE TABLE public.bz_staff_event_entry_requests (
 actor_id uuid NOT NULL REFERENCES public.bz_people(id),
 event_id uuid NOT NULL REFERENCES public.bz_demo_event_entries(event_id),
 request_id uuid NOT NULL,
 expected_revision integer NOT NULL CHECK(expected_revision>=0),
 requested_enabled boolean NOT NULL,
 applied_revision integer NOT NULL CHECK(applied_revision>0),
 applied_enabled boolean NOT NULL,
 applied_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,event_id,request_id),
 CHECK(applied_enabled=requested_enabled),
 CHECK(applied_revision=expected_revision+1)
);
-- Above CHECK arithmetic must refuse int32 overflow before SQL arithmetic.
-- Ledger is inserted only by setter, not mutable by runtime.
-- No raw/hash session credential is persisted in this ledger.
-- Required proposed signatures (bodies deliberately not supplied here):
-- bz_staff_event_entry_read(text,uuid) RETURNS jsonb
-- bz_staff_event_entry_set(text,uuid,integer,boolean,uuid) RETURNS jsonb
-- Both SECURITY DEFINER SET search_path=pg_catalog, owned by existing migrator,
-- PUBLIC EXECUTE revoked, only exact EXECUTEs granted to existing runtime.
-- Explicitly REVOKE ALL new-ledger table rights from PUBLIC/existing_runtime,
-- and REVOKE SELECT/INSERT/UPDATE/REFERENCES on every ledger column from both.
-- Check effective table/column privileges and memberships/owner, including
-- inherited migration-owner DEFAULT PRIVILEGES, before granting two EXECUTEs.
-- No role/member/owner changes are authorized by this draft.
