-- The first durable link claim still ranked the complete stale worklist before
-- LIMIT, so production timed out even for p_limit=2. Lock an index-ordered,
-- bounded pool first; domain fairness is then calculated only inside it.

CREATE OR REPLACE FUNCTION public.marketplace_claim_link_checks(
  p_limit integer DEFAULT 75,
  p_stale_days integer DEFAULT 30,
  p_claim_token uuid DEFAULT gen_random_uuid()
)
RETURNS TABLE(id uuid, external_url text, affiliate_url text, link_health text, link_broken_streak smallint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM public.marketplace_link_check_claims WHERE claimed_at < now() - interval '20 minutes';
  RETURN QUERY
  WITH preeligible AS MATERIALIZED (
    SELECT l.id,l.link_checked_at,
      coalesce(nullif(l.merchant_domain,''),nullif(l.source_type,''),'unknown') domain_key
    FROM public.marketplace_listings l
    WHERE l.status='active'
      AND (l.link_checked_at IS NULL OR l.link_checked_at < now()-make_interval(days=>greatest(1,p_stale_days)))
      AND (l.last_seen_at IS NULL OR l.last_seen_at < now()-make_interval(days=>greatest(1,p_stale_days)))
      AND NOT EXISTS (SELECT 1 FROM public.marketplace_link_check_claims c WHERE c.listing_id=l.id)
    ORDER BY l.link_checked_at ASC NULLS FIRST,l.id
    LIMIT greatest(500,least(p_limit*20,4000))
    FOR UPDATE OF l SKIP LOCKED
  ), eligible AS MATERIALIZED (
    SELECT p.id,p.link_checked_at,row_number() OVER(
      PARTITION BY p.domain_key ORDER BY p.link_checked_at ASC NULLS FIRST,p.id) domain_rank
    FROM preeligible p
  ), candidates AS MATERIALIZED (
    SELECT e.id FROM eligible e WHERE e.domain_rank<=10
    ORDER BY e.link_checked_at ASC NULLS FIRST,e.id
    LIMIT greatest(1,least(p_limit,200))
  ), claimed AS (
    INSERT INTO public.marketplace_link_check_claims(listing_id,claim_token)
    SELECT candidates.id,p_claim_token FROM candidates ON CONFLICT DO NOTHING
    RETURNING listing_id
  )
  SELECT l.id,l.external_url,l.affiliate_url,l.link_health,l.link_broken_streak
  FROM claimed c JOIN public.marketplace_listings l ON l.id=c.listing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_claim_link_checks(integer,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_claim_link_checks(integer,integer,uuid) TO service_role;
