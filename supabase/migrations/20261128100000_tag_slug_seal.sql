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
-- something the character class enforces -- which is why part 1 below asserts it
-- at apply time instead of trusting this paragraph.
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
-- Part 1. Guards. Both abort the migration rather than repair the wrong rows.
-- ---------------------------------------------------------------------------
-- Shape follows 20260802110451_tag_slug_diacritic_backfill.sql, which repaired
-- this identical cohort (67 rows) after the first diacritic-deleting slugifier.
do $do$
declare v_n int; v_named int;
begin
  -- The `name ~ '[^\x00-\x7F]'` term is load-bearing in every WHERE below.
  -- Without it the predicate `slug <> normalize_tag_slug(name)` matches 115
  -- active rows, 106 of which are deliberate namespace prefixes, and the repair
  -- would rename mat-silicone (4,643 uses) to silicone.
  select count(*) into v_n
    from public.unified_tags
   where status <> 'merged'
     and name ~ '[^\x00-\x7F]'
     and slug is distinct from public.normalize_tag_slug(name);
  if v_n > 60 then
    raise exception 'tag slug repair matched % rows (expected ~11, cap 60) -- refusing to run', v_n;
  end if;
  raise notice 'tag slug repair: % candidate rows', v_n;

  -- Turn the header's prose guarantee into a checked one.
  select count(*) into v_named
    from public.unified_tags
   where status <> 'merged'
     and name ~ '[^\x00-\x7F]'
     and slug ~ '^(mat|vibe|occ|color|genre|news|intimate)-';
  if v_named > 0 then
    raise exception '% namespaced tags carry a non-ASCII name -- the seal would rename them', v_named;
  end if;
end $do$;

-- ---------------------------------------------------------------------------
-- Part 2. The repair.
-- ---------------------------------------------------------------------------
-- Measured on prod 2026-09-02: 21 rows disagree with normalize_tag_slug(name),
-- of which 10 are status='merged' and are SKIPPED -- their slug is the redirect
-- trail pointing at the canonical tag, so rewriting it breaks the lookup it
-- exists to serve. That skip is also what makes the two collisions flagged in
-- review harmless: the merged `attila-h-rbiger` and both merged `Müllerian`
-- rows are never touched, so they cannot collide with their active twins.
--
-- Of the 11 remaining, 4 collide with an existing tag and 7 rename cleanly.
-- All four collision pairs are TWIN-NAMED (identical `name`, differing only in
-- slug), which forces two things:
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
-- Renames orphan nothing. Entity `tags[]` arrays store the slug STRING, but
-- measured across all 13 tag-bearing tables, ZERO rows carry any of the 11
-- corrupt slugs; `Ü30`'s 13 usages (the only non-zero count in the cohort) are
-- unified_tag_assignments rows keyed by tag_id, which a rename cannot touch.
do $do$
declare
  v_id uuid; v_target uuid; v_n int := 0;
  v_dup_slugs text[] := '{}';
  v_dup_slug text; v_note text;
begin
  perform set_config('app.actor', 'admin:tag-slug-seal', true);

  -- (a) collisions with an existing tag -> merge the corrupt row away
  for v_id, v_target, v_dup_slug, v_note in
    select t.id, o.id, t.slug,
           case when t.status = 'active' and o.status = 'deprecated'
                then format('%s (active) absorbed into deprecated %s', t.slug, o.slug) end
      from public.unified_tags t
      join public.unified_tags o
        on o.slug = public.normalize_tag_slug(t.name) and o.id <> t.id
     where t.slug is distinct from public.normalize_tag_slug(t.name)
       and t.name ~ '[^\x00-\x7F]'
       and t.status <> 'merged'
       and o.status <> 'merged'
  loop
    begin
      -- DEMOTE BEFORE MERGE. merge_tag_concept deletes the loser's category
      -- assignment only when the canonical holds the SAME category_id; when the
      -- two are filed differently it just repoints the row, and if both are
      -- is_primary the partial unique index tag_category_assignments_one_primary
      -- _per_tag (over (tag_id) WHERE is_primary) raises 23505 and the merge is
      -- swallowed by the handler below -- leaving the row corrupt and the
      -- terminal assertion to catch it. Measured on prod: this is exactly what
      -- happened to mavie-h-rbiger (History & Rights vs Gender) and preistr-ger
      -- (History & Rights vs Community Life & Support), while jan-mikol-ek and
      -- kirsten-pl-tz merged cleanly because their canonical had no primary at
      -- all. Same order-of-operations rule as 20261016100000:415.
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
      raise notice 'tag slug repair: merge skipped for %: %', v_id, sqlerrm;
    end;
  end loop;
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
  -- DISTINCT ON guards the case where two corrupt rows want the SAME corrected
  -- slug; a NOT EXISTS against current slugs cannot see that, because the
  -- conflict is between two rows inside this one UPDATE.
  with cand as (
    select distinct on (public.normalize_tag_slug(t.name))
           t.id, public.normalize_tag_slug(t.name) want
      from public.unified_tags t
     where t.slug is distinct from public.normalize_tag_slug(t.name)
       and t.name ~ '[^\x00-\x7F]'
       and t.status <> 'merged'
       and not exists (select 1 from public.unified_tags o
                        where o.slug = public.normalize_tag_slug(t.name) and o.id <> t.id)
     order by public.normalize_tag_slug(t.name), (t.status = 'active') desc,
              coalesce(t.usage_count, 0) desc
  )
  update public.unified_tags u set slug = c.want from cand c where u.id = c.id;
  get diagnostics v_n = row_count;
  raise notice 'tag slug repair: renamed % rows', v_n;
end $do$;

-- ---------------------------------------------------------------------------
-- Part 3. Terminal assertions -- the repair reached zero, and it did not
-- resurrect the invariant it was most likely to break.
-- ---------------------------------------------------------------------------
do $do$
declare v_bad int; v_self int;
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
end $do$;
