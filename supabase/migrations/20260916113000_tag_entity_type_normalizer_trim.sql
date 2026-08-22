-- Tag DQ follow-up: close two holes in the entity_type write normalizer shipped
-- in 20260916111000. Found by exercising the trigger on prod rather than by
-- asserting it exists:
--
--   'News_Article'    -> 'news'              (case was already handled)
--   '  news_article ' -> '  news_article '   HOLE: padding defeats the match
--   'Venues'          -> 'Venues'            HOLE: the else branch returns the
--                                            input verbatim, so an unmapped
--                                            value keeps whatever case it
--                                            arrived in -- and 'Venues' is a
--                                            NEW dirty spelling of a canonical
--                                            term, which is exactly the class
--                                            this trigger exists to prevent.
--
-- Fix: match on lower(btrim(...)) and let the else branch fall through to that
-- same normalized value instead of the raw input.
--
-- Safe on existing data: all 7 live entity_type values already equal
-- lower(btrim(entity_type)) (measured 2026-08-22, 137,504 rows), so this is
-- prophylactic only and rewrites nothing. No backfill needed, and therefore no
-- search-reindex churn.

create or replace function public.normalize_uta_entity_type()
returns trigger
language plpgsql
as $$
declare
  v_norm text := lower(btrim(coalesce(new.entity_type, '')));
begin
  new.entity_type := case v_norm
    when 'news_article'  then 'news'
    when 'venue'         then 'venues'
    when 'hotels'        then 'hotel'
    when 'personalities' then 'personality'
    when 'marketplace'   then 'marketplace_listing'
    when 'events'        then 'event'
    when 'cities'        then 'city'
    when 'countries'     then 'country'
    when 'queer_village' then 'village'
    when 'group'         then 'community_group'
    else v_norm
  end;
  return new;
end;
$$;

-- Trigger definition is unchanged (before insert or update of entity_type);
-- 20260916111000 already created it and create-or-replace keeps it bound.
