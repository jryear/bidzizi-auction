BEGIN;
-- Operator-owned opt-in. No event, approval, standing or bid is created here.
CREATE TABLE IF NOT EXISTS public.bz_demo_event_entries (
 event_id uuid PRIMARY KEY,
 org_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 FOREIGN KEY(event_id,org_id) REFERENCES public.bz_events(id,org_id)
);
CREATE TABLE IF NOT EXISTS public.bz_demo_entry_slots (
 id uuid PRIMARY KEY,
 event_id uuid NOT NULL REFERENCES public.bz_demo_event_entries(event_id),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 consumed_at timestamptz,
 person_id uuid REFERENCES public.bz_people(id),
 business_id uuid REFERENCES public.bz_businesses(id),
 name text,
 business_name text,
 claimed_member_id text,
 payload_hash text CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 session_hash text REFERENCES public.bz_sessions(token_hash),
 CHECK((person_id IS NULL AND business_id IS NULL AND name IS NULL AND business_name IS NULL AND claimed_member_id IS NULL AND payload_hash IS NULL AND session_hash IS NULL AND consumed_at IS NULL)
   OR (person_id IS NOT NULL AND business_id IS NOT NULL AND name IS NOT NULL AND business_name IS NOT NULL AND claimed_member_id IS NOT NULL AND payload_hash IS NOT NULL AND session_hash IS NOT NULL)),
 CHECK(name IS NULL OR (length(name) BETWEEN 1 AND 80 AND name=btrim(name) AND name !~ '[[:cntrl:]]')),
 CHECK(business_name IS NULL OR (length(business_name) BETWEEN 1 AND 120 AND business_name=btrim(business_name) AND business_name !~ '[[:cntrl:]]')),
 CHECK(claimed_member_id IS NULL OR (length(claimed_member_id) BETWEEN 1 AND 80 AND claimed_member_id=btrim(claimed_member_id) AND claimed_member_id !~ '[[:cntrl:]]'))
);
REVOKE ALL ON public.bz_demo_event_entries,public.bz_demo_entry_slots FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.bz_demo_begin(p_event uuid,p_entry uuid,p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE eligible public.bz_demo_event_entries%ROWTYPE; slot public.bz_demo_entry_slots%ROWTYPE; live record; at timestamptz;
BEGIN
 IF p_event IS NULL OR p_entry IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('error','INVALID'); END IF;
 SELECT * INTO eligible FROM public.bz_demo_event_entries WHERE event_id=p_event FOR SHARE;
 IF NOT FOUND OR NOT eligible.enabled THEN RETURN jsonb_build_object('error','MISSING'); END IF;
 INSERT INTO public.bz_demo_entry_slots(id,event_id,token_hash,expires_at)
 VALUES(p_entry,p_event,p_token_hash,clock_timestamp()+interval '15 minutes') ON CONFLICT(id) DO NOTHING;
 SELECT * INTO slot FROM public.bz_demo_entry_slots WHERE id=p_entry FOR UPDATE;
 IF slot.event_id<>p_event OR slot.token_hash<>p_token_hash THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
 IF slot.person_id IS NOT NULL THEN
  SELECT s.expires_at,s.revoked_at,p.active,p.is_test INTO live FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id WHERE s.token_hash=slot.session_hash FOR SHARE OF s,p;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 END IF;
 at:=clock_timestamp();
 IF slot.consumed_at IS NOT NULL OR slot.expires_at<=at THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 IF slot.person_id IS NOT NULL THEN
  IF NOT live.active OR NOT live.is_test OR live.revoked_at IS NOT NULL OR live.expires_at<=at THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 END IF;
 RETURN jsonb_build_object('entryId',p_entry,'eventId',p_event);
END $$;

CREATE OR REPLACE FUNCTION public.bz_demo_enroll(p_event uuid,p_entry uuid,p_token_hash text,p_name text,p_business text,p_member text,p_payload_hash text,p_session_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE eligible public.bz_demo_event_entries%ROWTYPE; slot public.bz_demo_entry_slots%ROWTYPE; live record; at timestamptz; person uuid; business uuid;
BEGIN
 IF p_event IS NULL OR p_entry IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$' OR p_session_hash IS NULL OR p_session_hash !~ '^[a-f0-9]{64}$'
 OR p_name IS NULL OR length(p_name) NOT BETWEEN 1 AND 80 OR p_name<>btrim(p_name) OR p_name ~ '[[:cntrl:]]'
 OR p_business IS NULL OR length(p_business) NOT BETWEEN 1 AND 120 OR p_business<>btrim(p_business) OR p_business ~ '[[:cntrl:]]'
 OR p_member IS NULL OR length(p_member) NOT BETWEEN 1 AND 80 OR p_member<>btrim(p_member) OR p_member ~ '[[:cntrl:]]' THEN RETURN jsonb_build_object('error','INVALID'); END IF;
 SELECT * INTO eligible FROM public.bz_demo_event_entries WHERE event_id=p_event FOR SHARE;
 IF NOT FOUND OR NOT eligible.enabled THEN RETURN jsonb_build_object('error','MISSING'); END IF;
 SELECT * INTO slot FROM public.bz_demo_entry_slots WHERE id=p_entry FOR UPDATE;
 IF NOT FOUND OR slot.event_id<>p_event OR slot.token_hash<>p_token_hash OR slot.consumed_at IS NOT NULL THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 IF slot.person_id IS NOT NULL THEN
  SELECT s.expires_at,s.revoked_at,p.active,p.is_test INTO live FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id WHERE s.token_hash=slot.session_hash FOR SHARE OF s,p;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 END IF;
 at:=clock_timestamp();
 IF slot.expires_at<=at THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 IF slot.person_id IS NOT NULL THEN
  IF NOT live.active OR NOT live.is_test OR live.revoked_at IS NOT NULL OR live.expires_at<=at OR slot.session_hash<>p_session_hash THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
  IF slot.payload_hash<>p_payload_hash OR slot.name<>p_name OR slot.business_name<>p_business OR slot.claimed_member_id<>p_member THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
  person:=slot.person_id; business:=slot.business_id;
 ELSE
  person:=gen_random_uuid(); business:=gen_random_uuid();
  INSERT INTO public.bz_people(id,alias,name,active,is_test) VALUES(person,'demo-'||person::text,p_name,true,true);
  INSERT INTO public.bz_businesses(id,name,active) VALUES(business,p_business,true);
  INSERT INTO public.bz_business_person_memberships(person_id,business_id,can_bid,active) VALUES(person,business,true,true);
  INSERT INTO public.bz_org_business_memberships(org_id,business_id,active) VALUES(eligible.org_id,business,true);
  INSERT INTO public.bz_event_view_grants(person_id,event_id,active) VALUES(person,p_event,true);
  INSERT INTO public.bz_event_bidder_admissions(person_id,event_id,access,active) VALUES(person,p_event,'BID',true);
  INSERT INTO public.bz_sessions(token_hash,person_id,expires_at) VALUES(p_session_hash,person,at+interval '8 hours');
  UPDATE public.bz_demo_entry_slots SET person_id=person,business_id=business,name=p_name,business_name=p_business,claimed_member_id=p_member,payload_hash=p_payload_hash,session_hash=p_session_hash WHERE id=p_entry;
 END IF;
 RETURN jsonb_build_object('authenticated',true,'testMode',true,'eventId',p_event,'person',jsonb_build_object('id',person,'name',p_name),'business',jsonb_build_object('id',business,'name',p_business));
END $$;

CREATE OR REPLACE FUNCTION public.bz_demo_acknowledge(p_event uuid,p_entry uuid,p_session_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE eligible public.bz_demo_event_entries%ROWTYPE; slot public.bz_demo_entry_slots%ROWTYPE; live record; at timestamptz;
BEGIN
 SELECT * INTO eligible FROM public.bz_demo_event_entries WHERE event_id=p_event FOR SHARE;
 IF NOT FOUND OR NOT eligible.enabled THEN RETURN jsonb_build_object('error','MISSING'); END IF;
 SELECT * INTO slot FROM public.bz_demo_entry_slots WHERE id=p_entry FOR UPDATE;
 IF NOT FOUND OR slot.event_id<>p_event OR slot.person_id IS NULL OR slot.session_hash IS DISTINCT FROM p_session_hash THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 SELECT s.expires_at,s.revoked_at,p.active,p.is_test INTO live FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id WHERE s.token_hash=slot.session_hash FOR SHARE OF s,p;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 at:=clock_timestamp();
 IF NOT live.active OR NOT live.is_test OR live.revoked_at IS NOT NULL OR live.expires_at<=at THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 -- ACK is current-session-only and idempotent after expiry/consumption, never session issuance.
 UPDATE public.bz_demo_entry_slots SET consumed_at=COALESCE(consumed_at,at) WHERE id=p_entry;
 RETURN jsonb_build_object('acknowledged',true,'eventId',p_event);
END $$;
REVOKE ALL ON FUNCTION public.bz_demo_begin(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bz_demo_enroll(uuid,uuid,text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bz_demo_acknowledge(uuid,uuid,text) FROM PUBLIC;
COMMIT;
