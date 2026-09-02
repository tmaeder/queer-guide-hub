-- Tag slug seal: a name-derived slug wins when, and ONLY when, the name is non-ASCII.
--
-- The fault: source-tags-extract computes its own slug with
--   name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
-- which never transliterates, so 'ü' falls into the character class and becomes
-- '-': "Bühne" -> "b-hne". It then hands that slug to upsert({onConflict:'slug'}),
-- and the caller-supplied slug beats both triggers:
--   * normalize_tag_input() only re-derives from the name when the slug is
--     NULL/empty (or, on UPDATE, when the name changed);
--   * unified_tags_normalize_slug() does normalize_tag_slug(coalesce(NEW.slug,
--     NEW.name)) -- slug first.
-- 9 active rows carry lossy slugs from this (b-hne, preistr-ger, nonbin-r,
-- sch-neberg, kirsten-pl-tz, m-nchen), all created AFTER 20260802104650 added
-- the transliterating normalize_tag_slug() that was supposed to have fixed it.
-- normalize_tag_slug('Prüfung') already returns 'prufung'; the input just never
-- reached it.
--
-- WHY THE CONDITION IS NARROW -- do not widen this to "always derive from the
-- name". public.unified_tags serves FOUR vocabularies at once and names are not
-- unique in it, only slugs are. The marketplace facets (mat-, vibe-, occ-,
-- color-, genre-) and the news taxonomy (news-) are deliberate namespace
-- prefixes carried in the slug and NOT in the name. A blanket rule would rename
-- mat-silicone -> silicone (4,643 uses), news-education -> education (691), and
-- would collapse occ-pride and news-pride -- two DIFFERENT tags that share the
-- name "Pride" -- onto one slug. Every one of those prefixes sits on a pure
-- ASCII name, which is exactly what makes them unreachable from this branch.
--
-- `[^\x00-\x7F]` matches ANY non-ASCII codepoint, so typographic punctuation
-- (’ – —) trips it too, not only Latin diacritics. That makes "every namespaced
-- tag carries a pure-ASCII name" a MEASURED property of today's data rather than
-- something the character class enforces -- which is why part 1 asserts it at
-- apply time instead of trusting this paragraph.
--
-- THE SEAL CANNOT SHIP ALONE -- the repair below must be in this same migration.
-- source-tags-extract upserts with {onConflict:'slug', ignoreDuplicates:true},
-- and Postgres evaluates the ON CONFLICT arbiter AFTER the BEFORE-INSERT
-- triggers. Today "Bühne" arrives with slug b-hne, the arbiter finds the
-- existing b-hne row and does nothing. With the seal and a stale row still
-- holding b-hne, the trigger rewrites NEW.slug to buhne, the arbiter finds
-- nothing, and a SECOND row is inserted -- a twin carrying 0 usages while the
-- orphan keeps its own. The window between two migrations is exactly one Sunday
-- cron (0 5 * * 0), so the repair is not a follow-up.
--
-- Signature and search_path below are byte-identical to the live function
-- (verified against pg_get_functiondef on prod). No CREATE TRIGGER: the trigger
-- trg_unified_tags_normalize_slug already exists and points at this function.

CREATE OR REPLACE FUNCTION public.unified_tags_normalize_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
BEGIN
  IF NEW.name IS NOT NULL AND NEW.name ~ '[^\x00-\x7F]' THEN
    -- A caller has no business hand-slugging a diacritic name.
    NEW.slug := normalize_tag_slug(NEW.name);
  ELSE
    NEW.slug := normalize_tag_slug(coalesce(NEW.slug, NEW.name));
  END IF;

  IF NEW.slug = '' OR NEW.slug IS NULL THEN
    NEW.slug := encode(digest(coalesce(NEW.name, NEW.id::text), 'sha1'), 'hex');
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Part 1. Materialise the candidate set ONCE, then guard it.
-- ---------------------------------------------------------------------------
-- Every arm below joins this table. An earlier draft restated the predicate in
-- the cap, the merge arm and the rename arm -- four copies -- so the cap bounded
-- a query that merely RESEMBLED the arms: dropping `name ~ '[^\x00-\x7F]'` from
-- the rename arm alone would have left the cap reading 11, passing, and the
-- rename touching 115 rows including mat-silicone. One predicate, one place.
create temp table _slug_repair_candidates on commit drop as
select t.id,
       t.slug                                as old_slug,
       t.name,
       public.normalize_tag_slug(t.name)     as want,
       t.status,
       coalesce(t.usage_count, 0)            as uses
  from public.unified_tags t
 where t.status <> 'merged'
   -- This term is load-bearing. Without it the rest of the predicate matches
   -- 115 active rows, 106 of them deliberate namespace prefixes.
   and t.name ~ '[^\x00-\x7F]'
   and t.slug is distinct from public.normalize_tag_slug(t.name);

do $do$
declare
  v_n int; v_named int; v_tbl text; v_hits int; v_blocked text;
  v_tables text[] := array['venues','news_articles','personalities','events','festivals',
                           'hotels','milestones','organizations','queer_villages',
                           'community_groups','community_posts','cms_content','cms_pages'];
begin
  select count(*) into v_n from _slug_repair_candidates;
  if v_n > 60 then
    raise exception 'tag slug repair matched % rows (expected ~11, cap 60) -- refusing to run', v_n;
  end if;
  raise notice 'tag slug repair: % candidate rows', v_n;

  -- (1a) No candidate may be a namespaced facet. This is the cap's real teeth:
  -- it bounds the SET the arms consume, not a lookalike query.
  select count(*) into v_named from _slug_repair_candidates
   where old_slug ~ '^(mat|vibe|occ|color|genre|news|intimate)-';
  if v_named > 0 then
    raise exception '% namespaced tags are in the repair set -- refusing to rename a facet', v_named;
  end if;

  -- (1b) And the seal's own premise: no namespaced tag carries a non-ASCII name.
  select count(*) into v_named
    from public.unified_tags
   where status <> 'merged'
     and name ~ '[^\x00-\x7F]'
     and slug ~ '^(mat|vibe|occ|color|genre|news|intimate)-';
  if v_named > 0 then
    raise exception '% namespaced tags carry a non-ASCII name -- the seal would rename them', v_named;
  end if;

  -- (1c) Renames do not rewrite entity tags[] arrays. On 2026-09-02 that was
  -- safe because ZERO rows in any of the 13 tag-bearing tables carried one of
  -- these slugs -- but source-tags-extract runs `0 5 * * 0` and can write
  -- between that measurement and this apply, so the measurement is re-taken
  -- here rather than trusted. Same 13-table array merge_tag_concept uses.
  foreach v_tbl in array v_tables loop
    execute format(
      'select count(*) from %I e join _slug_repair_candidates c on c.old_slug = any(e.tags)', v_tbl)
      into v_hits;
    if v_hits > 0 then
      raise exception '% rows in %I carry a slug this migration renames -- tags[] would be orphaned',
        v_hits, v_tbl;
    end if;
  end loop;

  -- (1d) A candidate whose corrected slug is held by a MERGED row falls through
  -- both arms: the merge arm requires o.status <> 'merged', and the rename arm's
  -- NOT EXISTS sees the row and skips it. It would then die at the terminal
  -- assertion with a message naming a count, not a cause. Name it here instead.
  select string_agg(format('%s -> %s (held by merged %s)', c.old_slug, c.want, o.slug), ', ')
    into v_blocked
    from _slug_repair_candidates c
    join public.unified_tags o on o.slug = c.want and o.id <> c.id
   where o.status = 'merged';
  if v_blocked is not null then
    raise exception 'corrected slug is held by a merged row, so neither arm can act: %', v_blocked;
  end if;

  -- (1e) merge_tag_concept repoints unified_tag_assignments onto the canonical.
  -- Where that canonical is not active, the assignments land on a non-active tag
  -- and tag_hygiene_stats().assignment_to_non_active_tag -- a zero-invariant
  -- hard gate with NO baseline allowance -- grows. The header claims both sides
  -- of every pair are 0-usage; this checks it instead of claiming it.
  select count(*) into v_n
    from _slug_repair_candidates c
    join public.unified_tags o on o.slug = c.want and o.id <> c.id
    join public.unified_tag_assignments a on a.tag_id = c.id
   where o.status <> 'merged' and o.status <> 'active';
  if v_n > 0 then
    raise exception
      '% assignments would be repointed onto a non-active canonical (assignment_to_non_active_tag is a zero-invariant)', v_n;
  end if;
end $do$;

-- ---------------------------------------------------------------------------
-- Part 2. The repair.
-- ---------------------------------------------------------------------------
-- Measured on prod 2026-09-02: 21 rows disagree with normalize_tag_slug(name),
-- of which 10 are status='merged' and are excluded from the candidate set --
-- their slug is the redirect trail pointing at the canonical tag, so rewriting
-- it breaks the lookup it exists to serve. That exclusion is also what makes the
-- two collisions flagged in review harmless: the merged `attila-h-rbiger` and
-- both merged `Müllerian` rows are never touched, so they cannot collide with
-- their active twins.
--
-- Of the 11 candidates, 4 collide with an existing tag and 7 rename cleanly.
-- All four collision pairs are TWIN-NAMED (identical `name`, differing only in
-- slug), which forces three things:
--
-- (a) Direction is not a choice. merge_tag_concept leaves the loser's slug on
--     the loser as its redirect trail, so a corrected slug can never be freed
--     by merging the other way. The corrupt row must be the one that dies.
--     For `Kirsten Plötz` and `Preisträger` that absorbs an ACTIVE row into a
--     DEPRECATED twin; both sides are prose-free and 0-usage, so nothing is
--     lost, but the notice below names them because the surviving disposition
--     is `deprecated`. Deliberately NOT auto-promoted -- reviving a tag someone
--     deprecated is a product decision, not a slug repair.
--
-- (b) merge_tag_concept inserts the LOSER'S NAME as an alias on the canonical.
--     On a twin-named pair that is an alias identical to its own tag's name --
--     the exact shape tag_hygiene_stats().alias_equals_name keeps at ZERO, a
--     hard baseline in scripts/check-tag-hygiene.mjs that reads PROD, so all
--     four would have redded every open PR in the repo. The self-aliases are
--     deleted below, scoped to the slugs this migration merged. They carry no
--     redirect: a merged row keeps its own slug and resolves via
--     merged_into_id, so the alias was pure noise.
--
-- (c) Three of the four canonicals are DEPRECATED, so the merge redirect that
--     log_unified_tag_merge_redirect mints (tag_id = merged_into_id) points at
--     a non-active tag and tag_hygiene_stats().redirect_to_non_canonical grows.
--     That counter is a documented oscillator, not an invariant, and its
--     baseline is raised in the same commit -- see scripts/tag-hygiene-baseline
--     .json. Part 3 prints the post-apply value so the number is derived.
do $do$
declare
  v_id uuid; v_target uuid; v_n int := 0; v_failed int := 0;
  v_dup_slugs text[] := '{}';
  v_dup_slug text; v_note text; v_err text := '';
begin
  perform set_config('app.actor', 'admin:tag-slug-seal', true);

  -- (a) collisions with an existing tag -> merge the corrupt row away
  for v_id, v_target, v_dup_slug, v_note in
    select c.id, o.id, c.old_slug,
           case when c.status = 'active' and o.status = 'deprecated'
                then format('%s (active) absorbed into deprecated %s', c.old_slug, o.slug) end
      from _slug_repair_candidates c
      join public.unified_tags o on o.slug = c.want and o.id <> c.id
     where o.status <> 'merged'
  loop
    begin
      -- DEMOTE BEFORE MERGE. merge_tag_concept deletes the loser's category
      -- assignment only when the canonical holds the SAME category_id; when the
      -- two are filed differently it just repoints the row, and if both are
      -- is_primary the partial unique index tag_category_assignments_one_primary
      -- _per_tag (over (tag_id) WHERE is_primary) raises 23505. Measured on
      -- prod: that swallowed 2 of these 4 merges -- mavie-h-rbiger (History &
      -- Rights vs Gender) and preistr-ger (History & Rights vs Community Life &
      -- Support) -- while jan-mikol-ek and kirsten-pl-tz went through because
      -- their canonical had no primary at all. Same order-of-operations rule as
      -- 20261016100000:415.
      update public.tag_category_assignments a
         set is_primary = false
       where a.tag_id = v_id
         and a.is_primary
         and exists (select 1 from public.tag_category_assignments c
                      where c.tag_id = v_target and c.is_primary);

      perform public.merge_tag_concept(v_target, v_id, 'admin', 'repair:tag-slug-seal');
      v_dup_slugs := v_dup_slugs || v_dup_slug;
      v_n := v_n + 1;
      if v_note is not null then
        raise notice 'tag slug repair: %', v_note;
      end if;
    exception when others then
      -- Swallow so one bad pair cannot abort the batch, but COUNT it and raise
      -- the real sqlerrm below. Left unraised, a swallowed merge surfaced three
      -- blocks later as "N live tags still carry a corrupted slug", which names
      -- a symptom and not the 23505 that caused it.
      v_failed := v_failed + 1;
      v_err := v_err || format('%s: %s; ', v_dup_slug, sqlerrm);
    end;
  end loop;

  if v_failed > 0 then
    raise exception 'tag slug repair: % merge(s) failed -- %', v_failed, v_err;
  end if;
  raise notice 'tag slug repair: merged % colliding rows', v_n;

  -- (b) drop the self-aliases those merges minted (see note (b) above)
  delete from public.tag_aliases a
   using public.unified_tags t
   where t.id = a.canonical_tag_id
     and lower(a.alias_name) = lower(t.name)
     and a.alias_slug = any(v_dup_slugs);
  get diagnostics v_n = row_count;
  raise notice 'tag slug repair: deleted % self-aliases', v_n;

  -- (c) everything else -> rename, deduplicated within the batch.
  -- DISTINCT ON guards the case where two candidates want the SAME corrected
  -- slug; a NOT EXISTS against current slugs cannot see that, because the
  -- conflict is between two rows inside this one UPDATE. The join to
  -- unified_tags re-reads status, so a row the merge arm just retired is not
  -- renamed on top of its own redirect trail.
  with cand as (
    select distinct on (c.want) c.id, c.want
      from _slug_repair_candidates c
      join public.unified_tags u on u.id = c.id and u.status <> 'merged'
     where not exists (select 1 from public.unified_tags o
                        where o.slug = c.want and o.id <> c.id)
     order by c.want, (c.status = 'active') desc, c.uses desc
  )
  update public.unified_tags u set slug = c.want from cand c where u.id = c.id;
  get diagnostics v_n = row_count;
  raise notice 'tag slug repair: renamed % rows', v_n;
end $do$;

-- ---------------------------------------------------------------------------
-- Part 3. Terminal assertions -- the repair reached zero, and it did not
-- resurrect the invariants it was most likely to break.
-- ---------------------------------------------------------------------------
do $do$
declare v_bad int; v_self int; v_assign int; v_redirect int;
begin
  select count(*) into v_bad
    from public.unified_tags
   where status <> 'merged'
     and name ~ '[^\x00-\x7F]'
     and slug is distinct from public.normalize_tag_slug(name);
  if v_bad > 0 then
    raise exception '% live tags still carry a diacritic-corrupted slug', v_bad;
  end if;

  select count(*) into v_self
    from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where lower(a.alias_name) = lower(t.name);
  if v_self > 0 then
    raise exception 'tag_hygiene_stats().alias_equals_name is a zero-invariant; % rows present', v_self;
  end if;

  select count(*) into v_assign
    from public.unified_tag_assignments a
    join public.unified_tags t on t.id = a.tag_id
   where t.status <> 'active';
  if v_assign > 0 then
    raise exception 'tag_hygiene_stats().assignment_to_non_active_tag is a zero-invariant; % rows present', v_assign;
  end if;

  -- Not an assertion: this counter legitimately oscillates (a revived tag
  -- re-mints redirects, 20260910181447), so it is a baselined ratchet rather
  -- than an invariant. Printed so the number committed to
  -- scripts/tag-hygiene-baseline.json is DERIVED from an apply, not guessed.
  select count(*) into v_redirect
    from public.tag_slug_redirects r
    join public.unified_tags t on t.id = r.tag_id
   where t.status <> 'active' or t.merged_into_id is not null;
  raise notice 'tag slug repair: redirect_to_non_canonical is now % (baseline must be >= this)', v_redirect;
end $do$;
