BEGIN;
-- Legacy entry state and identities survive. Revision 1 observes the migration;
-- nullable updated_by does not invent historical staff provenance.
ALTER TABLE public.bz_demo_event_entries
 ADD COLUMN entry_revision integer NOT NULL DEFAULT 1 CHECK(entry_revision>0),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ADD COLUMN updated_by uuid REFERENCES public.bz_people(id);

CREATE TABLE public.bz_staff_event_entry_requests (
 actor_id uuid NOT NULL REFERENCES public.bz_people(id),
 event_id uuid NOT NULL REFERENCES public.bz_demo_event_entries(event_id),
 request_id uuid NOT NULL,
 expected_revision integer NOT NULL CHECK(expected_revision>=0 AND expected_revision<2147483647),
 requested_enabled boolean NOT NULL,
 applied_revision integer NOT NULL CHECK(applied_revision>0),
 applied_enabled boolean NOT NULL,
 applied_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,event_id,request_id),
 CHECK(applied_enabled=requested_enabled),
 CHECK(applied_revision::bigint=expected_revision::bigint+1)
);
-- Migration-owner defaults may have granted this new ledger to runtime or
-- PUBLIC. Remove every non-owner direct table/column ACL inherited at creation.
-- Installation grants only the two named EXECUTEs after effective-role readback.
REVOKE ALL ON TABLE public.bz_staff_event_entry_requests FROM PUBLIC;
REVOKE SELECT(actor_id,event_id,request_id,expected_revision,requested_enabled,applied_revision,applied_enabled,applied_at),INSERT(actor_id,event_id,request_id,expected_revision,requested_enabled,applied_revision,applied_enabled,applied_at),UPDATE(actor_id,event_id,request_id,expected_revision,requested_enabled,applied_revision,applied_enabled,applied_at),REFERENCES(actor_id,event_id,request_id,expected_revision,requested_enabled,applied_revision,applied_enabled,applied_at)
 ON TABLE public.bz_staff_event_entry_requests FROM PUBLIC;
DO $$
DECLARE grantee_name text;
BEGIN
 FOR grantee_name IN
  SELECT DISTINCT r.rolname FROM pg_catalog.pg_class c
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
  JOIN pg_catalog.pg_roles r ON r.oid=a.grantee
  WHERE c.oid='public.bz_staff_event_entry_requests'::pg_catalog.regclass AND a.grantee<>c.relowner
 LOOP
  EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.bz_staff_event_entry_requests FROM %I',grantee_name);
  EXECUTE pg_catalog.format('REVOKE SELECT(actor_id,event_id,request_id,expected_revision,requested_enabled,applied_revision,applied_enabled,applied_at),INSERT(actor_id,event_id,request_id,expected_revision,requested_enabled,applied_revision,applied_enabled,applied_at),UPDATE(actor_id,event_id,request_id,expected_revision,requested_enabled,applied_revision,applied_enabled,applied_at),REFERENCES(actor_id,event_id,request_id,expected_revision,requested_enabled,applied_revision,applied_enabled,applied_at) ON TABLE public.bz_staff_event_entry_requests FROM %I',grantee_name);
 END LOOP;
END $$;

CREATE FUNCTION public.bz_staff_event_entry_read(p_session_hash text,p_event uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; orgs uuid[]; e public.bz_events%ROWTYPE;
 entry public.bz_demo_event_entries%ROWTYPE; at timestamptz;
BEGIN
 IF p_session_hash IS NULL OR p_session_hash !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 IF p_event IS NULL THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
 SELECT p.id INTO actor FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.active AND p.is_test
 FOR SHARE OF s,p;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 SELECT array_agg(locked.id) INTO orgs FROM (
  SELECT o.id FROM public.bz_staff_grants g JOIN public.bz_orgs o ON o.id=g.org_id
  WHERE g.person_id=actor AND g.active ORDER BY o.name FOR SHARE OF g,o
 ) locked;
 IF orgs IS NULL THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 SELECT * INTO e FROM public.bz_events WHERE id=p_event FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
 IF NOT e.org_id=ANY(orgs) THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 SELECT * INTO entry FROM public.bz_demo_event_entries WHERE event_id=p_event FOR SHARE;
 at:=clock_timestamp();
 -- Fresh reads of already-held authority rows introduce no reverse-order lock.
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  WHERE s.token_hash=p_session_hash AND p.id=actor AND s.revoked_at IS NULL AND s.expires_at>at AND p.active AND p.is_test)
 THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  JOIN public.bz_staff_grants g ON g.person_id=p.id JOIN public.bz_orgs o ON o.id=g.org_id
  JOIN public.bz_events current_event ON current_event.id=p_event AND current_event.org_id=o.id
  WHERE s.token_hash=p_session_hash AND p.id=actor AND g.active AND g.org_id=e.org_id AND o.id=e.org_id
  AND s.revoked_at IS NULL AND s.expires_at>at AND p.active AND p.is_test)
 THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 RETURN jsonb_build_object('entry',jsonb_build_object('eventId',e.id,'enabled',COALESCE(entry.enabled,false),
  'entryRevision',COALESCE(entry.entry_revision,0),'updatedAt',entry.updated_at),'serverNow',at);
END $$;

CREATE FUNCTION public.bz_staff_event_entry_set(p_session_hash text,p_event uuid,p_expected_revision integer,p_enabled boolean,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; orgs uuid[]; e public.bz_events%ROWTYPE;
 entry public.bz_demo_event_entries%ROWTYPE; prior public.bz_staff_event_entry_requests%ROWTYPE;
 at timestamptz; applied timestamptz; revision integer; replayed boolean;
BEGIN
 IF p_session_hash IS NULL OR p_session_hash !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 IF p_event IS NULL OR p_request IS NULL OR p_enabled IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
 THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
 SELECT p.id INTO actor FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.active AND p.is_test
 FOR SHARE OF s,p;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 SELECT array_agg(locked.id) INTO orgs FROM (
  SELECT o.id FROM public.bz_staff_grants g JOIN public.bz_orgs o ON o.id=g.org_id
  WHERE g.person_id=actor AND g.active ORDER BY o.name FOR SHARE OF g,o
 ) locked;
 IF orgs IS NULL THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 SELECT * INTO e FROM public.bz_events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
 IF NOT e.org_id=ANY(orgs) THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 SELECT * INTO entry FROM public.bz_demo_event_entries WHERE event_id=p_event FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('bz:staff-event-entry:v1:'||actor::text||':'||p_event::text||':'||p_request::text,0));
 at:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  WHERE s.token_hash=p_session_hash AND p.id=actor AND s.revoked_at IS NULL AND s.expires_at>at AND p.active AND p.is_test)
 THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  JOIN public.bz_staff_grants g ON g.person_id=p.id JOIN public.bz_orgs o ON o.id=g.org_id
  JOIN public.bz_events current_event ON current_event.id=p_event AND current_event.org_id=o.id
  WHERE s.token_hash=p_session_hash AND p.id=actor AND g.active AND g.org_id=e.org_id AND o.id=e.org_id
  AND s.revoked_at IS NULL AND s.expires_at>at AND p.active AND p.is_test)
 THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 SELECT * INTO prior FROM public.bz_staff_event_entry_requests WHERE actor_id=actor AND event_id=p_event AND request_id=p_request;
 replayed:=FOUND;
 IF replayed THEN
  IF prior.expected_revision<>p_expected_revision OR prior.requested_enabled<>p_enabled
  THEN RETURN jsonb_build_object('error','ENTRY_REQUEST_CONFLICT'); END IF;
 ELSE
  revision:=COALESCE(entry.entry_revision,0);
  IF revision<>p_expected_revision THEN RETURN jsonb_build_object('error','ENTRY_REVISION_CONFLICT','currentEntryRevision',revision); END IF;
  IF revision=2147483647 THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
  applied:=at;
  -- A subtransaction rolls back both provisional writes if any final current
  -- authority/expiry check fails after an insertion/trigger wait.
  BEGIN
   INSERT INTO public.bz_demo_event_entries(event_id,org_id,enabled,entry_revision,updated_at,updated_by)
   VALUES(p_event,e.org_id,p_enabled,revision+1,applied,actor)
   ON CONFLICT(event_id) DO UPDATE SET enabled=EXCLUDED.enabled,entry_revision=EXCLUDED.entry_revision,
    updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by
   RETURNING * INTO entry;
   INSERT INTO public.bz_staff_event_entry_requests(actor_id,event_id,request_id,expected_revision,requested_enabled,applied_revision,applied_enabled,applied_at)
   VALUES(actor,p_event,p_request,revision,p_enabled,revision+1,p_enabled,applied) RETURNING * INTO prior;
   at:=clock_timestamp();
   IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
    WHERE s.token_hash=p_session_hash AND p.id=actor AND s.revoked_at IS NULL AND s.expires_at>at AND p.active AND p.is_test)
   THEN RAISE SQLSTATE 'BZ401'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
    JOIN public.bz_staff_grants g ON g.person_id=p.id JOIN public.bz_orgs o ON o.id=g.org_id
    JOIN public.bz_events current_event ON current_event.id=p_event AND current_event.org_id=o.id
    WHERE s.token_hash=p_session_hash AND p.id=actor AND g.active AND g.org_id=e.org_id AND o.id=e.org_id
    AND s.revoked_at IS NULL AND s.expires_at>at AND p.active AND p.is_test)
   THEN RAISE SQLSTATE 'BZ403'; END IF;
  EXCEPTION
   WHEN SQLSTATE 'BZ401' THEN RETURN jsonb_build_object('error','UNAUTHENTICATED');
   WHEN SQLSTATE 'BZ403' THEN RETURN jsonb_build_object('error','FORBIDDEN');
  END;
 END IF;
 RETURN jsonb_build_object('entry',jsonb_build_object('eventId',e.id,'enabled',entry.enabled,
  'entryRevision',entry.entry_revision,'updatedAt',entry.updated_at),'serverNow',at,'replayed',replayed,
  'operation',jsonb_build_object('requestId',prior.request_id,'appliedRevision',prior.applied_revision,'enabled',prior.applied_enabled,'appliedAt',prior.applied_at));
END $$;
REVOKE ALL ON FUNCTION public.bz_staff_event_entry_read(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bz_staff_event_entry_set(text,uuid,integer,boolean,uuid) FROM PUBLIC;
-- Existing runtime identity, effective table/column rights, owner and memberships
-- must be independently read back before granting these two EXECUTEs externally.
COMMIT;
