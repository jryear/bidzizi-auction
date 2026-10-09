BEGIN;
-- Reviewed successor to 016: authority uses ordinary row SHARE locks, without
-- a global BEFORE STATEMENT gate. Zero-row/raw unrelated mutations cannot own
-- a global reader barrier. Uncommitted queued revokers have no special priority.
-- Keep authority-before-event/request/image order and all fresh final checks.
-- Apply together with the auth.ts successor; parent approval is still required.
DROP TRIGGER bz_asset_session_gate ON public.bz_sessions;
DROP TRIGGER bz_asset_person_gate ON public.bz_people;
DROP TRIGGER bz_asset_staff_grant_gate ON public.bz_staff_grants;
DROP TRIGGER bz_asset_view_grant_gate ON public.bz_event_view_grants;
DROP TRIGGER bz_asset_org_gate ON public.bz_orgs;
DROP FUNCTION public.bz_asset_authority_mutation_gate();

-- CREATE OR REPLACE preserves owner and existing EXECUTE ACLs. Only the global
-- gate acquisition differs from the three 016 definitions below.
CREATE OR REPLACE FUNCTION public.bz_staff_asset_put(
 p_hash text,p_event uuid,p_request uuid,p_source_mime text,p_source_size integer,
 p_source_hash text,p_bytes bytea,p_width integer,p_height integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; org uuid; existing public.bz_staff_assets%ROWTYPE;
 at timestamptz; count_event integer; count_org integer; bytes_org bigint;
 result jsonb; was_replay boolean;
BEGIN
 IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_event IS NULL OR p_request IS NULL
  OR p_source_mime IS NULL OR p_source_mime NOT IN ('image/jpeg','image/png','image/webp')
  OR p_source_size IS NULL OR p_source_size NOT BETWEEN 1 AND 2097152
  OR p_source_hash IS NULL OR p_source_hash !~ '^[a-f0-9]{64}$'
  OR p_bytes IS NULL OR octet_length(p_bytes) NOT BETWEEN 12 AND 1048576
  OR p_width IS NULL OR p_width NOT BETWEEN 1 AND 1600 OR p_height IS NULL OR p_height NOT BETWEEN 1 AND 1600
  OR substring(p_bytes FROM 1 FOR 4)<>decode('52494646','hex')
  OR substring(p_bytes FROM 9 FOR 4)<>decode('57454250','hex')
  OR get_byte(p_bytes,4)::bigint+get_byte(p_bytes,5)::bigint*256+
     get_byte(p_bytes,6)::bigint*65536+get_byte(p_bytes,7)::bigint*16777216<>octet_length(p_bytes)-8
 THEN RETURN jsonb_build_object('error','INVALID'); END IF;
 SELECT p.id INTO actor FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
 WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.active AND p.is_test
 FOR SHARE OF s,p;
 IF actor IS NULL THEN RETURN jsonb_build_object('error','DENIED'); END IF;
 PERFORM 1 FROM public.bz_staff_grants g JOIN public.bz_orgs o ON o.id=g.org_id
 WHERE g.person_id=actor AND g.active ORDER BY o.name,o.id FOR SHARE OF g,o;
 SELECT e.org_id INTO org FROM public.bz_events e WHERE e.id=p_event FOR SHARE;
 IF org IS NULL OR NOT EXISTS(SELECT 1 FROM public.bz_staff_grants g WHERE g.person_id=actor AND g.org_id=org AND g.active)
 THEN RETURN jsonb_build_object('error','DENIED'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bz-asset-request:'||actor||':'||p_event||':'||p_request,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('bz-asset-quota:'||org,0));
 at:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  JOIN public.bz_staff_grants g ON g.person_id=p.id JOIN public.bz_events e ON e.org_id=g.org_id
  WHERE s.token_hash=p_hash AND p.id=actor AND e.id=p_event AND e.org_id=org AND g.active
   AND s.revoked_at IS NULL AND s.expires_at>at AND p.active AND p.is_test)
 THEN RETURN jsonb_build_object('error','DENIED'); END IF;
 SELECT * INTO existing FROM public.bz_staff_assets
  WHERE uploaded_by=actor AND event_id=p_event AND request_id=p_request FOR SHARE;
 was_replay:=FOUND;
 BEGIN
 IF was_replay THEN
  IF existing.source_mime<>p_source_mime OR existing.source_size<>p_source_size OR existing.source_sha256<>p_source_hash
  THEN RETURN jsonb_build_object('error','CONFLICT'); END IF;
 ELSE
  SELECT count(*) INTO count_event FROM public.bz_staff_assets WHERE event_id=p_event;
  SELECT count(*),coalesce(sum(byte_length),0) INTO count_org,bytes_org FROM public.bz_staff_assets WHERE org_id=org;
  IF count_event>=256 OR count_org>=1024 OR bytes_org+octet_length(p_bytes)>268435456
  THEN RETURN jsonb_build_object('error','QUOTA'); END IF;
  INSERT INTO public.bz_staff_assets(event_id,org_id,uploaded_by,request_id,source_mime,source_size,
   source_sha256,normalization_version,mime,width,height,bytes)
  VALUES(p_event,org,actor,p_request,p_source_mime,p_source_size,p_source_hash,'raster-webp-v1',
   'image/webp',p_width,p_height,p_bytes) RETURNING * INTO existing;
 END IF;
 at:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  JOIN public.bz_staff_grants g ON g.person_id=p.id JOIN public.bz_events e ON e.org_id=g.org_id
  WHERE s.token_hash=p_hash AND p.id=actor AND e.id=p_event AND e.org_id=org AND g.active
   AND s.revoked_at IS NULL AND s.expires_at>at AND p.active AND p.is_test)
 THEN RAISE EXCEPTION 'Late image authority denial' USING ERRCODE='PBA05'; END IF;
 EXCEPTION WHEN SQLSTATE 'PBA05' THEN
  -- The subtransaction rolls back INSERT even when a direct SQL caller commits
  -- the surrounding transaction. Keep the existing JSON denial transport.
  RETURN jsonb_build_object('error','DENIED');
 END;
 result:=jsonb_build_object('ref','asset:'||existing.id,'eventId',existing.event_id,'requestId',existing.request_id,
  'mime',existing.mime,'width',existing.width,'height',existing.height,'byteLength',existing.byte_length,
  'sha256',existing.sha256,'createdAt',to_char(existing.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 RETURN jsonb_build_object('asset',result,'replayed',was_replay);
END $$;

CREATE OR REPLACE FUNCTION public.bz_staff_asset_recover(p_hash text,p_event uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; org uuid; asset public.bz_staff_assets%ROWTYPE; at timestamptz;
BEGIN
 IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_event IS NULL OR p_request IS NULL
 THEN RETURN jsonb_build_object('error','INVALID'); END IF;
 SELECT p.id INTO actor FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
 WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.active AND p.is_test
 FOR SHARE OF s,p;
 IF actor IS NULL THEN RETURN jsonb_build_object('error','DENIED'); END IF;
 PERFORM 1 FROM public.bz_staff_grants g JOIN public.bz_orgs o ON o.id=g.org_id
 WHERE g.person_id=actor AND g.active ORDER BY o.name,o.id FOR SHARE OF g,o;
 SELECT e.org_id INTO org FROM public.bz_events e WHERE e.id=p_event FOR SHARE;
 IF org IS NULL OR NOT EXISTS(SELECT 1 FROM public.bz_staff_grants g WHERE g.person_id=actor AND g.org_id=org AND g.active)
 THEN RETURN jsonb_build_object('error','DENIED'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bz-asset-request:'||actor||':'||p_event||':'||p_request,0));
 SELECT * INTO asset FROM public.bz_staff_assets WHERE uploaded_by=actor AND event_id=p_event
  AND org_id=org AND request_id=p_request FOR SHARE;
 at:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  JOIN public.bz_staff_grants g ON g.person_id=p.id JOIN public.bz_events e ON e.org_id=g.org_id
  WHERE s.token_hash=p_hash AND p.id=actor AND e.id=p_event AND e.org_id=org AND g.active
   AND s.revoked_at IS NULL AND s.expires_at>at AND p.active AND p.is_test)
 THEN RETURN jsonb_build_object('error','DENIED'); END IF;
 IF asset.id IS NULL THEN RETURN jsonb_build_object('error','MISSING'); END IF;
 RETURN jsonb_build_object('asset',jsonb_build_object('ref','asset:'||asset.id,'eventId',asset.event_id,
  'requestId',asset.request_id,'mime',asset.mime,'width',asset.width,'height',asset.height,
  'byteLength',asset.byte_length,'sha256',asset.sha256,
  'createdAt',to_char(asset.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
END $$;

CREATE OR REPLACE FUNCTION public.bz_staff_asset_read(
 p_hash text,p_event uuid,p_asset uuid,p_context text,p_binding uuid)
RETURNS TABLE(mime text,width integer,height integer,byte_length integer,sha256 text,bytes bytea)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; org uuid; event_row public.bz_events%ROWTYPE;
 approval public.bz_catalog_approvals%ROWTYPE; image public.bz_staff_assets%ROWTYPE;
 exposed boolean:=false; observed_at timestamptz;
BEGIN
 IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_event IS NULL OR p_asset IS NULL
  OR p_context IS NULL OR (p_context='saved' AND p_binding IS NOT NULL)
  OR (p_context<>'saved' AND p_binding IS NULL)
 THEN RAISE EXCEPTION 'Invalid image request' USING ERRCODE='PBA01'; END IF;
 SELECT p.id INTO actor FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
 WHERE s.token_hash=p_hash AND s.revoked_at IS NULL
  AND s.expires_at>clock_timestamp() AND p.active AND p.is_test FOR SHARE OF s,p;
 IF actor IS NULL THEN RAISE EXCEPTION 'Image session unavailable' USING ERRCODE='PBA02'; END IF;
 IF p_context='published' THEN
  PERFORM 1 FROM public.bz_event_view_grants g WHERE g.person_id=actor AND g.event_id=p_event
   AND g.active FOR SHARE;
 ELSE
  PERFORM 1 FROM public.bz_staff_grants g JOIN public.bz_orgs o ON o.id=g.org_id
   WHERE g.person_id=actor AND g.active ORDER BY o.name,o.id FOR SHARE OF g,o;
 END IF;
 SELECT * INTO event_row FROM public.bz_events e WHERE e.id=p_event FOR SHARE;
 IF event_row.id IS NULL THEN RAISE EXCEPTION 'Image unavailable' USING ERRCODE='PBA03'; END IF;
 org:=event_row.org_id;
 IF p_context='published' THEN
  IF NOT EXISTS(SELECT 1 FROM public.bz_event_view_grants g WHERE g.person_id=actor
   AND g.event_id=p_event AND g.active)
  THEN RAISE EXCEPTION 'Image unavailable' USING ERRCODE='PBA03'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.bz_staff_grants g WHERE g.person_id=actor
   AND g.org_id=org AND g.active)
  THEN RAISE EXCEPTION 'Image unavailable' USING ERRCODE='PBA03'; END IF;
 END IF;
 IF p_context='upload' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('bz-asset-request:'||actor||':'||p_event||':'||p_binding,0));
  SELECT * INTO image FROM public.bz_staff_assets a WHERE a.id=p_asset AND a.event_id=p_event
   AND a.org_id=org AND a.uploaded_by=actor AND a.request_id=p_binding FOR SHARE;
  exposed:=image.id IS NOT NULL;
 ELSIF p_context='saved' THEN
  exposed:=coalesce(event_row.draft->>'cover'='asset:'||p_asset,false) OR
   EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(event_row.draft->'sponsors','[]'::jsonb)) s
    WHERE s->>'logo'='asset:'||p_asset) OR
   EXISTS(SELECT 1 FROM public.bz_lots l WHERE l.event_id=p_event AND l.org_id=org
    AND l.data->>'image'='asset:'||p_asset);
 ELSIF p_context='staff-approved' OR p_context='published' THEN
  SELECT * INTO approval FROM public.bz_catalog_approvals a WHERE a.id=p_binding
   AND a.event_id=p_event AND a.org_id=org FOR SHARE;
  IF approval.id IS NOT NULL THEN
   observed_at:=clock_timestamp();
   IF p_context='staff-approved' OR
      (coalesce((approval.event_snapshot->>'version')::integer,1)=2
       OR observed_at>=approval.opens_at) THEN
    exposed:=coalesce(approval.event_snapshot->>'cover'='asset:'||p_asset,false) OR
     EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(approval.event_snapshot->'sponsors','[]'::jsonb)) s
      WHERE s->>'logo'='asset:'||p_asset) OR
     EXISTS(SELECT 1 FROM public.bz_catalog_lots l WHERE l.approval_id=approval.id
      AND l.snapshot->>'image'='asset:'||p_asset);
   END IF;
  END IF;
 END IF;
 IF NOT exposed THEN RAISE EXCEPTION 'Image unavailable' USING ERRCODE='PBA03'; END IF;
 IF p_context<>'upload' THEN
  SELECT * INTO image FROM public.bz_staff_assets a WHERE a.id=p_asset AND a.event_id=p_event
   AND a.org_id=org FOR SHARE;
 END IF;
 IF image.id IS NULL THEN RAISE EXCEPTION 'Image unavailable' USING ERRCODE='PBA03'; END IF;
 observed_at:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM public.bz_sessions s JOIN public.bz_people p ON p.id=s.person_id
  WHERE s.token_hash=p_hash AND p.id=actor AND s.revoked_at IS NULL
   AND s.expires_at>observed_at AND p.active AND p.is_test)
 THEN RAISE EXCEPTION 'Image session unavailable' USING ERRCODE='PBA02'; END IF;
 IF p_context='published' THEN
  IF NOT EXISTS(SELECT 1 FROM public.bz_event_view_grants g JOIN public.bz_events e ON e.id=g.event_id
   WHERE g.person_id=actor AND g.event_id=p_event AND g.active AND e.org_id=org)
  THEN RAISE EXCEPTION 'Image unavailable' USING ERRCODE='PBA03'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.bz_staff_grants g JOIN public.bz_events e ON e.org_id=g.org_id
   WHERE g.person_id=actor AND e.id=p_event AND e.org_id=org AND g.active)
  THEN RAISE EXCEPTION 'Image unavailable' USING ERRCODE='PBA03'; END IF;
 END IF;
 RETURN QUERY SELECT image.mime,image.width,image.height,image.byte_length,image.sha256,image.bytes;
END $$;
COMMIT;
