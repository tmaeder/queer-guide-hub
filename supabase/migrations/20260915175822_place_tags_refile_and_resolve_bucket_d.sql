-- Place-name tags, round two: refile the district cohort and resolve the blocked same-name bucket.
--
-- This finishes two pieces of work that 20270501180000_tag_place_duplicate_deindex.sql
-- deliberately left open, and does NOT revisit what that migration settled.
--
-- ============================================================================
-- PART 1 — the district cohort, which the earlier predicate structurally could not see
-- ============================================================================
-- One Siegessäule hashtag import on 2026-08-30 05:01 minted Berlin's districts as glossary
-- tags from `#Kreuzberg`-style hashtags (supabase/functions/_shared/berlin-events-parse.ts).
-- Nothing in the repo seeds them; they are runtime artifacts. The same import produced junk
-- siblings (`No`, `Grand`, `Help`, `Test`) and the TRUNCATED `Prenzlauer` — the district is
-- Prenzlauer Berg, and the tag name is the hashtag, not the place.
--
-- 20270501180000's candidate set is `entity_kind='place' OR primary category travel-destinations`.
-- The import filed these as `entity_kind='concept'` under "Vibe & Crowd" / "Venue Features &
-- Policies" / "Culture & Community", so NOT ONE of them was a candidate — they were invisible to
-- that migration, to its buckets, and to every place-aware rule since. Measured on prod:
--
--   kreuzberg  494 uses  INDEXABLE  "Vibe & Crowd"                 Q308928
--   tempelhof   37 uses  INDEXABLE  "Culture & Community"          Q363830
--   schoneberg 814 uses             "Venue Features & Policies"    Q313189
--   prenzlauer 322 uses             "Venue Features & Policies"    (no QID, truncated name)
--   mitte      221 uses             "Vibe & Crowd"                 Q163966
--   neukolln   185 uses             "Venue Features & Policies"    Q4071168
--   friedrichshain 163 uses         "Venue Features & Policies"    Q317056
--   steglitz    30 uses             "Venue Features & Policies"    Q700211
--
-- `/tags/kreuzberg` is the sharpest: indexable, serving Wikipedia's "Kreuzberg is a district of
-- Berlin, Germany" to crawlers under the category "Vibe & Crowd" — a city district asserted to
-- be a queer vibe.
--
-- WHY category_id IS WRITTEN ALONE
-- A tag states its category three times: `category` text, `category_id`, and a
-- `tag_category_assignments` row. `/tags/:slug` renders the JUNCTION; the search facet renders
-- the TEXT. Writing `category_id` fires sync_tag_category_assignment (BEFORE, derives the text)
-- and sync_tag_category_assignment_after (AFTER, moves the primary junction row), so one lever
-- moves all three. Precedent 20261006110000. The postcondition asserts all three, not the lever.
--
-- ============================================================================
-- PART 2 — bucket D, unblocked by the rule its own audit specified
-- ============================================================================
-- 20270501180000 wrote: "D 13 matches 2+ real cities EXCLUDED. 3,579 usages incl. `berlin`.
-- Deindexing is arguably target-independent (every candidate is a real city page), but the audit
-- recommended blocking pending review and this migration does not overrule it." Its guard 2
-- names the missing step exactly: "resolve by content mass first".
--
-- That review is this migration. docs/audits/2026-09-04-tag-glossary-triage.md §2.3 specifies the
-- rule — resolve by content mass (venues + events on the candidate city), require a >=5x margin
-- over the runner-up, block otherwise. Applied live, with a minimum-mass floor added below:
--
--   berlin        4721 vs    3  -> berlin      (DE)   RESOLVE   3,354 uses
--   san-francisco 4493 sole      -> san-francisco (US) RESOLVE
--   zurich        3754 sole      -> zuerich     (CH)   RESOLVE   <- see the accent note
--   brighton       258 vs    1  -> brighton    (GB)   RESOLVE
--   san-juan       137 sole      -> san-juan-1  (PR)   RESOLVE
--   birmingham     107 vs    8  -> birmingham  (GB)   RESOLVE
--   brisbane        86 sole      -> brisbane    (AU)   RESOLVE
--   wellington      55 vs    5  -> wellington  (NZ)   RESOLVE
--   san-jose       191 vs   44  -> 4.3x, under the bar        BLOCK
--   santa-cruz      30 vs    7  -> 4.3x, under the bar        BLOCK
--   durango          5 vs    4  -> genuinely undecidable      BLOCK
--   toledo           3 vs    1  -> near-empty both sides      BLOCK
--   georgetown       2 sole      -> sole but near-empty        BLOCK  <- floor, see below
--
-- WHY A MINIMUM-MASS FLOOR AS WELL AS A MARGIN
-- "Sole candidate" is not the same as "identified". `georgetown` matches one city only because
-- our corpus spells the other two "George Town" with a space, and that single candidate holds a
-- content mass of 2. The audit reached the same verdict by hand ("three near-empty candidates are
-- genuinely undecidable from our own data"). A margin test cannot express this, because there is
-- no runner-up to have a margin over — so the floor is a separate condition, not a tuned margin.
--
-- WHY THE ACCENT MATTERS, AND WHY THIS JOIN IS UNACCENTED
-- The audit lists `zurich` in bucket D with two candidates. Today it classifies as bucket C —
-- exactly one match — because `dedup_despace` does not strip accents, so "Zürich" no longer
-- matches "Zurich" and only Zurich, US survives the join. A bucket-C rule would therefore have
-- resolved /tags/zurich to /city/zurich, which is the US city with a content mass of 9, while
-- Zürich CH (mass 3,754) lives at /city/zuerich. That is the precise failure §2.3 records itself
-- committing ("my own first pass did it"), re-armed by an accent. This join unaccents BOTH sides,
-- which restores both candidates and lets content mass pick the right one.
--
-- Two-arg extensions.unaccent(regdictionary, text) is required: these callers run with
-- search_path set to 'public', where the one-arg form cannot find its dictionary (CLAUDE.md).
--
-- ============================================================================
-- WHAT THIS DOES NOT DO
-- ============================================================================
-- * Buckets E and F are UNTOUCHED, deliberately. The audit reasoned them as legitimate:
--   E (california, usa, pennsylvania, wales, manhattan, queensland, rotorua, santurce) are
--   regions with no geo entity to duplicate — "a region tag grouping content across LA/SF/San
--   Diego is the one thing a Destination tag does that no geo page does". F (travel, europe,
--   coastal, rural, island, river, retail, town, tour, ...) are genuine travel concepts, and the
--   audit's §2.6.4 explicitly directs the description backfill AT them.
--   128 F/E rows currently sit at seo_deindex_reason='thin'. Restamping those to
--   'place-duplicate' would be default-deny against the very rows that are SUPPOSED to gain
--   prose, permanently blocking recommended work. They stay 'thin' on purpose.
-- * `cuauhtemoc` stays excluded by name, as in 20270501180000: it is indexable and a place
--   duplicate by every structural signal, but its description is the Aztec ruler, so stamping it
--   'place-duplicate' would mislead a future audit of that reason. Wrong-sense flow owns it.
-- * No merges, no deprecation, no writes to description, wikidata_id, tags[],
--   unified_tag_assignments, usage_count or status. ?tags=<slug> and every browse filter keep
--   working unchanged.
--
-- REVERSE
--   update public.unified_tags set seo_indexable = true, seo_deindex_reason = null
--    where seo_deindex_reason = 'place-duplicate' and updated_at >= '<this migration ran>';
--   (the refile half: restore entity_kind/category_id from unified_tags_audit)

do $$
declare
  v_district_cat uuid := '2b590db4-546f-4478-8537-ac544382da2b';  -- tag_categories 'travel-destinations'
  v_refiled int; v_deindexed int; v_resolved int; v_blocked int;
  v_bad text[]; v_leak int; v_drift int;
begin
  -- log_unified_tag_change() RAISEs when an undeclared `system:%` actor modifies a
  -- human_reviewed row. None of this cohort is human_reviewed today, but the filing is one
  -- enrichment pass from changing and an undeclared write would then abort mid-migration.
  perform set_config('app.actor', 'migration:place_tags_refile_and_resolve_bucket_d', true);

  ---------------------------------------------------------------------------
  -- PART 1: the district cohort
  ---------------------------------------------------------------------------
  create temporary table _districts on commit drop as
  select t.id, t.slug, t.entity_kind, t.category_id, t.seo_indexable
    from public.unified_tags t
   where t.status = 'active'
     and t.slug in ('kreuzberg','schoneberg','prenzlauer','mitte','neukolln',
                    'friedrichshain','tempelhof','steglitz');

  -- Soft on preconditions: report what is present, never abort on a count. A concurrent session
  -- may legitimately have merged or deprecated one of these between authoring and CI.
  raise notice 'district cohort present: % of 8', (select count(*) from _districts);

  update public.unified_tags t
     set entity_kind = 'place',
         category_id = v_district_cat,
         updated_at  = now()
    from _districts d
   where t.id = d.id
     and (t.entity_kind is distinct from 'place' or t.category_id is distinct from v_district_cat);
  get diagnostics v_refiled = row_count;
  raise notice 'districts refiled to entity_kind=place + Destinations: %', v_refiled;

  ---------------------------------------------------------------------------
  -- PART 2: bucket D, resolved by content mass
  ---------------------------------------------------------------------------
  create temporary table _bucket_d on commit drop as
  with tg as (
    select t.id, t.slug, t.name
      from public.unified_tags t
     where t.status = 'active'
       and t.slug in ('berlin','san-francisco','brisbane','brighton','birmingham','san-jose',
                      'wellington','santa-cruz','san-juan','georgetown','durango','toledo','zurich')
  ),
  cand as (
    select tg.id tag_id, tg.slug tag_slug, c.slug city_slug,
           (select count(*) from public.venues v where v.city_id = c.id)
         + (select count(*) from public.events e where e.city_id = c.id) as mass
      from tg
      join public.cities c
        on extensions.unaccent('extensions.unaccent'::regdictionary, lower(c.name))
         = extensions.unaccent('extensions.unaccent'::regdictionary, lower(replace(tg.name, '-', ' ')))
       and c.duplicate_of_id is null
       and c.slug not like 'tmp-%'
       and coalesce(c.shell_status, 'real') not in ('ghost', 'merged')
  ),
  ranked as (
    select *,
           row_number() over (partition by tag_slug order by mass desc) rk,
           lead(mass)   over (partition by tag_slug order by mass desc) runner_up
      from cand
  )
  select tag_id, tag_slug, city_slug, mass, coalesce(runner_up, 0) as runner_up,
         -- Floor AND margin. The floor is why `georgetown` blocks: it is a sole candidate, so no
         -- margin test can reject it, and its mass of 2 identifies nothing.
         (mass >= 10 and mass >= 5 * greatest(coalesce(runner_up, 0), 1)) as resolved
    from ranked
   where rk = 1;

  select count(*) filter (where resolved), count(*) filter (where not resolved)
    into v_resolved, v_blocked from _bucket_d;
  raise notice 'bucket D: % resolved by content mass, % blocked', v_resolved, v_blocked;
  raise notice 'bucket D blocked (no redirect target, deindexed only): %',
    (select coalesce(string_agg(tag_slug, ', ' order by tag_slug), '(none)')
       from _bucket_d where not resolved);

  -- Guard: `cuauhtemoc` must never be selected here. It is excluded by NAME in 20270501180000
  -- and that exclusion is load-bearing for the meaning of the reason string.
  select array_agg(tag_slug) into v_bad from _bucket_d where tag_slug = 'cuauhtemoc';
  if v_bad is not null then
    raise exception 'cuauhtemoc selected: it belongs to the wrong-sense flow, not place-duplicate';
  end if;

  -- Guard: nothing from bucket E/F may have leaked into either cohort. These are the rows the
  -- audit reasoned are NOT duplicates, and deindexing them is the one way this migration could
  -- do real harm.
  select array_agg(x) into v_bad from (
    select tag_slug x from _bucket_d
    union all select slug from _districts
  ) s where x in ('california','usa','pennsylvania','wales','manhattan','queensland','rotorua',
                  'santurce','travel','europe','coastal','rural','island','river','retail','town',
                  'tour','tourism','recreation','transportation','outdoor-recreation',
                  'walking-tour','beach-resort','latin-america','middle-east');
  if v_bad is not null then
    raise exception 'bucket E/F tags selected, these are not duplicates: %', v_bad;
  end if;

  ---------------------------------------------------------------------------
  -- The write. Districts (all 8) + bucket D (all 13, resolved or not).
  ---------------------------------------------------------------------------
  -- Deindexing is target-INDEPENDENT: every candidate of a blocked tag is still a real city page,
  -- so /tags/<slug> duplicates one of them whichever it is. Only the REDIRECT needs a resolved
  -- target, and that is part C's problem, not this migration's.
  --
  -- A row already deindexed for some OTHER reason is left alone: that reason is someone else's
  -- decision and default-deny protects it.
  update public.unified_tags t
     set seo_indexable      = false,
         seo_deindex_reason = 'place-duplicate',
         updated_at         = now()
   where t.id in (select id from _districts union all select tag_id from _bucket_d)
     and (t.seo_indexable is true or t.seo_deindex_reason = 'thin')
     and t.seo_deindex_reason is distinct from 'place-duplicate';
  get diagnostics v_deindexed = row_count;
  raise notice 'deindexed as place-duplicate: %', v_deindexed;

  ---------------------------------------------------------------------------
  -- Postconditions: assert the REACHED STATE, positively. A count of rows in a bad state
  -- returns zero for a slug that has vanished from the corpus entirely.
  ---------------------------------------------------------------------------
  select count(*) into v_leak
    from public.unified_tags t
   where t.id in (select id from _districts union all select tag_id from _bucket_d)
     and t.seo_indexable is true;
  if v_leak > 0 then
    raise exception 'postcondition failed: % place tags still indexable', v_leak;
  end if;

  -- All three category representations must agree for every refiled district. The junction is
  -- what /tags/:slug renders and the text is what the search facet renders, so asserting
  -- category_id alone would assert the lever and not the outcome.
  select count(*) into v_drift
    from public.unified_tags t
    join _districts d on d.id = t.id
   where t.category_id is distinct from v_district_cat
      or t.category is distinct from (select name from public.tag_categories where id = v_district_cat)
      or not exists (
           select 1 from public.tag_category_assignments a
            where a.tag_id = t.id and a.is_primary and a.category_id = v_district_cat);
  if v_drift > 0 then
    raise exception 'postcondition failed: % districts disagree across category text/id/junction', v_drift;
  end if;

  -- Bucket E/F must still be reachable by the description backfill the audit directs at them.
  -- If this ever reads 0, someone has restamped the cohort and silenced recommended work.
  raise notice 'bucket E/F rows still held at reason=thin (expected ~128): %',
    (select count(*) from public.unified_tags
      where status = 'active' and entity_kind = 'place' and seo_deindex_reason = 'thin');
end $$;
