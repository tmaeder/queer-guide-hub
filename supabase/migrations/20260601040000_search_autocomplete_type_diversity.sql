-- search_autocomplete (the pg-backend typeahead RPC, used when SEARCH_BACKEND=pg)
-- returned a flat top-N by prefix/similarity, so the densest type (venues)
-- filled every slot — the same "typeahead only suggests venues" bug that was
-- fixed for the Meili path. Add a round-robin interleave: rank within each
-- entity_type, then order by that rank so the best of each type comes first,
-- then the seconds, etc. The frontend's per-type cap then renders a diverse mix.
-- Content-type-scoped calls (e.g. ['venue']) are unaffected (single partition).
-- Validated: "pride" -> venue/tag/event/personality/queer_village/news/
-- marketplace (was 1 tag + 9 venues); "berghain" -> Berghain venue #1.

create or replace function public.search_autocomplete(p_prefix text, p_content_types text[] default null::text[], p_limit integer default 8, p_now timestamp with time zone default now())
returns jsonb language sql stable security definer set search_path to 'public','extensions','pg_temp' as $function$
  with cand as (
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
  ),
  ranked as (
    select *, row_number() over (partition by entity_type order by is_prefix desc, sim desc, featured desc, title) as rn
    from cand
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'objectID', entity_id, 'type', entity_type, 'title', title,
    'city', city, 'country', country, 'slug', slug, 'imageUrl', image_url
  ) order by rn, is_prefix desc, sim desc, title), '[]'::jsonb)
  from (
    select * from ranked
    order by rn, is_prefix desc, sim desc, title
    limit greatest(p_limit, 0)
  ) z;
$function$;
