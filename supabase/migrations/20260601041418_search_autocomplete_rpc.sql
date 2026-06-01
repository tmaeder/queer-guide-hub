-- §9.2 Postgres-native autocomplete. The search-proxy worker's /autocomplete is
-- the last endpoint still bound to Meilisearch; this RPC replaces it so Phase 5
-- (Meili decommission) is unblocked. Prefix-first (title ilike 'p%'), trigram
-- fuzzy fallback (title % p_prefix) for typo tolerance ("kitkt" → KitKatClub).
-- Filters out dead/cancelled/closed and past events; orders prefix > similarity >
-- featured. Index-backed (search_documents trigram + GIN); ~86ms on the live
-- corpus. Follow-up: wire workers/search-proxy handleAutocomplete to call this
-- under the pg backend.
create or replace function public.search_autocomplete(
  p_prefix text,
  p_content_types text[] default null::text[],
  p_limit int default 8,
  p_now timestamptz default now())
 returns jsonb
 language sql stable security definer set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'objectID', entity_id, 'type', entity_type, 'title', title,
    'city', city, 'country', country, 'slug', slug, 'imageUrl', image_url
  ) order by is_prefix desc, sim desc, featured desc, title), '[]'::jsonb)
  from (
    select entity_id, entity_type, title, city, country, slug, image_url,
           (title ilike p_prefix || '%') as is_prefix,
           similarity(title, p_prefix) as sim,
           is_featured as featured
    from public.search_documents
    where (p_content_types is null or entity_type = any(p_content_types))
      and title is not null and length(btrim(p_prefix)) >= 2
      and (title ilike p_prefix || '%' or title % p_prefix)
      and coalesce(liveness_status,'') not in ('dead','cancelled','dead_link')
      and closed_at is null
      and (entity_type <> 'event' or start_date is null or coalesce(end_date, start_date) >= p_now - interval '1 day')
    order by (title ilike p_prefix || '%') desc, similarity(title, p_prefix) desc, is_featured desc
    limit greatest(p_limit, 0)
  ) t;
$function$;

grant execute on function public.search_autocomplete(text, text[], int, timestamptz) to anon, authenticated, service_role;
