BEGIN;
-- Additive original-V1 personal activity/manual pledge capability. No runtime
-- grants on ordinary auth/bid tables, default recipients, or financial effects.
CREATE TABLE public.bz_attendee_watches (
 actor_id uuid NOT NULL REFERENCES public.bz_people(id),
 event_id uuid NOT NULL, org_id uuid NOT NULL, release_id uuid NOT NULL, lot_id uuid NOT NULL,
 watched_at timestamptz NOT NULL,
 PRIMARY KEY(actor_id,release_id,lot_id),
 FOREIGN KEY(release_id,event_id,org_id) REFERENCES public.bz_catalog_approvals(id,event_id,org_id),
 FOREIGN KEY(release_id,lot_id) REFERENCES public.bz_catalog_lots(approval_id,lot_id)
);
CREATE TABLE public.bz_attendee_watch_requests (
 actor_id uuid NOT NULL REFERENCES public.bz_people(id), request_id uuid NOT NULL,
 event_id uuid NOT NULL REFERENCES public.bz_events(id),
 payload jsonb NOT NULL, response jsonb NOT NULL,
 PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE public.bz_donation_settings (
 event_id uuid PRIMARY KEY, org_id uuid NOT NULL, enabled boolean NOT NULL DEFAULT false,
 amount_cap_minor bigint CHECK(amount_cap_minor BETWEEN 1 AND 9007199254740991),
 availability jsonb,
 CHECK(availability IS NULL OR (jsonb_typeof(availability)='object' AND
  ((availability->>'mode'='any-time' AND availability=jsonb_build_object('mode','any-time')) OR
   (availability->>'mode'='window' AND availability ? 'opensAt' AND availability ? 'closesAt')))),
 updated_at timestamptz NOT NULL,
 FOREIGN KEY(event_id,org_id) REFERENCES public.bz_events(id,org_id)
);
CREATE TABLE public.bz_donation_nonprofits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, org_id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name))>0 AND length(name)<=200),
 description text NOT NULL CHECK(length(description)<=5000),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES public.bz_people(id), create_request_id uuid NOT NULL,
 create_payload jsonb NOT NULL,
 UNIQUE(created_by,create_request_id), UNIQUE(id,event_id,org_id),
 FOREIGN KEY(event_id,org_id) REFERENCES public.bz_events(id,org_id)
);
CREATE TABLE public.bz_donation_pledges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES public.bz_people(id),
 request_id uuid NOT NULL, event_id uuid NOT NULL, org_id uuid NOT NULL,
 business_id uuid NOT NULL REFERENCES public.bz_businesses(id), nonprofit_id uuid NOT NULL,
 nonprofit_version integer NOT NULL CHECK(nonprofit_version>0), amount_minor bigint NOT NULL CHECK(amount_minor>0),
 receipt jsonb NOT NULL, payload jsonb NOT NULL,
 recorded_at timestamptz NOT NULL,
 UNIQUE(actor_id,request_id),
 FOREIGN KEY(event_id,org_id) REFERENCES public.bz_events(id,org_id),
 FOREIGN KEY(nonprofit_id,event_id,org_id) REFERENCES public.bz_donation_nonprofits(id,event_id,org_id),
 CHECK(receipt->>'actorId'=actor_id::text AND receipt->>'requestId'=request_id::text
   AND receipt->>'status'='pending_staff_settlement' AND receipt->>'unit'='trade-dollar')
);
CREATE INDEX bz_donation_pledges_event_order ON public.bz_donation_pledges(event_id,recorded_at,id);

-- Remove inherited non-owner table AND column grants, not just PUBLIC defaults.
DO $$
DECLARE tab text; grantee_name text; columns text; privilege text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['bz_attendee_watches','bz_attendee_watch_requests','bz_donation_settings','bz_donation_nonprofits','bz_donation_pledges'] LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',tab);
  SELECT string_agg(quote_ident(attname),',') INTO columns FROM pg_attribute
   WHERE attrelid=('public.'||tab)::regclass AND attnum>0 AND NOT attisdropped;
  FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
   EXECUTE format('REVOKE %s(%s) ON public.%I FROM PUBLIC',privilege,columns,tab);
  END LOOP;
  FOR grantee_name IN
   SELECT DISTINCT r.rolname FROM pg_roles r WHERE r.oid IN (
    SELECT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
     WHERE c.oid=('public.'||tab)::regclass AND a.grantee<>c.relowner
    UNION SELECT a.grantee FROM pg_attribute col JOIN pg_class c ON c.oid=col.attrelid
     CROSS JOIN LATERAL aclexplode(col.attacl) a
     WHERE c.oid=('public.'||tab)::regclass AND a.grantee<>c.relowner)
  LOOP
   EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',tab,grantee_name);
   FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
    EXECUTE format('REVOKE %s(%s) ON public.%I FROM %I',privilege,columns,tab,grantee_name);
   END LOOP;
  END LOOP;
 END LOOP;
END $$;

-- Private helpers are owner-only. They use the existing authority rows and
-- conventional committed-state SHARE semantics; no new revocation gate.
CREATE FUNCTION public.bz_activity_authority(p_hash text,p_event uuid,p_staff boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor public.bz_people%ROWTYPE; e public.bz_events%ROWTYPE; org public.bz_orgs%ROWTYPE; error_code text;
BEGIN
 IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 SELECT p.* INTO actor FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.active AND p.is_test
  FOR SHARE OF s,p;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','UNAUTHENTICATED'); END IF;
 SELECT * INTO e FROM public.bz_events WHERE id=p_event FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
 SELECT * INTO org FROM public.bz_orgs WHERE id=e.org_id FOR SHARE;
 IF p_staff THEN
  PERFORM 1 FROM public.bz_staff_grants WHERE person_id=actor.id AND org_id=e.org_id AND active FOR SHARE;
 ELSE
  PERFORM 1 FROM public.bz_event_view_grants WHERE person_id=actor.id AND event_id=e.id AND active FOR SHARE;
 END IF;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
 error_code:=public.bz_activity_fresh(p_hash,p_event,actor.id,p_staff);
 IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
 RETURN jsonb_build_object('person',jsonb_build_object('id',actor.id,'name',actor.name),
  'event',jsonb_build_object('id',e.id,'name',e.draft->>'name'),
  'organization',jsonb_build_object('id',org.id,'name',org.name));
END $$;
CREATE FUNCTION public.bz_activity_fresh(p_hash text,p_event uuid,p_actor uuid,p_staff boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  WHERE s.token_hash=p_hash AND p.id=p_actor AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.active AND p.is_test)
 THEN RETURN 'UNAUTHENTICATED'; END IF;
 IF p_staff THEN
  IF NOT EXISTS(SELECT 1 FROM public.bz_staff_grants g JOIN public.bz_events e ON e.org_id=g.org_id
   WHERE g.person_id=p_actor AND e.id=p_event AND g.active) THEN RETURN 'FORBIDDEN'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.bz_event_view_grants WHERE person_id=p_actor AND event_id=p_event AND active)
  THEN RETURN 'FORBIDDEN'; END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION public.bz_attendee_activity(p_hash text,p_event uuid,p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE auth jsonb; actor uuid; release public.bz_catalog_approvals%ROWTYPE;
 key uuid; lot uuid; desired boolean; prior public.bz_attendee_watch_requests%ROWTYPE;
 packet jsonb; rows jsonb; error_code text; at timestamptz; phase text;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('watching','set','receipt','my-bids') OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
 THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
 IF (p_action='set' AND p_input-ARRAY['actorId','requestId','lotId','watching']<>'{}'::jsonb)
  OR (p_action='receipt' AND p_input-ARRAY['requestId']<>'{}'::jsonb)
  OR (p_action IN ('watching','my-bids') AND p_input<>'{}'::jsonb) THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
 auth:=public.bz_activity_authority(p_hash,p_event,false);
 IF auth ? 'error' THEN RETURN auth; END IF;
 actor:=(auth->'person'->>'id')::uuid;
 SELECT * INTO release FROM public.bz_catalog_approvals WHERE event_id=p_event FOR SHARE;
 IF p_action='set' THEN
  IF p_input->>'actorId' IS DISTINCT FROM actor::text THEN RETURN jsonb_build_object('error','ACTOR_CHANGED'); END IF;
  IF release.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
  key:=(p_input->>'requestId')::uuid; lot:=(p_input->>'lotId')::uuid;
  IF key IS NULL OR lot IS NULL OR jsonb_typeof(p_input->'watching') IS DISTINCT FROM 'boolean'
  THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
  desired:=(p_input->>'watching')::boolean;
  PERFORM pg_advisory_xact_lock(hashtextextended('bz:watch-request:'||actor::text||':'||key::text,0));
  SELECT * INTO prior FROM public.bz_attendee_watch_requests WHERE actor_id=actor AND request_id=key;
  error_code:=public.bz_activity_fresh(p_hash,p_event,actor,false);
  IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
  IF prior.request_id IS NOT NULL THEN
   IF prior.event_id<>p_event OR prior.payload<>p_input THEN RETURN jsonb_build_object('error','IDEMPOTENCY_CONFLICT'); END IF;
   RETURN prior.response||jsonb_build_object('replayed',true,'serverNow',clock_timestamp());
  END IF;
  PERFORM 1 FROM public.bz_catalog_lots WHERE approval_id=release.id AND lot_id=lot AND event_id=p_event FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bz:watch-lot:'||actor::text||':'||release.id::text||':'||lot::text,0));
  BEGIN
   at:=clock_timestamp();
   IF desired THEN
    INSERT INTO public.bz_attendee_watches(actor_id,event_id,org_id,release_id,lot_id,watched_at)
     VALUES(actor,p_event,release.org_id,release.id,lot,at)
     ON CONFLICT(actor_id,release_id,lot_id) DO UPDATE SET watched_at=EXCLUDED.watched_at;
   ELSE
    DELETE FROM public.bz_attendee_watches WHERE actor_id=actor AND release_id=release.id AND lot_id=lot;
   END IF;
   packet:=jsonb_build_object('watch',jsonb_build_object('eventId',p_event,'releaseId',release.id,
    'lotId',lot,'watching',desired,'updatedAt',at),'operation',jsonb_build_object('requestId',key));
   INSERT INTO public.bz_attendee_watch_requests(actor_id,request_id,event_id,payload,response)
    VALUES(actor,key,p_event,p_input,packet);
   error_code:=public.bz_activity_fresh(p_hash,p_event,actor,false);
   IF error_code IS NOT NULL THEN RAISE SQLSTATE 'PAM01'; END IF;
  EXCEPTION WHEN SQLSTATE 'PAM01' THEN RETURN jsonb_build_object('error',error_code);
  END;
  RETURN packet||jsonb_build_object('replayed',false,'serverNow',clock_timestamp());
 ELSIF p_action='receipt' THEN
  key:=(p_input->>'requestId')::uuid;
  SELECT * INTO prior FROM public.bz_attendee_watch_requests WHERE actor_id=actor AND request_id=key AND event_id=p_event;
  error_code:=public.bz_activity_fresh(p_hash,p_event,actor,false);
  IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
  IF prior.request_id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
  RETURN prior.response||jsonb_build_object('replayed',true,'serverNow',clock_timestamp());
 ELSIF p_action='watching' THEN
  SELECT coalesce(jsonb_agg(w.lot_id ORDER BY w.watched_at,w.lot_id),'[]'::jsonb) INTO rows
   FROM public.bz_attendee_watches w WHERE w.actor_id=actor AND w.event_id=p_event AND w.release_id=release.id;
  packet:=jsonb_build_object('eventId',p_event,'releaseId',release.id,'person',auth->'person','lotIds',rows);
 ELSE
  PERFORM 1 FROM public.bz_lot_standing WHERE release_id=release.id FOR SHARE;
  at:=clock_timestamp();
  phase:=CASE WHEN release.id IS NULL THEN 'draft' ELSE public.bz_catalog_phase(release.opens_at,release.closes_at,at) END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('receipt',r.receipt,
   'lot',jsonb_build_object('id',l.lot_id,'number',l.snapshot->>'number','title',l.snapshot->>'title'),
   'standing',jsonb_build_object('currentAmountMinor',s.current_amount_minor,
    'leadingBusiness',CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id',b.id,'name',b.name) END,
    'acceptedBidCount',coalesce(s.accepted_bid_count,0),'version',coalesce(s.version,0),
    'updatedAt',coalesce(s.updated_at,release.approved_at)),
   'recordedState',CASE WHEN r.receipt->>'status'='rejected' THEN 'rejected'
    WHEN s.leading_business_id::text=r.receipt->>'businessId' THEN CASE WHEN phase='closed' THEN 'closed-leading' ELSE 'leading' END
    ELSE CASE WHEN phase='closed' THEN 'closed-outbid' ELSE 'outbid' END END)
   ORDER BY r.receipt->>'decidedAt',r.request_id),'[]'::jsonb) INTO rows
   FROM public.bz_bid_receipts r JOIN public.bz_catalog_lots l
    ON l.approval_id=release.id AND l.lot_id=(r.receipt->>'lotId')::uuid
   LEFT JOIN public.bz_lot_standing s ON s.release_id=l.approval_id AND s.lot_id=l.lot_id
   LEFT JOIN public.bz_businesses b ON b.id=s.leading_business_id
   WHERE r.actor_id=actor AND r.receipt->>'eventId'=p_event::text AND r.receipt->>'releaseId'=release.id::text;
  packet:=jsonb_build_object('eventId',p_event,'releaseId',release.id,'person',auth->'person',
   'currency',CASE WHEN release.event_snapshot->>'version'='2' THEN 'SATURN_TRADE_DOLLAR_SYNTHETIC_V1' ELSE 'USD' END,
   'rulesetId',CASE WHEN release.event_snapshot->>'version'='2' THEN 'saturn-trade-tiered-v1' ELSE 'staging-usd-manual-v1' END,
   'scale',100,'phase',phase,'bids',rows);
 END IF;
 error_code:=public.bz_activity_fresh(p_hash,p_event,actor,false);
 IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
 RETURN packet||jsonb_build_object('serverNow',clock_timestamp());
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN RETURN jsonb_build_object('error','VALIDATION');
END $$;

-- The owner has resolved eligibility, but not product cap/availability. Each
-- event must explicitly configure those controls; there is no implicit policy.
CREATE FUNCTION public.bz_donation_eligible(p_actor uuid,p_event uuid,p_business uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.bz_business_person_memberships m
 JOIN public.bz_businesses b ON b.id=m.business_id
 JOIN public.bz_org_business_memberships n ON n.business_id=b.id
 JOIN public.bz_events e ON e.org_id=n.org_id
 JOIN public.bz_event_bidder_admissions a ON a.event_id=e.id AND a.person_id=m.person_id
 WHERE m.person_id=p_actor AND e.id=p_event AND b.id=p_business
 AND m.active AND m.can_bid AND b.active AND n.active AND a.active AND a.access='BID')
$$;
CREATE FUNCTION public.bz_donation_member(p_hash text,p_event uuid,p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE auth jsonb; actor uuid; org uuid; key uuid; business uuid; nonprofit uuid; destination_version integer;
 amount bigint; prior public.bz_donation_pledges%ROWTYPE; dest public.bz_donation_nonprofits%ROWTYPE;
 settings public.bz_donation_settings%ROWTYPE;
 businesses jsonb; destinations jsonb; packet jsonb; error_code text;
 at timestamptz; business_name text; pledge_id uuid; ready boolean; available boolean;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('context','submit','receipt') OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
 THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
 IF (p_action='submit' AND p_input-ARRAY['actorId','requestId','businessId','nonprofitId','nonprofitVersion','amountMinor']<>'{}'::jsonb)
  OR (p_action='receipt' AND p_input-ARRAY['requestId']<>'{}'::jsonb)
  OR (p_action='context' AND p_input<>'{}'::jsonb) THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
 auth:=public.bz_activity_authority(p_hash,p_event,false);
 IF auth ? 'error' THEN RETURN auth; END IF;
 actor:=(auth->'person'->>'id')::uuid; org:=(auth->'organization'->>'id')::uuid;
 IF p_action='context' THEN
  SELECT * INTO settings FROM public.bz_donation_settings WHERE event_id=p_event FOR SHARE;
  PERFORM 1 FROM public.bz_business_person_memberships m JOIN public.bz_businesses b ON b.id=m.business_id
   JOIN public.bz_org_business_memberships n ON n.business_id=b.id AND n.org_id=org
   WHERE m.person_id=actor AND m.active AND b.active AND n.active FOR SHARE OF m,b,n;
  PERFORM 1 FROM public.bz_event_bidder_admissions WHERE person_id=actor AND event_id=p_event FOR SHARE;
  at:=clock_timestamp();
  ready:=settings.amount_cap_minor IS NOT NULL AND settings.availability IS NOT NULL;
  available:=coalesce(settings.enabled,false) AND ready AND CASE settings.availability->>'mode'
   WHEN 'any-time' THEN true WHEN 'window' THEN at>=(settings.availability->>'opensAt')::timestamptz
    AND at<(settings.availability->>'closesAt')::timestamptz ELSE false END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,
    'canPledge',available AND public.bz_donation_eligible(actor,p_event,b.id)) ORDER BY b.name,b.id),'[]'::jsonb)
   INTO businesses FROM public.bz_business_person_memberships m JOIN public.bz_businesses b ON b.id=m.business_id
   JOIN public.bz_org_business_memberships n ON n.business_id=b.id AND n.org_id=org
   WHERE m.person_id=actor AND m.active AND b.active AND n.active;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'name',n.name,'description',n.description,'version',n.version) ORDER BY n.name,n.id),'[]'::jsonb)
   INTO destinations FROM public.bz_donation_nonprofits n WHERE n.event_id=p_event AND n.active;
  packet:=jsonb_build_object('event',auth->'event','organization',auth->'organization','person',auth->'person',
   'enabled',coalesce(settings.enabled,false),'businesses',businesses,'nonprofits',destinations,
   'unit','trade-dollar','scale',100,'amountCapMinor',settings.amount_cap_minor,'minimumMinor',1,
   'availability',settings.availability,'policyReady',ready,'availableNow',available,'serverNow',at);
 ELSE
  key:=(p_input->>'requestId')::uuid;
  IF key IS NULL THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
  IF p_action='submit' THEN
   IF p_input->>'actorId' IS DISTINCT FROM actor::text THEN RETURN jsonb_build_object('error','ACTOR_CHANGED'); END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('bz:donation-request:'||actor::text||':'||key::text,0));
  END IF;
  SELECT * INTO prior FROM public.bz_donation_pledges WHERE actor_id=actor AND request_id=key;
  error_code:=public.bz_activity_fresh(p_hash,p_event,actor,false);
  IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
  IF prior.id IS NOT NULL THEN
   IF p_action='receipt' THEN
    IF prior.event_id<>p_event THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
   ELSIF prior.event_id<>p_event OR prior.payload<>p_input THEN RETURN jsonb_build_object('error','IDEMPOTENCY_CONFLICT');
   END IF;
   RETURN jsonb_build_object('receipt',prior.receipt);
  END IF;
  IF p_action='receipt' THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
  business:=(p_input->>'businessId')::uuid; nonprofit:=(p_input->>'nonprofitId')::uuid;
  IF jsonb_typeof(p_input->'nonprofitVersion') IS DISTINCT FROM 'number' OR
   jsonb_typeof(p_input->'amountMinor') IS DISTINCT FROM 'number' OR
   p_input->>'nonprofitVersion' !~ '^[1-9][0-9]*$' OR p_input->>'amountMinor' !~ '^[1-9][0-9]*$'
  THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
  destination_version:=(p_input->>'nonprofitVersion')::integer; amount:=(p_input->>'amountMinor')::bigint;
  IF business IS NULL OR nonprofit IS NULL OR amount>9007199254740991 THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
  SELECT * INTO settings FROM public.bz_donation_settings WHERE event_id=p_event FOR SHARE;
  error_code:=public.bz_activity_fresh(p_hash,p_event,actor,false);
  IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
  IF NOT coalesce(settings.enabled,false) THEN RETURN jsonb_build_object('error','DONATIONS_DISABLED'); END IF;
  IF settings.amount_cap_minor IS NULL OR settings.availability IS NULL THEN RETURN jsonb_build_object('error','DONATION_POLICY_PENDING'); END IF;
  IF amount>settings.amount_cap_minor THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
  SELECT * INTO dest FROM public.bz_donation_nonprofits WHERE id=nonprofit AND event_id=p_event FOR SHARE;
  error_code:=public.bz_activity_fresh(p_hash,p_event,actor,false);
  IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
  IF dest.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
  IF NOT dest.active OR dest.version<>destination_version THEN RETURN jsonb_build_object('error','NONPROFIT_CHANGED'); END IF;
  SELECT b.name INTO business_name FROM public.bz_business_person_memberships m
   JOIN public.bz_businesses b ON b.id=m.business_id
   JOIN public.bz_org_business_memberships n ON n.business_id=b.id AND n.org_id=org
   JOIN public.bz_event_bidder_admissions a ON a.event_id=p_event AND a.person_id=actor
   WHERE m.person_id=actor AND b.id=business AND m.active AND m.can_bid AND b.active AND n.active AND a.active AND a.access='BID'
   FOR SHARE OF m,b,n,a;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
  -- These checks occur after all ownership/settings/destination/authority waits.
  at:=clock_timestamp(); error_code:=public.bz_activity_fresh(p_hash,p_event,actor,false);
  IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
  IF settings.availability->>'mode'='window' AND
   (at<(settings.availability->>'opensAt')::timestamptz OR at>=(settings.availability->>'closesAt')::timestamptz)
  THEN RETURN jsonb_build_object('error','DONATIONS_UNAVAILABLE'); END IF;
  BEGIN
   pledge_id:=gen_random_uuid();
   packet:=jsonb_build_object('id',pledge_id,'requestId',key,'eventId',p_event,'organizationId',org,
    'actorId',actor,'businessId',business,'actorName',auth->'person'->>'name','businessName',business_name,
    'nonprofit',jsonb_build_object('id',dest.id,'name',dest.name,'description',dest.description,'version',dest.version),
    'amountMinor',amount,'unit','trade-dollar','scale',100,'status','pending_staff_settlement','recordedAt',at);
   INSERT INTO public.bz_donation_pledges(id,actor_id,request_id,event_id,org_id,business_id,nonprofit_id,nonprofit_version,amount_minor,receipt,payload,recorded_at)
    VALUES(pledge_id,actor,key,p_event,org,business,nonprofit,destination_version,amount,packet,p_input,at);
   error_code:=public.bz_activity_fresh(p_hash,p_event,actor,false);
   IF error_code IS NULL AND NOT public.bz_donation_eligible(actor,p_event,business) THEN error_code:='FORBIDDEN'; END IF;
   IF error_code IS NULL AND settings.availability->>'mode'='window' AND
    clock_timestamp()>=(settings.availability->>'closesAt')::timestamptz THEN error_code:='DONATIONS_UNAVAILABLE'; END IF;
   IF error_code IS NOT NULL THEN RAISE SQLSTATE 'PAM01'; END IF;
  EXCEPTION WHEN SQLSTATE 'PAM01' THEN RETURN jsonb_build_object('error',error_code);
  END;
  RETURN jsonb_build_object('receipt',packet);
 END IF;
 error_code:=public.bz_activity_fresh(p_hash,p_event,actor,false);
 IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
 RETURN packet;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow
 THEN RETURN jsonb_build_object('error','VALIDATION');
END $$;

CREATE FUNCTION public.bz_donation_staff(p_hash text,p_event uuid,p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE auth jsonb; actor uuid; org uuid; key uuid; dest public.bz_donation_nonprofits%ROWTYPE;
 payload jsonb; packet jsonb; destinations jsonb; pledges jsonb; enabled boolean;
 settings public.bz_donation_settings%ROWTYPE; cap bigint; availability jsonb;
 error_code text; input_name text; input_description text; expected integer; requested_active boolean;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('read','settings','create','edit') OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
 THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
 IF (p_action='settings' AND p_input-ARRAY['enabled','amountCapMinor','availability']<>'{}'::jsonb)
  OR (p_action='create' AND p_input-ARRAY['requestId','name','description']<>'{}'::jsonb)
  OR (p_action='edit' AND p_input-ARRAY['nonprofitId','expectedVersion','name','description','active']<>'{}'::jsonb)
  OR (p_action='read' AND p_input<>'{}'::jsonb) THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
 auth:=public.bz_activity_authority(p_hash,p_event,true);
 IF auth ? 'error' THEN RETURN auth; END IF;
 actor:=(auth->'person'->>'id')::uuid; org:=(auth->'organization'->>'id')::uuid;
 IF p_action='read' THEN
  SELECT * INTO settings FROM public.bz_donation_settings WHERE event_id=p_event;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'version',version,'active',active) ORDER BY name,id),'[]'::jsonb)
   INTO destinations FROM public.bz_donation_nonprofits WHERE event_id=p_event;
  SELECT coalesce(jsonb_agg(receipt ORDER BY recorded_at,id),'[]'::jsonb) INTO pledges FROM public.bz_donation_pledges WHERE event_id=p_event;
  packet:=jsonb_build_object('event',auth->'event','enabled',coalesce(settings.enabled,false),'amountCapMinor',settings.amount_cap_minor,'availability',settings.availability,
   'minimumMinor',1,'policyReady',settings.amount_cap_minor IS NOT NULL AND settings.availability IS NOT NULL,
   'nonprofits',destinations,'pledges',pledges,'serverNow',clock_timestamp());
 ELSE
  IF p_action='settings' THEN
   IF jsonb_typeof(p_input->'enabled') IS DISTINCT FROM 'boolean' THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
   enabled:=(p_input->>'enabled')::boolean;
   PERFORM pg_advisory_xact_lock(hashtextextended('bz:donation-settings:'||p_event::text,0));
   SELECT * INTO settings FROM public.bz_donation_settings WHERE event_id=p_event FOR UPDATE;
   error_code:=public.bz_activity_fresh(p_hash,p_event,actor,true);
   IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
   cap:=settings.amount_cap_minor; availability:=settings.availability;
   IF p_input ? 'amountCapMinor' THEN
    IF p_input->'amountCapMinor'='null'::jsonb THEN cap:=NULL;
    ELSE
     IF jsonb_typeof(p_input->'amountCapMinor') IS DISTINCT FROM 'number' OR p_input->>'amountCapMinor' !~ '^[1-9][0-9]*$'
     THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
     cap:=(p_input->>'amountCapMinor')::bigint;
     IF cap>9007199254740991 THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
    END IF;
   END IF;
   IF p_input ? 'availability' THEN
    availability:=NULLIF(p_input->'availability','null'::jsonb);
    IF availability IS NOT NULL THEN
     IF availability=jsonb_build_object('mode','any-time') THEN NULL;
     ELSIF jsonb_typeof(availability)='object' AND availability->>'mode'='window'
      AND availability->>'opensAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$'
      AND availability->>'closesAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$'
      AND (availability->>'opensAt')::timestamptz<(availability->>'closesAt')::timestamptz
      AND availability - ARRAY['mode','opensAt','closesAt']='{}'::jsonb THEN NULL;
     ELSE RETURN jsonb_build_object('error','VALIDATION'); END IF;
    END IF;
   END IF;
   IF enabled AND (cap IS NULL OR availability IS NULL) THEN RETURN jsonb_build_object('error','DONATION_POLICY_PENDING'); END IF;
  ELSE
   input_name:=p_input->>'name'; input_description:=p_input->>'description';
   IF jsonb_typeof(p_input->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'description') IS DISTINCT FROM 'string' OR input_name IS NULL OR input_description IS NULL OR length(btrim(input_name))=0 OR length(input_name)>200 OR length(input_description)>5000
   THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
   IF p_action='create' THEN
    key:=(p_input->>'requestId')::uuid;
    IF key IS NULL THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
    payload:=jsonb_build_object('eventId',p_event,'name',input_name,'description',input_description);
    PERFORM pg_advisory_xact_lock(hashtextextended('bz:nonprofit-request:'||actor::text||':'||key::text,0));
    SELECT * INTO dest FROM public.bz_donation_nonprofits WHERE created_by=actor AND create_request_id=key FOR SHARE;
    error_code:=public.bz_activity_fresh(p_hash,p_event,actor,true);
    IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
    IF dest.id IS NOT NULL AND dest.create_payload<>payload THEN RETURN jsonb_build_object('error','IDEMPOTENCY_CONFLICT'); END IF;
   ELSE
    expected:=(p_input->>'expectedVersion')::integer;
    IF expected IS NULL OR expected<1 OR expected=2147483647 OR jsonb_typeof(p_input->'active') IS DISTINCT FROM 'boolean'
    THEN RETURN jsonb_build_object('error','VALIDATION'); END IF;
    requested_active:=(p_input->>'active')::boolean;
    SELECT * INTO dest FROM public.bz_donation_nonprofits WHERE id=(p_input->>'nonprofitId')::uuid AND event_id=p_event FOR UPDATE;
    error_code:=public.bz_activity_fresh(p_hash,p_event,actor,true);
    IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
    IF dest.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
    IF dest.version<>expected THEN RETURN jsonb_build_object('error','VERSION_CONFLICT'); END IF;
   END IF;
  END IF;
  error_code:=public.bz_activity_fresh(p_hash,p_event,actor,true);
  IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
  BEGIN
   IF p_action='settings' THEN
    INSERT INTO public.bz_donation_settings(event_id,org_id,enabled,amount_cap_minor,availability,updated_at)
     VALUES(p_event,org,enabled,cap,availability,clock_timestamp())
     ON CONFLICT(event_id) DO UPDATE SET enabled=EXCLUDED.enabled,amount_cap_minor=EXCLUDED.amount_cap_minor,
      availability=EXCLUDED.availability,updated_at=EXCLUDED.updated_at
      WHERE (public.bz_donation_settings.enabled,public.bz_donation_settings.amount_cap_minor,public.bz_donation_settings.availability)
       IS DISTINCT FROM (EXCLUDED.enabled,EXCLUDED.amount_cap_minor,EXCLUDED.availability);
    packet:=jsonb_build_object('enabled',enabled,'amountCapMinor',cap,'availability',availability,
     'minimumMinor',1,'policyReady',cap IS NOT NULL AND availability IS NOT NULL);
   ELSE
    IF p_action='create' AND dest.id IS NULL THEN
     INSERT INTO public.bz_donation_nonprofits(event_id,org_id,name,description,created_by,create_request_id,create_payload)
      VALUES(p_event,org,input_name,input_description,actor,key,payload) RETURNING * INTO dest;
    ELSIF p_action='edit' THEN
     UPDATE public.bz_donation_nonprofits SET name=p_input->>'name',description=p_input->>'description',
      active=(p_input->>'active')::boolean,version=version+1 WHERE id=dest.id RETURNING * INTO dest;
    END IF;
    packet:=jsonb_build_object('nonprofit',jsonb_build_object('id',dest.id,'name',dest.name,'description',dest.description,'version',dest.version)
     ||CASE WHEN p_action='edit' THEN jsonb_build_object('active',dest.active) ELSE '{}'::jsonb END);
   END IF;
   error_code:=public.bz_activity_fresh(p_hash,p_event,actor,true);
   IF error_code IS NOT NULL THEN RAISE SQLSTATE 'PAM01'; END IF;
  EXCEPTION WHEN SQLSTATE 'PAM01' THEN RETURN jsonb_build_object('error',error_code);
  END;
 END IF;
 error_code:=public.bz_activity_fresh(p_hash,p_event,actor,true);
 IF error_code IS NOT NULL THEN RETURN jsonb_build_object('error',error_code); END IF;
 RETURN packet;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN RETURN jsonb_build_object('error','VALIDATION');
END $$;

-- Strip inherited function EXECUTE defaults too. Install only the three named
-- entry points for the existing runtime identity after owner/search-path checks.
DO $$
DECLARE fn regprocedure; role_name text;
BEGIN
 FOREACH fn IN ARRAY ARRAY[
  'public.bz_activity_authority(text,uuid,boolean)'::regprocedure,
  'public.bz_activity_fresh(text,uuid,uuid,boolean)'::regprocedure,
  'public.bz_donation_eligible(uuid,uuid,uuid)'::regprocedure,
  'public.bz_attendee_activity(text,uuid,text,jsonb)'::regprocedure,
  'public.bz_donation_member(text,uuid,text,jsonb)'::regprocedure,
  'public.bz_donation_staff(text,uuid,text,jsonb)'::regprocedure] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn);
  FOR role_name IN SELECT DISTINCT r.rolname FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   JOIN pg_roles r ON r.oid=a.grantee WHERE p.oid=fn AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn,role_name);
  END LOOP;
 END LOOP;
END $$;
COMMIT;
