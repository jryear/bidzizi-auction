BEGIN;
-- Event-scoped access controls. No new identity, business, network or BID
-- spending grant is created. Apply with the reviewed authority successor 017.
CREATE TABLE public.bz_staff_bidder_controls (
 event_id uuid NOT NULL REFERENCES public.bz_events(id),
 person_id uuid NOT NULL REFERENCES public.bz_people(id),
 revision integer NOT NULL CHECK(revision>0),
 updated_by uuid NOT NULL REFERENCES public.bz_people(id),
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(event_id,person_id)
);
REVOKE ALL ON TABLE public.bz_staff_bidder_controls FROM PUBLIC;
DO $$ DECLARE recipient text; BEGIN
 FOR recipient IN SELECT DISTINCT r.rolname FROM pg_class c
  CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  JOIN pg_roles r ON r.oid=a.grantee
  WHERE c.oid='public.bz_staff_bidder_controls'::regclass AND a.grantee<>c.relowner
 LOOP EXECUTE format('REVOKE ALL ON TABLE public.bz_staff_bidder_controls FROM %I',recipient); END LOOP;
END $$;

CREATE FUNCTION public.bz_staff_bidder_list(p_hash text,p_event uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; org uuid; at timestamptz; bidders jsonb;
BEGIN
 IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_event IS NULL THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 SELECT p.id INTO actor FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.active AND p.is_test FOR SHARE OF s,p;
 IF actor IS NULL THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 SELECT e.org_id INTO org FROM public.bz_events e WHERE e.id=p_event;
 IF org IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
 PERFORM 1 FROM public.bz_staff_grants g JOIN public.bz_orgs o ON o.id=g.org_id
  WHERE g.person_id=actor AND g.org_id=org AND g.active FOR SHARE OF g,o;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 PERFORM 1 FROM public.bz_events e WHERE e.id=p_event AND e.org_id=org FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
 SELECT coalesce(jsonb_agg(row.value ORDER BY row.name,row.id),'[]'::jsonb) INTO bidders FROM (
  SELECT p.name,p.id,jsonb_build_object('person',jsonb_build_object('id',p.id,'name',p.name),
   'businesses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'canBid',m.can_bid) ORDER BY b.name,b.id)
    FROM public.bz_business_person_memberships m JOIN public.bz_businesses b ON b.id=m.business_id AND b.active
    JOIN public.bz_org_business_memberships n ON n.business_id=b.id AND n.org_id=org AND n.active
    WHERE m.person_id=p.id AND m.active),'[]'::jsonb),
   'claimedMemberId',(SELECT d.claimed_member_id FROM public.bz_demo_entry_slots d
    WHERE d.event_id=p_event AND d.person_id=p.id ORDER BY d.created_at LIMIT 1),
   'access',a.access,'active',a.active AND coalesce(v.active,false) AND p.active,'revision',coalesce(c.revision,0)) AS value
  FROM public.bz_event_bidder_admissions a JOIN public.bz_people p ON p.id=a.person_id AND p.is_test
  LEFT JOIN public.bz_event_view_grants v ON v.person_id=a.person_id AND v.event_id=a.event_id
  LEFT JOIN public.bz_staff_bidder_controls c ON c.event_id=a.event_id AND c.person_id=a.person_id
  WHERE a.event_id=p_event
 ) row;
 at:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  JOIN public.bz_staff_grants g ON g.person_id=p.id JOIN public.bz_events e ON e.org_id=g.org_id
  WHERE s.token_hash=p_hash AND p.id=actor AND e.id=p_event AND e.org_id=org
   AND s.revoked_at IS NULL AND s.expires_at>at AND p.active AND p.is_test AND g.active)
 THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 RETURN jsonb_build_object('eventId',p_event,'serverNow',at,'bidders',bidders);
END $$;
REVOKE ALL ON FUNCTION public.bz_staff_bidder_list(text,uuid) FROM PUBLIC;

CREATE FUNCTION public.bz_staff_bidder_set(p_hash text,p_event uuid,p_request uuid,p_person uuid,p_expected integer,p_access text,p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; org uuid; current_revision integer; at timestamptz; payload_hash text;
 prior public.bz_requests%ROWTYPE; result jsonb;
BEGIN
 IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_event IS NULL OR p_request IS NULL OR p_person IS NULL
  OR p_expected IS NULL OR p_expected<0 OR p_expected>=2147483647 OR p_access IS NULL OR p_access NOT IN ('VIEW','BID') OR p_active IS NULL
 THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
 SELECT p.id INTO actor FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.active AND p.is_test FOR SHARE OF s,p;
 IF actor IS NULL THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 SELECT e.org_id INTO org FROM public.bz_events e WHERE e.id=p_event;
 IF org IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
 PERFORM 1 FROM public.bz_staff_grants g JOIN public.bz_orgs o ON o.id=g.org_id
  WHERE g.person_id=actor AND g.org_id=org AND g.active FOR SHARE OF g,o;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 -- Per-actor intent precedes the selected event's mutation lock. Independent
 -- organizations do not enter a global mutation queue.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor||':staff-bidder:'||p_request,0));
 PERFORM 1 FROM public.bz_events e WHERE e.id=p_event AND e.org_id=org FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
 at:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  JOIN public.bz_staff_grants g ON g.person_id=p.id
  WHERE s.token_hash=p_hash AND p.id=actor AND s.revoked_at IS NULL AND s.expires_at>at
   AND p.active AND p.is_test AND g.org_id=org AND g.active)
 THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 payload_hash:=encode(sha256(convert_to(jsonb_build_object('eventId',p_event,'personId',p_person,
  'expectedRevision',p_expected,'access',p_access,'active',p_active)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM public.bz_requests r WHERE r.actor_id=actor AND r.operation='staff-bidder-set:v1' AND r.request_id=p_request;
 IF prior.actor_id IS NOT NULL THEN
  IF prior.payload_hash<>payload_hash THEN RETURN jsonb_build_object('error','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN prior.response||jsonb_build_object('replayed',true);
 END IF;
 -- Only an already-admitted synthetic attendee in this event can be managed.
 PERFORM 1 FROM public.bz_people p JOIN public.bz_event_bidder_admissions a ON a.person_id=p.id
  JOIN public.bz_event_view_grants v ON v.person_id=p.id AND v.event_id=a.event_id
  WHERE p.id=p_person AND p.is_test AND a.event_id=p_event FOR SHARE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
 SELECT c.revision INTO current_revision FROM public.bz_staff_bidder_controls c WHERE c.event_id=p_event AND c.person_id=p_person FOR UPDATE;
 current_revision:=coalesce(current_revision,0);
 IF current_revision<>p_expected THEN RETURN jsonb_build_object('error','BIDDER_REVISION_CONFLICT','currentRevision',current_revision); END IF;
 UPDATE public.bz_event_view_grants SET active=p_active WHERE event_id=p_event AND person_id=p_person;
 UPDATE public.bz_event_bidder_admissions SET active=p_active,access=p_access WHERE event_id=p_event AND person_id=p_person;
 at:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  JOIN public.bz_staff_grants g ON g.person_id=p.id JOIN public.bz_events e ON e.org_id=g.org_id
  WHERE s.token_hash=p_hash AND p.id=actor AND e.id=p_event AND e.org_id=org
   AND s.revoked_at IS NULL AND s.expires_at>at AND p.active AND p.is_test AND g.active)
 THEN RAISE EXCEPTION 'Staff session unavailable' USING ERRCODE='PBO02'; END IF;
 INSERT INTO public.bz_staff_bidder_controls(event_id,person_id,revision,updated_by,updated_at)
  VALUES(p_event,p_person,current_revision+1,actor,at)
  ON CONFLICT(event_id,person_id) DO UPDATE SET revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 result:=jsonb_build_object('operation',jsonb_build_object('requestId',p_request,'eventId',p_event,'personId',p_person,
  'access',p_access,'active',p_active,'revision',current_revision+1,'appliedAt',at),'replayed',false,'serverNow',at);
 INSERT INTO public.bz_requests(actor_id,operation,request_id,payload_hash,response,status)
  VALUES(actor,'staff-bidder-set:v1',p_request,payload_hash,result,200);
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  JOIN public.bz_staff_grants g ON g.person_id=p.id
  WHERE s.token_hash=p_hash AND p.id=actor AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
   AND p.active AND p.is_test AND g.org_id=org AND g.active)
 THEN RAISE EXCEPTION 'Staff session unavailable' USING ERRCODE='PBO02'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bz_staff_bidder_set(text,uuid,uuid,uuid,integer,text,boolean) FROM PUBLIC;
-- Installation grants are explicitly reviewed/applied for the existing runtime:
-- EXECUTE on bz_staff_bidder_list(text,uuid) and bz_staff_bidder_set above only.
-- No raw enrollment-slot or control-table privilege is added to the runtime.
COMMIT;
