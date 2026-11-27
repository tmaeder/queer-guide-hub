-- Imports are proposals. Publication requires reviewed text and evidence.
ALTER TABLE public.personalities ALTER COLUMN visibility SET DEFAULT 'draft';

ALTER TABLE public.personality_claim_sources
  ADD COLUMN verified_value text,
  ADD COLUMN verified_identity jsonb,
  ADD COLUMN verified_source_url text,
  ADD COLUMN verified_language text,
  ADD COLUMN reviewed_by text,
  ADD COLUMN editorial_invalidated_txid text;

ALTER TABLE public.content_translations
  ADD COLUMN editorial_reviewed_by text,
  ADD COLUMN editorial_reviewed_at timestamptz,
  ADD COLUMN editorial_reviewed_value text,
  ADD COLUMN editorial_reviewed_identity jsonb;

CREATE OR REPLACE FUNCTION api_private.personality_editorial_identity(p jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('name', p->'name', 'wikidata_qid', p->'wikidata_qid', 'birth_date', p->'birth_date');
$$;
REVOKE ALL ON FUNCTION api_private.personality_editorial_identity(jsonb) FROM PUBLIC, anon, authenticated;

-- Snapshot existing approvals; never upgrade a pending or rejected claim.
-- Unknown legacy language stays unknown. This is not a new editorial review.
UPDATE public.personality_claim_sources c SET
  verified_value = to_jsonb(p)->>c.field_name,
  verified_identity = api_private.personality_editorial_identity(to_jsonb(p)),
  verified_source_url = s.source_url,
  verified_language = CASE WHEN s.source_slug LIKE 'editorial-batch-%'
    AND c.field_name IN ('description','bio','lgbti_details') THEN 'en' END,
  reviewed_by = coalesce(nullif(s.raw->>'reviewer',''), 'legacy-verification')
FROM public.personalities p, public.personality_sources s
WHERE c.personality_id=p.id AND c.source_id=s.id AND s.personality_id=p.id
  AND c.verification_status='verified'
  AND c.field_name IN ('description','bio','lgbti_details','lgbti_connection','profession','pronouns');

-- These sources were already published from exact-identity reviewed manifests.
UPDATE public.personality_sources SET raw=raw||jsonb_build_object('identity_match','exact')
WHERE source_slug LIKE 'editorial-batch-%';

UPDATE public.content_translations t SET
  source_hash=md5(coalesce(to_jsonb(p)->>t.field_name,'')), source_lang='en',
  editorial_reviewed_by='legacy-published', editorial_reviewed_at=t.updated_at,
  editorial_reviewed_value=t.value,
  editorial_reviewed_identity=api_private.personality_editorial_identity(to_jsonb(p))
FROM public.personalities p
WHERE t.table_name='personalities' AND t.record_id=p.id AND t.status='published';

CREATE OR REPLACE FUNCTION api_private.personality_editorial_claim_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.personalities%ROWTYPE; s public.personality_sources%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND OLD.verification_status='verified'
    AND ROW(OLD.personality_id,OLD.source_id,OLD.field_name) IS DISTINCT FROM ROW(NEW.personality_id,NEW.source_id,NEW.field_name) THEN
    RAISE EXCEPTION 'Revoke the original claim and create separate reviewed replacement evidence' USING ERRCODE='23514';
  END IF;
  IF NEW.verification_status<>'verified'
    OR NEW.field_name NOT IN ('description','bio','lgbti_details','lgbti_connection','profession','pronouns') THEN
    IF TG_OP<>'UPDATE' OR OLD.verification_status<>'verified' OR pg_trigger_depth()<2
      OR NEW.editorial_invalidated_txid IS DISTINCT FROM pg_current_xact_id()::text THEN
      NEW.editorial_invalidated_txid=NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='service_role' THEN
    RAISE EXCEPTION 'Automated services must submit pending personality evidence for editorial review' USING ERRCODE='23514';
  END IF;
  SELECT * INTO p FROM public.personalities WHERE id=NEW.personality_id;
  SELECT * INTO s FROM public.personality_sources WHERE id=NEW.source_id;
  IF p.id IS NULL OR s.personality_id IS DISTINCT FROM p.id
    OR nullif(btrim(NEW.verified_value),'') IS NULL
    OR NEW.verified_identity IS DISTINCT FROM api_private.personality_editorial_identity(to_jsonb(p))
    OR NEW.verified_source_url IS DISTINCT FROM s.source_url
    OR s.source_url !~ '^https://[^/[:space:]]+'
    OR s.raw->>'identity_match' IS DISTINCT FROM 'exact'
    OR nullif(btrim(s.raw->>'source_title'),'') IS NULL
    OR nullif(btrim(s.raw->>'reviewed_basis'),'') IS NULL
    OR nullif(btrim(NEW.reviewed_by),'') IS NULL OR NEW.checked_at IS NULL OR NEW.checked_at>now()+interval '1 minute'
    OR (NEW.field_name='lgbti_connection' AND (NEW.verified_value NOT IN ('community_member','activist','ally','representation')
      OR s.raw->>'connection_basis' IS DISTINCT FROM CASE NEW.verified_value WHEN 'community_member' THEN 'identity' WHEN 'activist' THEN 'activism'
        WHEN 'ally' THEN 'allyship' WHEN 'representation' THEN 'cultural_work' END))
    OR (NEW.field_name IN ('description','bio','lgbti_details') AND
      (NEW.verified_language IS DISTINCT FROM 'en' OR NEW.verified_value ~ '[A-Za-zÀ-ÖØ-öø-ÿ][А-Яа-яЁё]|[А-Яа-яЁё][A-Za-zÀ-ÖØ-öø-ÿ]')) THEN
    RAISE EXCEPTION 'Personality evidence needs an exact identity, reviewed value, language and reviewer'
      USING ERRCODE='23514';
  END IF;
  NEW.editorial_invalidated_txid=NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION api_private.personality_editorial_claim_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS personality_editorial_claim_guard ON public.personality_claim_sources;
CREATE TRIGGER personality_editorial_claim_guard BEFORE INSERT OR UPDATE ON public.personality_claim_sources
  FOR EACH ROW EXECUTE FUNCTION api_private.personality_editorial_claim_guard();

CREATE OR REPLACE FUNCTION api_private.personality_invalidate_stale_claims()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME='personalities' THEN
    UPDATE public.personality_claim_sources c SET verification_status='pending',editorial_invalidated_txid=pg_current_xact_id()::text
    WHERE c.personality_id=NEW.id AND c.verification_status='verified'
      AND c.field_name IN ('description','bio','lgbti_details','lgbti_connection','profession','pronouns')
      AND (c.verified_value IS DISTINCT FROM to_jsonb(NEW)->>c.field_name
        OR c.verified_identity IS DISTINCT FROM api_private.personality_editorial_identity(to_jsonb(NEW)));
  ELSE
    UPDATE public.personality_claim_sources c SET verification_status='pending',editorial_invalidated_txid=pg_current_xact_id()::text
    WHERE c.source_id=NEW.id AND c.verification_status='verified'
      AND c.field_name IN ('description','bio','lgbti_details','lgbti_connection','profession','pronouns');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION api_private.personality_invalidate_stale_claims() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS personality_invalidate_stale_claims ON public.personalities;
CREATE TRIGGER personality_invalidate_stale_claims AFTER UPDATE ON public.personalities
  FOR EACH ROW WHEN (ROW(OLD.name,OLD.wikidata_qid,OLD.birth_date,OLD.description,OLD.bio,OLD.lgbti_details,OLD.lgbti_connection,OLD.profession,OLD.pronouns)
    IS DISTINCT FROM ROW(NEW.name,NEW.wikidata_qid,NEW.birth_date,NEW.description,NEW.bio,NEW.lgbti_details,NEW.lgbti_connection,NEW.profession,NEW.pronouns))
  EXECUTE FUNCTION api_private.personality_invalidate_stale_claims();
DROP TRIGGER IF EXISTS personality_source_invalidate_stale_claims ON public.personality_sources;
CREATE TRIGGER personality_source_invalidate_stale_claims AFTER UPDATE ON public.personality_sources
  FOR EACH ROW WHEN (ROW(OLD.source_url,OLD.personality_id) IS DISTINCT FROM ROW(NEW.source_url,NEW.personality_id))
  EXECUTE FUNCTION api_private.personality_invalidate_stale_claims();

CREATE OR REPLACE FUNCTION api_private.personality_editorial_has_evidence(p jsonb, f text, require_language boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personality_claim_sources c
    JOIN public.personality_sources s ON s.id=c.source_id AND s.personality_id=(p->>'id')::uuid
    WHERE c.personality_id=(p->>'id')::uuid AND c.field_name=f AND c.verification_status='verified'
      AND c.verified_value IS NOT DISTINCT FROM p->>f
      AND c.verified_identity=api_private.personality_editorial_identity(p)
      AND c.verified_source_url=s.source_url AND s.source_url ~ '^https://[^/[:space:]]+'
      AND (NOT require_language OR c.verified_language='en')
  );
$$;
REVOKE ALL ON FUNCTION api_private.personality_editorial_has_evidence(jsonb,text,boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION api_private.personality_editorial_publication_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p jsonb; previous jsonb; f text; new_public boolean; identity_changed boolean;
BEGIN
  SELECT to_jsonb(x) INTO p FROM public.personalities x WHERE x.id=NEW.id;
  IF p IS NULL OR p->>'visibility'<>'public' OR p->>'duplicate_of_id' IS NOT NULL THEN RETURN NULL; END IF;
  previous=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  new_public=previous->>'visibility' IS DISTINCT FROM 'public' OR previous->>'duplicate_of_id' IS NOT NULL;
  identity_changed=api_private.personality_editorial_identity(p) IS DISTINCT FROM api_private.personality_editorial_identity(previous);
  IF length(btrim(coalesce(p->>'description',''))) NOT BETWEEN 120 AND 240
    OR length(btrim(coalesce(p->>'lgbti_details','')))<80
    OR coalesce(p->>'lgbti_connection','') NOT IN ('community_member','activist','ally','representation') THEN
    RAISE EXCEPTION 'Publish a personality only with a 120–240 character summary, community explanation and connection category'
      USING ERRCODE='23514';
  END IF;
  FOREACH f IN ARRAY ARRAY['description','lgbti_details','lgbti_connection'] LOOP
    IF NOT api_private.personality_editorial_has_evidence(p,f,
      f<>'lgbti_connection' AND (new_public OR identity_changed OR p->>f IS DISTINCT FROM previous->>f)) THEN
      RAISE EXCEPTION 'Personality publication needs current verified evidence for %',f USING ERRCODE='23514';
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['bio','profession','pronouns'] LOOP
    IF nullif(btrim(p->>f),'') IS NOT NULL
      AND (new_public OR identity_changed OR p->>f IS DISTINCT FROM previous->>f)
      AND NOT api_private.personality_editorial_has_evidence(p,f,f='bio') THEN
      RAISE EXCEPTION 'Personality publication needs current verified evidence for %',f USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION api_private.personality_editorial_publication_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS personality_editorial_publication_insert ON public.personalities;
CREATE CONSTRAINT TRIGGER personality_editorial_publication_insert AFTER INSERT ON public.personalities
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION api_private.personality_editorial_publication_guard();
DROP TRIGGER IF EXISTS personality_editorial_publication_update ON public.personalities;
CREATE CONSTRAINT TRIGGER personality_editorial_publication_update AFTER UPDATE ON public.personalities
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (ROW(OLD.visibility,OLD.duplicate_of_id,OLD.name,OLD.wikidata_qid,OLD.birth_date,OLD.description,OLD.bio,OLD.lgbti_details,OLD.lgbti_connection,OLD.profession,OLD.pronouns)
    IS DISTINCT FROM ROW(NEW.visibility,NEW.duplicate_of_id,NEW.name,NEW.wikidata_qid,NEW.birth_date,NEW.description,NEW.bio,NEW.lgbti_details,NEW.lgbti_connection,NEW.profession,NEW.pronouns))
  EXECUTE FUNCTION api_private.personality_editorial_publication_guard();

-- Evidence removal or URL reassignment must not strand a public explanation.
-- A reviewer may draft the profile in the same transaction before revoking proof.
CREATE OR REPLACE FUNCTION api_private.personality_editorial_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target uuid; p jsonb; f text; affected_field text;
BEGIN
  IF TG_TABLE_NAME='personality_claim_sources' THEN
    IF TG_OP='INSERT' AND NEW.verification_status<>'verified' THEN RETURN NULL; END IF;
    IF TG_OP='UPDATE' AND OLD.verification_status<>'verified' AND NEW.verification_status<>'verified' THEN RETURN NULL; END IF;
    IF TG_OP='DELETE' AND OLD.verification_status<>'verified' THEN RETURN NULL; END IF;
    target=CASE WHEN TG_OP='DELETE' THEN OLD.personality_id ELSE NEW.personality_id END;
    affected_field=CASE WHEN TG_OP='DELETE' THEN OLD.field_name ELSE NEW.field_name END;
  ELSE
    target=OLD.personality_id;
    IF NOT EXISTS (SELECT 1 FROM public.personality_claim_sources c WHERE c.source_id=OLD.id AND c.verification_status='verified') THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.personality_claim_sources c WHERE c.source_id=OLD.id AND c.field_name='bio' AND c.verification_status='verified') THEN affected_field='bio'; END IF;
  END IF;
  SELECT to_jsonb(x) INTO p FROM public.personalities x WHERE x.id=target;
  IF p IS NULL OR p->>'visibility'<>'public' OR p->>'duplicate_of_id' IS NOT NULL THEN RETURN NULL; END IF;
  FOREACH f IN ARRAY ARRAY['description','lgbti_details','lgbti_connection'] LOOP
    IF NOT api_private.personality_editorial_has_evidence(p,f,false) THEN
      RAISE EXCEPTION 'Draft the personality or provide reviewed replacement evidence before revoking %',f USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF affected_field='bio' AND nullif(btrim(p->>'bio'),'') IS NOT NULL
    AND NOT api_private.personality_editorial_has_evidence(p,'bio',false) THEN
    RAISE EXCEPTION 'Draft the personality or provide reviewed replacement biography evidence' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION api_private.personality_editorial_evidence_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS personality_editorial_evidence_guard ON public.personality_claim_sources;
CREATE CONSTRAINT TRIGGER personality_editorial_evidence_guard AFTER INSERT OR UPDATE OR DELETE ON public.personality_claim_sources
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION api_private.personality_editorial_evidence_guard();
DROP TRIGGER IF EXISTS personality_editorial_source_guard ON public.personality_sources;
CREATE CONSTRAINT TRIGGER personality_editorial_source_guard AFTER UPDATE ON public.personality_sources
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (ROW(OLD.source_url,OLD.personality_id) IS DISTINCT FROM ROW(NEW.source_url,NEW.personality_id))
  EXECUTE FUNCTION api_private.personality_editorial_evidence_guard();

CREATE OR REPLACE FUNCTION api_private.personality_translation_review_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE original text; identity_snapshot jsonb;
BEGIN
  IF NEW.table_name<>'personalities' OR NEW.status<>'published' THEN RETURN NEW; END IF;
  IF nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'='service_role' THEN
    RAISE EXCEPTION 'Automated services must submit draft personality translations for editorial review' USING ERRCODE='23514';
  END IF;
  SELECT to_jsonb(p)->>NEW.field_name,api_private.personality_editorial_identity(to_jsonb(p))
    INTO original,identity_snapshot FROM public.personalities p WHERE p.id=NEW.record_id;
  IF coalesce(NEW.language,'') NOT IN ('en','de','fr','it','es','pt','ru','ja','ko','zh','ar')
    OR coalesce(NEW.field_name,'') NOT IN ('description','bio','lgbti_details','profession','pronouns')
    OR original IS NULL OR NEW.source_hash IS DISTINCT FROM md5(original)
    OR NEW.editorial_reviewed_value IS DISTINCT FROM NEW.value
    OR NEW.editorial_reviewed_identity IS DISTINCT FROM identity_snapshot
    OR NEW.source_lang IS DISTINCT FROM 'en'
    OR nullif(btrim(NEW.editorial_reviewed_by),'') IS NULL OR NEW.editorial_reviewed_at IS NULL
    OR NEW.editorial_reviewed_at>now()+interval '1 minute'
    OR nullif(btrim(NEW.value),'') IS NULL
    OR NEW.value ~ '[A-Za-zÀ-ÖØ-öø-ÿ][А-Яа-яЁё]|[А-Яа-яЁё][A-Za-zÀ-ÖØ-öø-ÿ]'
    OR (NEW.language<>'en' AND NEW.field_name IN ('description','bio','lgbti_details') AND NEW.value=original) THEN
    RAISE EXCEPTION 'Personality translation must be reviewed in its language against the current English source'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION api_private.personality_translation_review_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS personality_translation_review_guard ON public.content_translations;
CREATE TRIGGER personality_translation_review_guard BEFORE INSERT OR UPDATE ON public.content_translations
  FOR EACH ROW EXECUTE FUNCTION api_private.personality_translation_review_guard();

CREATE OR REPLACE FUNCTION api_private.personality_draft_stale_translations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.content_translations t SET status='draft'
  WHERE t.table_name='personalities' AND t.record_id=NEW.id AND t.status='published'
    AND t.field_name IN ('description','bio','lgbti_details','profession','pronouns')
    AND (t.source_hash IS DISTINCT FROM md5(coalesce(to_jsonb(NEW)->>t.field_name,''))
      OR t.editorial_reviewed_identity IS DISTINCT FROM api_private.personality_editorial_identity(to_jsonb(NEW)));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION api_private.personality_draft_stale_translations() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS personality_draft_stale_translations ON public.personalities;
CREATE TRIGGER personality_draft_stale_translations AFTER UPDATE ON public.personalities
  FOR EACH ROW WHEN (ROW(OLD.name,OLD.wikidata_qid,OLD.birth_date,OLD.description,OLD.bio,OLD.lgbti_details,OLD.profession,OLD.pronouns)
    IS DISTINCT FROM ROW(NEW.name,NEW.wikidata_qid,NEW.birth_date,NEW.description,NEW.bio,NEW.lgbti_details,NEW.profession,NEW.pronouns))
  EXECUTE FUNCTION api_private.personality_draft_stale_translations();

COMMENT ON COLUMN public.personality_claim_sources.verified_value IS
  'Exact text approved by editorial review; changing profile text or identity invalidates its public evidence projection.';
COMMENT ON COLUMN public.content_translations.editorial_reviewed_by IS
  'Explicit personality translation review; automatic translation proposals stay draft.';

CREATE OR REPLACE FUNCTION api_private.personality_public_editorial(p_ids uuid[], p_lang text DEFAULT 'en')
RETURNS TABLE(personality_id uuid, connection text, details text, sources jsonb, translations jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id,
    CASE WHEN verified.connection_sources IS NOT NULL THEN p.lgbti_connection END,
    CASE WHEN verified.detail_sources IS NOT NULL THEN nullif(btrim(p.lgbti_details), '') END,
    coalesce(verified.connection_sources, '[]'::jsonb) || coalesce(verified.detail_sources, '[]'::jsonb),
    coalesce((
      SELECT jsonb_object_agg(ct.field_name, ct.value)
      FROM public.content_translations ct
      WHERE ct.table_name = 'personalities' AND ct.record_id = p.id
        AND ct.language = lower(split_part(replace(p_lang, '_', '-'), '-', 1))
        AND ct.status = 'published' AND nullif(btrim(ct.value), '') IS NOT NULL
        AND ct.source_hash=md5(coalesce(to_jsonb(p)->>ct.field_name,''))
        AND ct.editorial_reviewed_value=ct.value
        AND ct.editorial_reviewed_identity=api_private.personality_editorial_identity(to_jsonb(p))
        AND (ct.field_name IN ('description', 'bio', 'profession')
          OR (ct.field_name = 'lgbti_details' AND verified.detail_sources IS NOT NULL))
    ), '{}'::jsonb)
  FROM public.personalities p
  LEFT JOIN LATERAL (
    SELECT
      jsonb_agg(DISTINCT jsonb_build_object('url', s.source_url)) FILTER (WHERE c.field_name = 'lgbti_connection') AS connection_sources,
      jsonb_agg(DISTINCT jsonb_build_object('url', s.source_url)) FILTER (WHERE c.field_name = 'lgbti_details') AS detail_sources
    FROM public.personality_claim_sources c
    JOIN public.personality_sources s ON s.id = c.source_id AND s.personality_id = p.id
    WHERE c.personality_id = p.id AND c.verification_status = 'verified'
      AND s.source_url ~ '^https://[^/[:space:]]+'
      AND c.verified_value IS NOT DISTINCT FROM to_jsonb(p)->>c.field_name
      AND c.verified_identity=api_private.personality_editorial_identity(to_jsonb(p))
      AND c.verified_source_url=s.source_url
      AND c.field_name IN ('lgbti_connection', 'lgbti_details')
  ) verified ON true
  WHERE p.id = ANY(p_ids[1:100]) AND p.visibility = 'public'
    AND p.duplicate_of_id IS NULL;
$$;
REVOKE ALL ON FUNCTION api_private.personality_public_editorial(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_private.personality_public_editorial(uuid[], text) TO anon, authenticated, service_role;
