-- The generic metadata sidecar also permits editors/moderators. It must not
-- grant them the admin-only guide write permission through a definer trigger.
CREATE OR REPLACE FUNCTION api_private.guide_metadata_to_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.source_table='guides' THEN
    IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_role_jwt('admin'),false) THEN
      RAISE EXCEPTION 'Admin role required to change guide publication' USING ERRCODE='42501';
    END IF;
    IF NEW.workflow_state NOT IN ('draft','review','published','archived') THEN
      RAISE EXCEPTION 'Unsupported guide workflow state' USING ERRCODE='23514';
    END IF;
    UPDATE public.guides SET status=NEW.workflow_state::text WHERE id=NEW.source_id AND status IS DISTINCT FROM NEW.workflow_state::text;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION api_private.guide_metadata_to_status() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION api_private.guide_target_needs_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_row jsonb:=to_jsonb(OLD); after_row jsonb:=to_jsonb(NEW); k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['name','title','description','address','city','status','review_status','closed_at','start_date','end_date','external_url'] LOOP
    IF after_row->k IS DISTINCT FROM before_row->k THEN
      UPDATE public.guides SET status=CASE WHEN status='published' THEN 'review' ELSE status END,
        last_verified_at=NULL,review_due_at=now()
      WHERE id IN (SELECT guide_id FROM public.guide_picks WHERE entity_type=TG_ARGV[0] AND entity_id=NEW.id);
      EXIT;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION api_private.guide_target_needs_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guide_venue_needs_review AFTER UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION api_private.guide_target_needs_review('venue');
CREATE TRIGGER guide_event_needs_review AFTER UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION api_private.guide_target_needs_review('event');
CREATE TRIGGER guide_organisation_needs_review AFTER UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION api_private.guide_target_needs_review('organization');
CREATE TRIGGER guide_product_facts_need_review AFTER UPDATE OF title,description,external_url ON public.marketplace_listings FOR EACH ROW EXECUTE FUNCTION api_private.guide_target_needs_review('marketplace');

-- Reuse the project's Postgres scheduler. Stale recommendations return to the
-- editorial queue instead of silently presenting old evidence as current.
SELECT cron.schedule('guide-editorial-review-due','20 * * * *',$job$
 UPDATE public.guides SET status='review',last_verified_at=NULL
 WHERE status='published' AND format<>'quest' AND review_due_at < now();
$job$);
