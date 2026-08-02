-- Auto-merge plural tags into their singular, safely.
--
-- 53 singular/plural pairs are both live in the active vocabulary:
--   gay-bar(1381)/gay-bars(6)  pub/pubs  sauna/saunas  family/families
--   brewery/breweries  drag-queen/drag-queens  hate-crime/hate-crimes
-- They split search facets, split /tags/* glossary pages, and split the
-- recommendation graph. Nothing has ever merged them: refresh_tag_merge_
-- candidates() and run_tag_auto_merge() exist but have NO cron row in
-- admin_automations and NO pg_cron job. Lifetime auto-merges: 1.
--
-- WHY run_tag_auto_merge IS NOT SIMPLY SCHEDULED
-- Its gate is tag_slugs_are_variants(a,b), which was:
--     position(a in b) > 0 OR position(b in a) > 0   -- substring
--  OR rtrim(a,'s') = rtrim(b,'s')                    -- strips ALL trailing s
--  OR extensions.levenshtein(a,b) <= 2               -- any 2-edit neighbour
-- Measured against the live queue, that returns TRUE for three pairs that are
-- three DIFFERENT concepts each:
--     market / marketplace        (substring)
--     big-brother / brother       (substring)
--     nantaimori / nyotaimori     (levenshtein = 2)
-- and the rtrim branch turns 'vampires' into the "singular" of 'vampiress'.
-- Putting that predicate on a nightly cron would have quietly destroyed the
-- vocabulary. It is replaced below with a plural-only rule.
--
-- CANONICAL DIRECTION IS THE SINGULAR, NOT THE POPULAR ONE.
-- refresh_tag_merge_candidates() picks canonical by usage_count. That is wrong
-- for this job: hate-crimes(387) would beat hate-crime(162) and we would
-- standardise on the plural. The singular always wins here.

-- ---------------------------------------------------------------------------
-- 1. Semantic denylist — pairs the morphology cannot know are different
-- ---------------------------------------------------------------------------
create table if not exists public.tag_plural_exclusions (
  singular_slug text not null,
  plural_slug   text not null,
  reason        text not null,
  created_at    timestamptz not null default now(),
  primary key (singular_slug, plural_slug)
);

comment on table public.tag_plural_exclusions is
  'Slug pairs that look like singular/plural but are distinct concepts. Rejecting a plural merge in admin inserts here.';

alter table public.tag_plural_exclusions enable row level security;
drop policy if exists tag_plural_exclusions_read on public.tag_plural_exclusions;
create policy tag_plural_exclusions_read on public.tag_plural_exclusions for select using (true);
grant select on public.tag_plural_exclusions to anon, authenticated;
grant all on public.tag_plural_exclusions to service_role;

-- Seeded from the dry run of tag_plural_pairs() against the live vocabulary.
-- Every entry is a pair where the singular is a kink/identity term and the
-- plural is unrelated TripAdvisor food or venue-amenity scrape noise that
-- happens to inflect the same way. Morphology cannot see the difference; only
-- reading the two tags' categories can.
insert into public.tag_plural_exclusions (singular_slug, plural_slug, reason) values
  ('tv',         'tvs',          'TV = transvestite in queer usage; TVs = televisions'),
  ('brat',       'brats',        'brat = BDSM role (Roles & Dynamics); brats = sausages'),
  ('glass',      'glasses',      'glass = material; glasses = eyewear'),
  ('meat',       'meats',        'meat = objectification role (Roles & Dynamics); meats = menu item'),
  ('strawberry', 'strawberries', 'strawberry = Sexual Roles slang; strawberries = menu item'),
  ('smoothie',   'smoothies',    'smoothie = Roles & Dynamics term; smoothies = drink'),
  ('pet',        'pets',         'pet = pet play (Power Exchange); pets = pets-allowed venue amenity'),
  ('family',     'families',     'family = hotel_vibe facet; families = audience facet — different silos')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. The strict predicate
-- ---------------------------------------------------------------------------
-- Compares DE-HYPHENATED slugs, mirroring the dedup_despace idiom used by the
-- entity merge cores. That is what lets night-club/nightclubs match (a genuine
-- duplicate that differs in both hyphenation and number) without opening the
-- substring hole: bigbrother vs brother still fails, market vs marketplace
-- still fails.
create or replace function public.tag_plural_of(p_singular text, p_plural text)
returns boolean
language sql immutable parallel safe
set search_path = public
as $$
  with n as (
    select replace(coalesce(p_singular,''), '-', '') s,
           replace(coalesce(p_plural,''),   '-', '') p
  )
  select case
    -- A "singular" that already ends in s is not a singular. Without this,
    -- 'vampires' + 's' = 'vampiress' reads as a plural pair.
    when s = '' or p = '' or right(s,1) = 's' then false
    -- Three characters is the floor: it keeps pub/pubs and dj/djs apart from
    -- two-letter initialisms, and it is what structurally excludes tv/tvs.
    when length(s) < 3 then false
    when s ~ '(x|z|ch|sh)$' then p = s || 'es'
    when s ~ '[^aeiou]y$'   then p = left(s, length(s) - 1) || 'ies'
    else p = s || 's'
  end
  from n;
$$;

-- Irregular English plurals. Suffix rules cannot reach these, and the list is
-- short enough to be exhaustive for a tag vocabulary.
create or replace function public.tag_plural_irregular(p_singular text, p_plural text)
returns boolean
language sql immutable parallel safe
set search_path = public
as $$
  select (replace(coalesce(p_singular,''),'-',''), replace(coalesce(p_plural,''),'-','')) in (
    ('person','people'), ('man','men'), ('woman','women'), ('child','children'),
    ('foot','feet'), ('tooth','teeth'), ('goose','geese'), ('mouse','mice'),
    ('life','lives'), ('wife','wives'), ('knife','knives'), ('leaf','leaves')
  );
$$;

-- tag_slugs_are_variants is the gate run_tag_auto_merge reads. Narrowing it to
-- "one is the plural of the other" removes the substring/levenshtein hazard
-- from that path too, not just from the new one.
create or replace function public.tag_slugs_are_variants(a text, b text)
returns boolean
language sql immutable parallel safe
set search_path = public
as $$
  select a is not null and b is not null and (
    a = b
    or public.tag_plural_of(a, b) or public.tag_plural_of(b, a)
    or public.tag_plural_irregular(a, b) or public.tag_plural_irregular(b, a)
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Candidate pairs
-- ---------------------------------------------------------------------------
create or replace function public.tag_plural_pairs(p_limit int default 500)
returns table (
  singular_id uuid, singular_slug text, singular_usage int,
  plural_id   uuid, plural_slug   text, plural_usage   int,
  rule text
)
language sql stable
set search_path = public
as $$
  -- DISTINCT ON (p.id): a plural can have more than one candidate singular
  -- once hyphens are folded away — 'drag-queens' matches both 'drag-queen' and
  -- 'dragqueen'. Without this the second candidate reaches merge_tag_concept
  -- after the plural is already merged and raises. Most-used singular wins.
  select distinct on (p.id)
         s.id, s.slug, s.usage_count, p.id, p.slug, p.usage_count,
         case when public.tag_plural_irregular(s.slug, p.slug) then 'irregular'
              when replace(s.slug,'-','') ~ '(x|z|ch|sh)$' then 'es'
              when replace(s.slug,'-','') ~ '[^aeiou]y$'   then 'ies'
              else 's' end
  from public.unified_tags s
  join public.unified_tags p
    on p.id <> s.id
   and p.status = 'active'
   and (public.tag_plural_of(s.slug, p.slug) or public.tag_plural_irregular(s.slug, p.slug))
  where s.status = 'active'
    -- human_reviewed is deliberately NOT a guard here. On this table it means
    -- "content reviewed" (it is what gates seo_indexable), and it was applied
    -- in bulk — 1,008 tags carry it from a single pass. Honouring it would
    -- silently drop 27 of the 61 real plural pairs, including sauna/saunas and
    -- hate-crime/hate-crimes. The channel for "a human decided these stay
    -- apart" is the two exclusion tables below, which ARE honoured. The runner
    -- also sets a non-'system:%' actor so log_unified_tag_change() permits the
    -- write rather than raising.
    and not exists (
      select 1 from public.tag_plural_exclusions e
      where e.singular_slug = s.slug and e.plural_slug = p.slug)
    and not exists (
      select 1 from public.tag_relationship_exclusions x
      where x.tag1_id = least(s.id, p.id) and x.tag2_id = greatest(s.id, p.id))
  order by p.id, coalesce(s.usage_count, 0) desc, length(s.slug)
  limit greatest(p_limit, 0);
$$;

-- ---------------------------------------------------------------------------
-- 4. The runner
-- ---------------------------------------------------------------------------
-- Delegates every write to merge_tag_concept(), which already rewrites tags[]
-- across 13 entity tables, reparents unified_tag_assignments and
-- tag_category_assignments, snapshots the pre-state into tag_merge_audit for
-- exact reversal via unmerge_tag_concept(), and recounts usage. No new merge
-- logic is introduced here.
create or replace function public.run_tag_plural_merge(
  p_limit int default 200,
  p_dry_run boolean default false
)
returns table (singular_slug text, plural_slug text, rule text, merged boolean, note text)
language plpgsql security definer
set search_path = public
as $$
declare r record; v_audit uuid;
begin
  perform public.assert_admin_or_internal();
  -- merge_tag_concept sets app.actor itself, but the cascade it triggers
  -- (recount, is_adult recompute) runs under whatever is set here. Anything
  -- matching 'system:%' makes log_unified_tag_change() raise on a curated row.
  perform set_config('app.actor', 'admin:tag-plural-merge', true);

  for r in select * from public.tag_plural_pairs(p_limit) loop
    if p_dry_run then
      singular_slug := r.singular_slug; plural_slug := r.plural_slug;
      rule := r.rule; merged := false; note := 'dry-run';
      return next;
      continue;
    end if;

    begin
      v_audit := public.merge_tag_concept(r.singular_id, r.plural_id, 'auto', 'auto:plural');

      -- merge_tag_concept records the absorbed slug as a generic 'synonym';
      -- label it for what it is so the alias table stays diagnosable.
      update public.tag_aliases
         set alias_type = 'plural'
       where alias_slug = r.plural_slug and canonical_tag_id = r.singular_id;

      -- The alias table is not a router. Without a redirect row /tags/pubs
      -- would 404 for everyone holding an old link.
      insert into public.tag_slug_redirects (old_slug, new_slug, tag_id)
      values (r.plural_slug, r.singular_slug, r.singular_id)
      on conflict (old_slug) do nothing;

      singular_slug := r.singular_slug; plural_slug := r.plural_slug;
      rule := r.rule; merged := true; note := v_audit::text;
    exception when others then
      singular_slug := r.singular_slug; plural_slug := r.plural_slug;
      rule := r.rule; merged := false; note := 'failed: ' || sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

revoke all on function public.run_tag_plural_merge(int, boolean) from public;
grant execute on function public.run_tag_plural_merge(int, boolean) to service_role;
grant execute on function public.tag_plural_pairs(int) to service_role, authenticated;
grant execute on function public.tag_plural_of(text, text) to anon, authenticated, service_role;
grant execute on function public.tag_plural_irregular(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Schedule
-- ---------------------------------------------------------------------------
-- 04:25 sits between recount_tag_usage (04:20) and tag_cooccurrence_relations
-- (04:40): usage counts are fresh when canonicals are chosen, and the relation
-- proposer afterwards sees the merged vocabulary.
--
-- The 200 cap is load-bearing, not cosmetic. Each merge rewrites tags[] on
-- entity rows, and those carry search_documents sync triggers; oversized tag
-- batches trip the statement timeout, and a timeout is a full rollback.
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values (
  'tag_plural_merge',
  'Tag plural auto-merge',
  'Merges plural tags into their singular via merge_tag_concept (reversible, audited in tag_merge_audit).',
  'system', true, '{"type":"schedule"}'::jsonb, '{}'::jsonb,
  jsonb_build_object('type','rpc','fn','run_tag_plural_merge','jobname','tag_plural_merge'),
  '25 4 * * *'
)
on conflict (slug) do update
  set schedule = excluded.schedule, action = excluded.action, enabled = excluded.enabled;

select cron.schedule('tag_plural_merge', '25 4 * * *',
  $cron$ select public.run_tag_plural_merge(200, false); $cron$);

-- ---------------------------------------------------------------------------
-- 6. Regression assertions — the false positives that motivated this migration
-- ---------------------------------------------------------------------------
do $$
begin
  -- MUST NOT match: these are the pairs the old predicate got wrong.
  if public.tag_slugs_are_variants('market', 'marketplace')      then raise exception 'market/marketplace must not be a variant'; end if;
  if public.tag_slugs_are_variants('big-brother', 'brother')     then raise exception 'big-brother/brother must not be a variant'; end if;
  if public.tag_slugs_are_variants('nantaimori', 'nyotaimori')   then raise exception 'nantaimori/nyotaimori must not be a variant'; end if;
  if public.tag_slugs_are_variants('vampires', 'vampiress')      then raise exception 'vampires/vampiress must not be a variant'; end if;
  if public.tag_slugs_are_variants('top', 'bottom')              then raise exception 'top/bottom must not be a variant'; end if;
  if public.tag_slugs_are_variants('gay', 'gray')                then raise exception 'gay/gray must not be a variant'; end if;
  if public.tag_plural_of('tv', 'tvs')                           then raise exception 'tv/tvs must fail the length floor'; end if;

  -- MUST match.
  if not public.tag_slugs_are_variants('pub', 'pubs')            then raise exception 'pub/pubs must be a variant'; end if;
  if not public.tag_slugs_are_variants('brewery', 'breweries')   then raise exception 'brewery/breweries must be a variant'; end if;
  if not public.tag_slugs_are_variants('night-club', 'nightclubs') then raise exception 'night-club/nightclubs must be a variant'; end if;
  if not public.tag_slugs_are_variants('gay-bar', 'gay-bars')    then raise exception 'gay-bar/gay-bars must be a variant'; end if;
  if not public.tag_slugs_are_variants('family', 'families')     then raise exception 'family/families must be a variant'; end if;
  if not public.tag_slugs_are_variants('church', 'churches')     then raise exception 'church/churches must be a variant'; end if;
  if not public.tag_slugs_are_variants('woman', 'women')         then raise exception 'woman/women must be a variant (irregular)'; end if;

  -- Symmetry: the gate is called with an arbitrary argument order.
  if public.tag_slugs_are_variants('pubs', 'pub') is distinct from public.tag_slugs_are_variants('pub', 'pubs') then
    raise exception 'tag_slugs_are_variants must be symmetric';
  end if;
end $$;
