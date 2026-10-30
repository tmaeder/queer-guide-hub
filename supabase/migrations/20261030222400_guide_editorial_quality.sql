-- Guide publication is an editorial decision, independent of the CMS sidecar.
-- Private trigger functions expose no new RPC or privileged data to readers.
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS selection_method text;
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;
ALTER TABLE public.guide_picks ADD COLUMN IF NOT EXISTS source_urls text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.guide_picks ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE OR REPLACE FUNCTION api_private.guide_publication_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api_private AS $$
DECLARE p record; target jsonb; target_table text; n integer := 0;
BEGIN
  IF NEW.status <> 'published' THEN RETURN NEW; END IF;
  IF length(btrim(coalesce(NEW.intro_md,''))) < 80 THEN
    RAISE EXCEPTION 'Guide needs an informative introduction before publication' USING ERRCODE='23514';
  END IF;
  IF NEW.format = 'quest' THEN
    IF NEW.starts_at IS NULL OR NEW.ends_at IS NULL OR NEW.criteria = '{}'::jsonb THEN
      RAISE EXCEPTION 'Quest needs a contribution window and criteria' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF length(btrim(coalesce(NEW.selection_method,''))) < 40 OR NEW.last_verified_at IS NULL
     OR NEW.last_verified_at > now() OR NEW.last_verified_at < now() - interval '90 days' THEN
    RAISE EXCEPTION 'Guide needs a selection method and sources checked within 90 days' USING ERRCODE='23514';
  END IF;
  FOR p IN SELECT * FROM public.guide_picks WHERE guide_id=NEW.id LOOP
    n := n+1;
    IF p.is_orphaned OR length(btrim(coalesce(p.rationale_md,''))) < 40
       OR cardinality(p.source_urls)=0 OR p.verified_at IS NULL
       OR p.verified_at > now() OR p.verified_at < now()-interval '90 days'
       OR EXISTS(SELECT 1 FROM unnest(p.source_urls) u WHERE u IS NULL OR u !~ '^https?://[^[:space:]]+$') THEN
      RAISE EXCEPTION 'Every pick needs a rationale, primary sources and recent verification' USING ERRCODE='23514';
    END IF;
    target_table := CASE p.entity_type WHEN 'venue' THEN 'venues' WHEN 'event' THEN 'events'
      WHEN 'marketplace' THEN 'marketplace_listings' WHEN 'city' THEN 'cities'
      WHEN 'country' THEN 'countries' WHEN 'queer_village' THEN 'queer_villages' END;
    IF target_table IS NULL THEN
      RAISE EXCEPTION 'Unsupported guide pick type: %',p.entity_type USING ERRCODE='23514';
    END IF;
    EXECUTE format('select to_jsonb(t) from public.%I t where id=$1',target_table) INTO target USING p.entity_id;
    IF target IS NULL OR (p.entity_type='marketplace' AND
      (target->>'overview_eligible' IS DISTINCT FROM 'true' OR target->>'availability'='out_of_stock')) THEN
      RAISE EXCEPTION 'Replace missing, ineligible or out-of-stock picks before publishing' USING ERRCODE='23514';
    END IF;
    IF p.entity_type='event' AND coalesce(target->>'end_date',target->>'start_date')::timestamptz < now()
       AND coalesce(NEW.meta->>'historical','false') <> 'true' THEN
      RAISE EXCEPTION 'Past events require an explicitly historical guide' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF n=0 THEN RAISE EXCEPTION 'Guide needs at least one verified recommendation' USING ERRCODE='23514'; END IF;
  IF NEW.format='guide' AND EXISTS (SELECT 1 FROM public.guide_picks WHERE guide_id=NEW.id AND tier IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM public.guide_picks WHERE guide_id=NEW.id AND tier='top') THEN
    RAISE EXCEPTION 'Tiered guide needs a main recommendation' USING ERRCODE='23514';
  END IF;
  NEW.published_at := coalesce(NEW.published_at,now());
  NEW.review_due_at := NEW.last_verified_at + CASE WHEN NEW.primary_entity_type='event' THEN interval '45 days' ELSE interval '90 days' END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION api_private.guide_publication_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guide_publication_guard BEFORE INSERT OR UPDATE OF status,title,dek,intro_md,selection_method,last_verified_at
ON public.guides FOR EACH ROW EXECUTE FUNCTION api_private.guide_publication_guard();

CREATE OR REPLACE FUNCTION api_private.guide_status_to_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  INSERT INTO public.cms_content_metadata(source_table,source_id,workflow_state,published_at)
  VALUES('guides',NEW.id,NEW.status::public.cms_workflow_state,NEW.published_at)
  ON CONFLICT(source_table,source_id) DO UPDATE SET workflow_state=excluded.workflow_state,
    published_at=excluded.published_at
  WHERE cms_content_metadata.workflow_state IS DISTINCT FROM excluded.workflow_state;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION api_private.guide_status_to_metadata() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guide_status_to_metadata AFTER INSERT OR UPDATE OF status ON public.guides
FOR EACH ROW EXECUTE FUNCTION api_private.guide_status_to_metadata();

CREATE OR REPLACE FUNCTION api_private.guide_metadata_to_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.source_table='guides' THEN
    IF NEW.workflow_state NOT IN ('draft','review','published','archived') THEN
      RAISE EXCEPTION 'Unsupported guide workflow state' USING ERRCODE='23514';
    END IF;
    UPDATE public.guides SET status=NEW.workflow_state::text WHERE id=NEW.source_id AND status IS DISTINCT FROM NEW.workflow_state::text;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION api_private.guide_metadata_to_status() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guide_metadata_to_status AFTER INSERT OR UPDATE OF workflow_state ON public.cms_content_metadata
FOR EACH ROW EXECUTE FUNCTION api_private.guide_metadata_to_status();

-- Existing public state is authoritative during reconciliation. Do not publish drafts.
INSERT INTO public.cms_content_metadata(source_table,source_id,workflow_state,published_at)
SELECT 'guides',id,status::public.cms_workflow_state,published_at FROM public.guides
ON CONFLICT(source_table,source_id) DO UPDATE SET workflow_state=excluded.workflow_state,published_at=excluded.published_at;

CREATE OR REPLACE FUNCTION api_private.guide_content_needs_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' AND to_jsonb(NEW)-'updated_at' IS NOT DISTINCT FROM to_jsonb(OLD)-'updated_at' THEN RETURN NEW; END IF;
  IF TG_OP <> 'DELETE' THEN
    UPDATE public.guides SET status=CASE WHEN status='published' THEN 'review' ELSE status END,
      last_verified_at=NULL,review_due_at=now() WHERE id=NEW.guide_id;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE public.guides SET status=CASE WHEN status='published' THEN 'review' ELSE status END,
      last_verified_at=NULL,review_due_at=now() WHERE id=OLD.guide_id AND (TG_OP='DELETE' OR OLD.guide_id IS DISTINCT FROM NEW.guide_id);
  END IF;
  RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION api_private.guide_content_needs_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guide_picks_need_review AFTER INSERT OR UPDATE OR DELETE ON public.guide_picks
FOR EACH ROW EXECUTE FUNCTION api_private.guide_content_needs_review();
CREATE TRIGGER guide_sections_need_review AFTER INSERT OR UPDATE OR DELETE ON public.guide_sections
FOR EACH ROW EXECUTE FUNCTION api_private.guide_content_needs_review();

CREATE OR REPLACE FUNCTION api_private.guide_marketplace_needs_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF (NEW.overview_eligible,NEW.availability,NEW.price,NEW.currency) IS DISTINCT FROM
     (OLD.overview_eligible,OLD.availability,OLD.price,OLD.currency) THEN
    UPDATE public.guides SET status=CASE WHEN status='published' THEN 'review' ELSE status END,
      last_verified_at=NULL,review_due_at=now()
    WHERE id IN (SELECT guide_id FROM public.guide_picks WHERE entity_type='marketplace' AND entity_id=NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION api_private.guide_marketplace_needs_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guide_marketplace_needs_review AFTER UPDATE OF overview_eligible,availability,price,currency ON public.marketplace_listings
FOR EACH ROW EXECUTE FUNCTION api_private.guide_marketplace_needs_review();
