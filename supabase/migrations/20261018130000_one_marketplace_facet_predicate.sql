-- One predicate for "is this a marketplace facet", instead of three that
-- disagree.
--
-- The rule is old and settled: a tag in a marketplace attribute namespace
-- belongs to NO glossary category. Three functions ask that question and all
-- three spelled it differently, so they answered differently about the same
-- corpus. Measured on prod this morning:
--
--   tags_due_for_category   (work selection)   ->  7   full prefix list + entity_kind
--   tags_without_category   (reporting RPC)    -> 10   full prefix list, no kind
--   tag_hygiene_stats.uncategorized_active     -> 65   SEVEN prefixes, no kind
--
-- The 58-tag gap in the metric is not drift, it is two omissions. 55 of it is
-- `color-`, `size-`, `genre-` and `fit-`, which `20260926100300` added to the
-- attribute vocabulary and never added here — the metric has over-reported
-- ever since. The other 3 are `lace`, `denim`, `spandex`, the un-prefixed
-- twins that carry the namespace in `entity_kind` rather than in the slug.
--
-- I caused the last of those three spellings. 20261011100000 taught the
-- SELECTOR the prefix list and 20261012100000 taught it `entity_kind`, and
-- both left the reporting side behind — the same reporting-vs-selection split
-- those migrations existed to fix, reintroduced one function over. Extracting
-- the predicate is what stops a fourth spelling: there is now one place to
-- change when the vocabulary next grows, and `20260926100300`'s successor
-- cannot silently miss a caller.
--
-- IMMUTABLE and STRICT-safe: `entity_kind` is nullable, so the kind arm uses
-- IS DISTINCT FROM rather than `<>`, which would make a null-kind facet
-- invisible to the guard.
--
-- The metric DROPS 65 -> 7. check-tag-hygiene.mjs fails on growth, so a fall
-- needs no allowance, but the baseline is re-pointed in the same commit so
-- the improvement is locked in rather than left as headroom.

set local statement_timeout = '600s';

create or replace function public.is_marketplace_facet(
  p_slug text,
  p_entity_kind public.tag_entity_kind default null
)
returns boolean
language sql
immutable
parallel safe
set search_path to 'public'
as $facet$
  -- Two spellings of one fact: the slug namespace, and the entity_kind stamped
  -- on un-prefixed twins. Keep the prefix list in step with
  -- src/lib/marketplaceTaxonomy.ts and 20260926100300.
  select coalesce(p_slug, '') ~ '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-'
      or p_entity_kind is not distinct from 'attribute'::public.tag_entity_kind;
$facet$;

comment on function public.is_marketplace_facet(text, public.tag_entity_kind) is
  'True when a tag is a marketplace attribute facet and therefore belongs to no glossary category. THE single definition — tags_due_for_category, tags_without_category and tag_hygiene_stats.uncategorized_active all call this. Extend the prefix list here only.';

-- ── caller 1: work selection ────────────────────────────────────────────────
create or replace function public.tags_due_for_category(p_limit integer default 20, p_random boolean default false)
returns table(id uuid, name text, is_sensitive boolean, is_adult boolean)
language sql
stable
security definer
set search_path to 'public'
as $due$
  SELECT t.id, t.name, t.is_sensitive, t.is_adult
  FROM public.unified_tags t
  WHERE t.status = 'active'
    AND NOT public.is_marketplace_facet(t.slug, t.entity_kind)
    AND NOT EXISTS (SELECT 1 FROM public.tag_category_assignments a WHERE a.tag_id = t.id)
  ORDER BY
    CASE WHEN p_random THEN random() END,
    t.quality_score ASC NULLS FIRST, t.id
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$due$;

comment on function public.tags_due_for_category(integer, boolean) is
  'Work list for the category sweep: active tags with no assignment, excluding marketplace facets via is_marketplace_facet().';

-- ── caller 2: reporting ─────────────────────────────────────────────────────
create or replace function public.tags_without_category(p_limit integer default 200)
returns table(id uuid, slug text, name text, usage_count integer)
language sql
stable
set search_path to 'public'
as $without$
  select t.id, t.slug, t.name, t.usage_count
  from public.unified_tags t
  where t.status = 'active'
    and not public.is_marketplace_facet(t.slug, t.entity_kind)
    and not exists (select 1 from public.tag_category_assignments a where a.tag_id = t.id)
  order by coalesce(t.usage_count, 0) desc
  limit greatest(p_limit, 0);
$without$;

comment on function public.tags_without_category(integer) is
  'Reporting view of the category gap. Same predicate as tags_due_for_category via is_marketplace_facet() — the two must never disagree again.';

-- ── caller 3: the hygiene metric ────────────────────────────────────────────
-- Body copied verbatim from 20261012090400 with ONE predicate swapped, so no
-- other key changes value.
create or replace function public.tag_hygiene_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v jsonb;
begin
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  ),
  -- A short description shared by many tags is a bulk-import stamp, not a
  -- definition. See the header of 20261007163100.
  stamps as (
    select btrim(description) as d
      from unified_tags
     where description is not null
       and length(btrim(description)) between 1 and 40
     group by 1
    having count(*) > 5
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'active_tags', (select count(*) from active),
      'categories',  (select count(*) from tag_categories),
      'assignments', (select count(*) from unified_tag_assignments)
    ),
    'uncategorized_active', (
      select count(*) from active where category_id is null
        and not public.is_marketplace_facet(slug, entity_kind)),
    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),
    -- The junction is the source of truth; this counts rows where it says one
    -- thing and the denormalised column says nothing. Zero after 20261007163100.
    'denorm_category_missing', (
      select count(*) from unified_tags u
       where u.category_id is null
         and exists (select 1 from tag_category_assignments a where a.tag_id = u.id)),
    -- A bulk-import stamp published as a definition. Invisible to
    -- indexable_without_description, which only sees an EMPTY description.
    'placeholder_description_active', (
      select count(*) from active a
       where btrim(a.description) in (select d from stamps)),
    -- Zero-invariant since the 2026-08-28 photo retirement: tags render drawn
    -- TagPlates, and every image writer was removed. Non-zero means one is back.
    'active_tags_with_image_url', (
      select count(*) from active where image_url is not null),
    'assignment_to_non_active_tag', (
      select count(*) from unified_tag_assignments a
       where not exists (select 1 from active t where t.id = a.tag_id)),
    'nonclean_entity_type', (
      select count(*) from unified_tag_assignments
       where entity_type <> lower(btrim(entity_type))),
    'duplicate_active_name', (
      select count(*) from (
        select 1 from active group by lower(btrim(name)) having count(*) > 1) d),
    'redirect_to_non_canonical', (
      select count(*) from tag_slug_redirects r
        join unified_tags t on t.id = r.tag_id
       where t.status <> 'active' or t.merged_into_id is not null),
    'merged_but_not_status_merged', (
      select count(*) from unified_tags
       where merged_into_id is not null and status <> 'merged'),
    'sensitive_without_description', (
      select count(*) from active
       where (is_sensitive or is_adult)
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    'indexable_without_description', (
      select count(*) from active
       where seo_indexable
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    -- `not (A or B)` split into `not A and not B` so each arm can use its own
    -- functional index. Re-merging them into one OR silently restores the
    -- 4M-row nested loop that put this function over the PostgREST timeout.
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from events, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (select 1 from unified_tags u where lower(u.name) = e.s)
        and not exists (select 1 from unified_tags u where lower(u.slug) = e.s)),
    -- Drains to 0 as the cron works through the backlog. Non-zero after that
    -- means the job stopped running.
    'events_with_tags_unlinked', (
      select count(*) from events e
       where coalesce(array_length(e.tags, 1), 0) > 0
         and not exists (
           select 1 from unified_tag_assignments a
            where a.entity_id = e.id and a.entity_type = 'event')),
    -- ── 2026-08-29 glossary content-quality keys ─────────────────────────
    'alias_equals_name', (
      select count(*) from tag_aliases a
        join unified_tags t on t.id = a.canonical_tag_id
       where lower(a.alias_name) = lower(t.name)),
    'alias_mojibake', (
      select count(*) from tag_aliases
       where position(chr(65533) in alias_name) > 0),
    'refusal_prose_active', (
      select count(*) from active a
       where lower(btrim(coalesce(a.short_description, ''))) = 'no information available'
          or btrim(coalesce(a.long_description, '')) ~* '^there is no information available'),
    'unreviewed_typed_alias', (
      select count(*) from tag_aliases a
        join unified_tags t on t.id = a.canonical_tag_id
       where a.alias_type <> 'multilingual'
         and a.review_status = 'auto'
         and t.status = 'active'),
    'relations_pending_review', (
      select count(*) from tag_relations
       where review_status = 'pending'
          or (review_status = 'auto' and relation_type = 'related')),
    'prose_unreviewed', (
      select count(*) from active
       where description is not null and prose_reviewed_at is null)
  ) into v;

  return v;
end;
$function$;

do $verify$
declare v_sel int; v_rep int; v_met int;
begin
  select count(*) into v_sel from public.tags_due_for_category(500, false);
  select count(*) into v_rep from public.tags_without_category(500);
  v_met := (public.tag_hygiene_stats()->>'uncategorized_active')::int;

  -- The whole point: three questions, one answer. Reporting counts tags with
  -- no ASSIGNMENT and the metric counts tags with no category_id, so they can
  -- differ legitimately — but neither may exceed the other by a facet.
  if v_sel <> v_rep then
    raise exception 'facet predicate: selector says % and reporting says %', v_sel, v_rep;
  end if;
  if v_met > v_rep then
    raise exception 'facet predicate: metric % exceeds reporting % — a facet is still counted', v_met, v_rep;
  end if;

  -- And no facet may be offered as work by any of them.
  if exists (
    select 1 from public.tags_due_for_category(500, false) d
    join public.unified_tags t on t.id = d.id
    where public.is_marketplace_facet(t.slug, t.entity_kind)) then
    raise exception 'facet predicate: selector still offers a marketplace facet';
  end if;

  raise notice 'facet predicate: selector %, reporting %, metric %', v_sel, v_rep, v_met;
end $verify$;
