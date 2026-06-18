-- Relax events_needing_moat_enrich so URL-less events are eligible. 93% of
-- upcoming events have no ticket/website URL; the old selector required one, so
-- the agentic-enrich engine could never touch them. event-agentic-enrich now
-- discovers the official page via web search (DuckDuckGo) when no URL is stored,
-- so the selector no longer gates on a URL. Rank: upcoming first, then lowest
-- trust, then soonest — so user-facing thin events are enriched first.
CREATE OR REPLACE FUNCTION public.events_needing_moat_enrich(p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select e.id
  from public.events e
  where e.duplicate_of_id is null
    and (array_length(e.accessibility_attributes, 1) is null
         or array_length(e.target_groups, 1) is null)
    and coalesce(e.website, '') <> 'https://worldnakedbikeride.org'
    and not exists (
      select 1 from public.enrichment_log el
      where el.entity_id = e.id
        and el.step = 'agentic-enrich'
        and el.created_at > now() - interval '14 days'
    )
  order by (e.start_date >= now()) desc nulls last,
           coalesce(e.trust_score, 0) asc,
           e.start_date asc nulls last
  limit greatest(p_limit, 0);
$function$;
