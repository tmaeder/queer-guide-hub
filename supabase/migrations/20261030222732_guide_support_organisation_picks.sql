-- Support guides use accountable organisations instead of anonymous marketplace service entries.
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
      WHEN 'organization' THEN 'organizations' WHEN 'country' THEN 'countries' WHEN 'queer_village' THEN 'queer_villages' END;
    IF target_table IS NULL THEN
      RAISE EXCEPTION 'Unsupported guide pick type: %',p.entity_type USING ERRCODE='23514';
    END IF;
    EXECUTE format('select to_jsonb(t) from public.%I t where id=$1',target_table) INTO target USING p.entity_id;
    IF target IS NULL OR (p.entity_type='marketplace' AND
      (target->>'overview_eligible' IS DISTINCT FROM 'true' OR target->>'availability'='out_of_stock')) THEN
      RAISE EXCEPTION 'Replace missing, ineligible or out-of-stock picks before publishing' USING ERRCODE='23514';
    END IF;
    IF p.entity_type='organization' AND target->>'status' IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Support organisation must be active' USING ERRCODE='23514';
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
REVOKE ALL ON FUNCTION api_private.guide_publication_guard() FROM PUBLIC,anon,authenticated;
