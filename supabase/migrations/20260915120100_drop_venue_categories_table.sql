-- Drop public.venue_categories — the fourth, disconnected category vocabulary.
--
-- Measured live 2026-08-21: 14 rows, ZERO foreign keys pointing at the table, no
-- *category_id* column on venues / venue_sources / hotels, and its slugs match the
-- canonical venues.category vocabulary (venues_category_check, 18 values) nowhere.
-- Its only writer was a dead path: import-tripadvisor-venues discards the id it
-- gets back from getOrCreateVenueCategory (destructured as `_categoryId`), which is
-- also how junk rows accrued ("Auto-created from TomTom import", "Health Care" with
-- a non-slug slug, "Political party" with a trailing-space slug 'party '). Its only
-- readers were the admin CMS vocabulary page and the vocab-merge picker, both
-- removed in the same PR.
--
-- Contents at drop time, for the record (name · slug · description):
--   Accommodation · accommodation · Hotels, B&Bs, and lodging facilities
--   Arts & Culture · arts-culture · Museums, galleries, theaters, and cultural venues
--   Beach · beach ·
--   Community Centers · community-centers · Community centers, libraries, and public spaces
--   Community Organizations · community-organizations · Auto-created from TomTom import
--   Entertainment & Nightlife · entertainment-nightlife · Clubs, bars, lounges, and entertainment venues
--   Health Care · "Health Care" ·
--   Park · park ·
--   Political party · "party " ·
--   Professional Services · professional-services · Legal, financial, consulting, and professional services
--   Restaurants & Dining · restaurants-dining · Restaurants, cafes, bars, and dining establishments
--   Retail & Shopping · retail-shopping · Stores, boutiques, and shopping centers
--   Spas, Saunas & Wellness · health-wellness · Gyms, spas, wellness centers, and health services
--   Toilet · toilet · Public restrooms and toilet facilities
--
-- The canonical vocabulary remains venues_category_check + src/lib/venueCategories.ts
-- (drift-tested). silo_fold_audit rows referencing folded venue_categories concepts
-- keep their plain-uuid silo_id — no FK, nothing breaks.

-- 1. The crosswalk view reads the table; recreate it without that branch.
--    (No security_invoker on the original; CREATE OR REPLACE preserves grants.)
create or replace view public.v_silo_concept_crosswalk as
with silo as (
  select 'venue_services'::text as silo, 'venue'::text as facet, id as silo_id, name,
         coalesce(slug, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi'))) as sl from public.venue_services where is_active
  union all
  select 'event_types','event', id, name, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi')) from public.event_types where is_active
  union all
  select 'event_amenities','event', id, name, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi')) from public.event_amenities where is_active
  union all
  select 'event_services','event', id, name, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi')) from public.event_services where is_active
  union all
  select 'accessibility_attributes','accessibility', id, name, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi')) from public.accessibility_attributes where is_active
  union all
  select 'target_groups','target_group', id, name, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi')) from public.target_groups where is_active
  union all
  select 'professions','person', id, name,
         coalesce(slug, lower(regexp_replace(trim(name),'[^a-z0-9]+','-','gi'))) from public.professions where is_active
)
select s.silo, s.facet, s.silo_id, s.name as silo_name, s.sl as derived_slug,
       u.id as tag_id, u.slug as tag_slug,
       case when u.id is not null then 'exact_slug' else 'unmapped' end as match_kind
from silo s
left join public.unified_tags u on u.slug = s.sl and u.status = 'active';

-- 2. merge_vocab_term: remove venue_categories from the vocabulary allowlist.
--    Body otherwise identical to 20260724224627.
CREATE OR REPLACE FUNCTION public.merge_vocab_term(p_vocab text, p_keep_id uuid, p_drop_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_has_slug boolean;
  v_keep_name text;
  v_drop_name text; v_drop_slug text; v_drop_active boolean;
  v_audit_id uuid;
begin
  if v_actor is not null and not exists (select 1 from public.user_roles where user_id = v_actor and role='admin') then
    raise exception 'forbidden: admin only';
  end if;
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  if p_vocab not in ('venue_services','event_types','event_amenities',
                     'event_services','accessibility_attributes','target_groups','professions') then
    raise exception 'unsupported vocabulary %', p_vocab;
  end if;

  v_has_slug := exists (select 1 from information_schema.columns
    where table_schema='public' and table_name=p_vocab and column_name='slug');

  execute format('select name from public.%I where id=$1', p_vocab) into v_keep_name using p_keep_id;
  if v_keep_name is null then raise exception 'keep term % not found in %', p_keep_id, p_vocab; end if;
  if v_has_slug then
    execute format('select name, slug, is_active from public.%I where id=$1', p_vocab)
      into v_drop_name, v_drop_slug, v_drop_active using p_drop_id;
  else
    execute format('select name, is_active from public.%I where id=$1', p_vocab)
      into v_drop_name, v_drop_active using p_drop_id;
  end if;
  if v_drop_name is null then raise exception 'drop term % not found in %', p_drop_id, p_vocab; end if;
  if v_drop_active is false then raise exception 'drop term % already merged/inactive', p_drop_id; end if;

  -- capture the dropped label(s) as survivor aliases (non-lossy), de-dup
  execute format('update public.%I set aliases = (select array_agg(distinct a) from unnest(aliases || $1) a where a is not null), updated_at = now() where id = $2', p_vocab)
    using array_remove(array[v_drop_name, v_drop_slug], null), p_keep_id;
  -- soft-deactivate the dropped row
  execute format('update public.%I set is_active = false, updated_at = now() where id = $1', p_vocab) using p_drop_id;

  insert into public.vocab_merge_audit (vocab, keep_id, drop_id, drop_name, drop_slug, drop_was_active, actor)
    values (p_vocab, p_keep_id, p_drop_id, v_drop_name, v_drop_slug, v_drop_active, v_actor)
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'vocab', p_vocab, 'keep_id', p_keep_id, 'drop_id', p_drop_id, 'alias_added', v_drop_name);
end; $function$;

-- 3. The table itself.
DROP TABLE IF EXISTS public.venue_categories;
