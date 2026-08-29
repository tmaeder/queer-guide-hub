-- RENUMBERED from 20261006200000. `supabase db push` aborts on an unapplied
-- migration that sorts BELOW the newest version already applied to prod, and it
-- aborts on the FIRST such file, abandoning every later one. This was the last
-- of that cohort still stranded, so it alone was holding back every migration in
-- the repo — including the five already renumbered by #3118 and the reconciler
-- in this PR. Content unchanged.
--
-- SSC is stranded on a legacy L0 root that PR E is going to delete.
--
-- THIS PR STARTED AS FIVE ROWS AND IS NOW ONE, BECAUSE THE TAXONOMY MOVED.
--
-- 20261006110000 (#3097) repaired 21 tag pages and named five rows it declined
-- to touch, each of which published one category on /tags/:slug (the junction,
-- via fetchTagWithCategories) and a different one in the search facet
-- (unified_tags.category -> search_documents):
--
--   crossdresser-transvestite     Gender Identity      / Sexual Health
--   safe-sane-and-consensual-ssc  Safety & Practices   / Slang & Terminology
--   piss-slut                     Sexual Roles         / Practices & Play
--   golden-shower                 Practices & Play     / Fetishes & Interests
--   deli                          Venues & Nightlife   / Safe Spaces
--
-- 20261006140100 (taxonomy v3, PR C) then re-filed the corpus onto the new
-- tree and resynced the text, which closed FOUR of the five as a side effect.
-- Re-measured on prod after it applied, all four now agree on all three
-- surfaces, and every one landed where the per-row analysis had concluded it
-- belonged — the rename is the only difference:
--
--   crossdresser-transvestite  ->  Gender             (Identity)
--   piss-slut                  ->  Dynamics & Roles   (Sex & Kink)
--   golden-shower              ->  Practices & Play   (Sex & Kink)
--   deli                       ->  Venue Types        (Places & Scene)
--
-- Those four are asserted below rather than assumed, and nothing here writes
-- them. `piss-slut` is the one worth spelling out: the analysis put it in
-- `Sexual Roles` because twenty sibling role terms of the same construction
-- sat there, and v3 merged that stop into `Dynamics & Roles` — where all
-- twenty-four still sit together (Cum Slut, Painslut, Cumdump, Top, Bottom,
-- Vers, Switch, Power Bottom). Same decision, new name.
--
--
-- THE ONE THAT DID NOT CLOSE, AND WHY IT GOT WORSE
--
-- `safe-sane-and-consensual-ssc` now agrees with itself — text, category_id and
-- primary junction all read `Safety & Practices` — so the census no longer sees
-- it at all. That is not the defect being fixed. `Safety & Practices` is a
-- LEGACY LEVEL-0 ROOT of the pre-v3 tree, and v3 replaced it with the line
-- `Safety & Consent` and its stop `Consent & Negotiation`. The refile did not
-- move this row (a rule that guesses is how the corpus got into this state, so
-- PR C deliberately only moved what its rules decided), and PR E deletes the
-- old tree. Measured on prod: four active tags are left on that legacy root —
-- `cleanup`, `gewaltverbrechen`, `kriminell`, and this one.
--
-- The destination is not a judgement call. Every peer consent framework sits in
-- `Consent & Negotiation` (31 active tags), including this tag's OWN TWIN:
--
--   ssc                          "SSC"                                  <- same concept
--   prick                        "PRICK"
--   risk-aware-consensual-kink   "Risk-Aware Consensual Kink"
--   risk-aware-virus-exposure-rave, ...-cabins, ...-fries, ...-rbdsma
--   safe-word, safe-words, hard-limits, soft-limits, spotter, vetting
--
-- and the Kinktionary section this row was imported from is literally
-- `consent`. #3097's own words for why it declined to follow the text here —
-- "SSC is a foundational consent framework rather than slang" — are the
-- argument for this stop; it simply had no way to reach a third value, because
-- its predicate required the target to be the category the TEXT named.
--
-- The other three strandees are NOT touched. `gewaltverbrechen` and `kriminell`
-- are German-language junk and `cleanup` is a scene-aftermath term; none is a
-- consent framework, none was reviewed here, and PR E's own remainder pass owns
-- them. Asserting "the legacy root is empty" would quietly make this migration
-- responsible for all four, so the assertion below is about THIS row only.
--
--
-- MECHANISM
--
-- The write is `category_id` only, resolved BY SLUG. v3 renames stops (the old
-- `Sexual Roles` and the new `Dynamics & Roles` share the slug
-- `bdsm-power-exchange`; `Gender` still answers to `gender-identity`), so a
-- name literal is the one form guaranteed to rot. trg_sync_tag_category
-- (BEFORE) derives the text and trg_sync_tag_category_after demotes the stale
-- primary and promotes the new one.
--
--
-- PART 2: A `category_id` WRITE DOES NOT REACH SEARCH, AND THAT IS MEASURED
--
-- The sentence above used to end "...so page and facet move together through
-- the path that owns them." That is FALSE, and this migration would have
-- shipped the exact defect it exists to end: the page moving to the consent
-- stop while the search facet kept saying `Safety & Practices`.
--
-- `trg_search_documents_tag` is AFTER UPDATE **OF** name, short_description,
-- description, category, slug, image_url, entity_kind, merged_into_id,
-- deprecated_at, status. A column-scoped trigger fires on the columns named in
-- the UPDATE **statement**, not on what a BEFORE trigger mutated — the same
-- trap `derive_entity_geo_address()` documents for `safety_gated`. So
-- `UPDATE unified_tags SET category_id = ...` rewrites `category` via
-- trg_sync_tag_category and enqueues NOTHING. Probed on prod in a rolled-back
-- transaction:
--
--   search_reindex_queue depth       24
--   after SET category_id = ...      24   <- no reindex
--   after SET category   = ...       25   <- enqueued
--
-- 20261006140100 re-files by writing `category_id`, so this is not theoretical:
-- active tags publish a search facet naming a category that **no longer
-- exists** — `Body Types & Archetypes`, `Queer History by Region`, `Friendship
-- & Community` — while their own column reads the v3 stop. The reindex queue is
-- EMPTY and the drain is healthy, so nothing was going to correct them;
-- `piss-slut`, one of this PR's own five, is among them.
--
-- THE COUNT IS NOT FIXED, AND THAT IS THE FINDING RATHER THAN A CAVEAT.
-- Measured at 106 while this was written, and at 119 an hour later after
-- 20261006160000 and 20261006170000 landed — both of which also re-file by
-- writing `category_id`. Every migration in the v3 program feeds this cohort,
-- so a frozen number would already be wrong by the time CI applied this. Hence
-- a structural predicate, and a cap that is a REVIEW BOUND rather than an
-- expected value.
--
-- Part 2 re-indexes every active tag whose search facet disagrees with its
-- column, which is this row plus that cohort. The predicate is STRUCTURAL, so
-- it is idempotent, it cannot grow into a blanket reindex, and a row a
-- concurrent session already fixed is simply not selected. It calls
-- `search_documents_index_tags(id)` directly rather than enqueuing, because a
-- bounded set inside a migration can then be ASSERTED — an enqueue would leave
-- the post-condition to a cron this migration cannot observe.
--
-- Fixing that collateral here is deliberate. This PR's whole claim is that the
-- two reader-visible surfaces agree; shipping it while a hundred-odd live rows
-- say otherwise, for the same reason, would make the claim false on the day it
-- landed.
--
-- The tag's `Slang & Terminology` junction row — the one the pre-#3087 revival
-- left behind, and the reason the text disagreed for so long — is left in place,
-- demoted. It renders as a secondary category, which is defensible for an
-- acronym, and deleting a curated assignment is a separate editorial act.
--
-- app.actor must not match 'system:%': log_unified_tag_change() raises on any
-- change to a human_reviewed row by a system actor, and this row is
-- human_reviewed.

select set_config('app.actor', 'migration:ssc-consent-stop', true);

do $mig$
declare
  v_n int;
  v_ssc uuid;
  v_target uuid;
  v_from text;
  v_stale int;
begin
  ---------------------------------------------------------------------- guard
  -- v3 must be live, or `consent-negotiation` is still the old tree's stop and
  -- this move means something different.
  if not exists (
    select 1 from tag_categories c
      join tag_categories p on p.id = c.parent_id
     where c.slug = 'consent-negotiation' and p.slug = 'safety-consent') then
    raise exception 'ssc consent stop: apply 20261006140000 (taxonomy v3 tree) first';
  end if;

  select t.id, c.name into v_ssc, v_from
    from unified_tags t
    left join tag_categories c on c.id = t.category_id
   where t.slug = 'safe-sane-and-consensual-ssc' and t.status = 'active';
  select id into v_target from tag_categories where slug = 'consent-negotiation';

  if v_ssc is null then
    raise exception 'ssc consent stop: safe-sane-and-consensual-ssc is not an active tag — re-measure';
  end if;
  if v_target is null then
    raise exception 'ssc consent stop: consent-negotiation category not found';
  end if;

  --------------------------------------------------------------- part 1 write
  update unified_tags
     set category_id = v_target
   where id = v_ssc and category_id is distinct from v_target;

  --------------------------------------------------------------- part 2 write
  -- Re-index every active tag whose published search facet disagrees with its
  -- own category column. A category_id write does not fire the column-scoped
  -- search trigger (probed; see the header), so this covers the row above AND
  -- the cohort 20261006140100 left behind. Structural predicate, so it is
  -- idempotent and cannot become a blanket reindex.
  select count(*) into v_stale
    from unified_tags t
    join search_documents s on s.entity_type = 'tag' and s.entity_id = t.id
   where t.status = 'active' and t.deprecated_at is null
     and coalesce(t.category, '') is distinct from coalesce(s.facets ->> 'category', '');

  -- Measured at 107, then 120, as sibling v3 migrations landed. A far larger set
  -- means something new happened upstream and the reindex should be sized and
  -- batched deliberately rather than run inline here.
  if v_stale > 400 then
    raise exception
      'ssc consent stop: % stale tag facet(s) is larger than the reviewed set — re-measure before applying', v_stale;
  end if;

  perform search_documents_index_tags(t.id)
     from unified_tags t
     join search_documents s on s.entity_type = 'tag' and s.entity_id = t.id
    where t.status = 'active' and t.deprecated_at is null
      and coalesce(t.category, '') is distinct from coalesce(s.facets ->> 'category', '');

  ----------------------------------------------------------------- assertions
  -- 1. It landed, on all three surfaces, under the v3 line rather than a
  --    same-named legacy stop.
  select count(*) into v_n
    from unified_tags t
    join tag_categories c on c.id = t.category_id
    join tag_categories p on p.id = c.parent_id
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
   where t.id = v_ssc
     and c.slug = 'consent-negotiation'
     and p.slug = 'safety-consent'
     and a.category_id = c.id
     and t.category = c.name;
  if v_n <> 1 then
    raise exception 'ssc consent stop: row did not land on the v3 consent stop across all three surfaces';
  end if;

  -- 2. It is no longer parked on a level-0 root. That — not the text/junction
  --    disagreement, which v3 already closed — is the defect being repaired,
  --    and it is what PR E's deletion of the old tree would otherwise strand.
  select count(*) into v_n
    from unified_tags t join tag_categories c on c.id = t.category_id
   where t.id = v_ssc and c.level = 0;
  if v_n > 0 then
    raise exception 'ssc consent stop: row is still filed at a level-0 root';
  end if;

  -- 3. MODERATION DID NOT MOVE. unified_tags_recompute_is_adult() fires on the
  --    assignment insert and recomputes from the tag's FULL assignment set;
  --    neither the old nor the new stop is under a kink line, so a flip here
  --    would mean the recompute disagrees with that reading. Under-moderation
  --    is the worst failure class on this table, so it is checked.
  select count(*) into v_n from unified_tags where id = v_ssc and is_adult;
  if v_n > 0 then
    raise exception 'ssc consent stop: is_adult flipped on a non-kink move';
  end if;

  -- 4. THE FOUR ROWS 20261006140100 ALREADY CLOSED STAY CLOSED. Nothing here
  --    writes them; this is a regression check on the state that let this PR
  --    shrink from five rows to one, and it fails loudly if that state was
  --    misread. Checked across all three surfaces, by slug.
  select count(*) into v_n
    from unified_tags t
    join tag_categories idc on idc.id = t.category_id
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
   where t.slug in ('crossdresser-transvestite', 'piss-slut', 'golden-shower', 'deli')
     and t.status = 'active'
     and t.category = idc.name
     and a.category_id = t.category_id;
  if v_n <> 4 then
    raise exception 'ssc consent stop: % of 4 previously-closed holds still agree across surfaces', v_n;
  end if;

  -- 5. NO ACTIVE ROW ANYWHERE disagrees between its published text and its
  --    primary junction. This is #3097's census with its five-slug excuse
  --    dropped — the whole point of this PR — narrowed to active rows because
  --    a deprecated tag reaches neither surface (fetchTagWithCategories filters
  --    status='active'; search_documents_index_tags filters deprecated_at is
  --    null). One deprecated row, `meats`, is knowingly left disagreeing.
  select count(*) into v_n
    from unified_tags t
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
    join tag_categories c on c.id = a.category_id
   where t.status = 'active'
     and t.category is not null
     and t.category is distinct from c.name
     and exists (select 1 from tag_categories oc where oc.name = t.category);
  if v_n > 0 then
    raise exception 'ssc consent stop: % active row(s) disagree with their primary junction', v_n;
  end if;

  -- 5b. AND THE THIRD SURFACE AGREES TOO. Assertion 5 compares the column to
  --     the junction; this compares the column to what search actually
  --     PUBLISHES. Without it, part 2 could no-op and everything above would
  --     still pass — which is exactly the state prod was in before this ran.
  select count(*) into v_n
    from unified_tags t
    join search_documents s on s.entity_type = 'tag' and s.entity_id = t.id
   where t.status = 'active' and t.deprecated_at is null
     and coalesce(t.category, '') is distinct from coalesce(s.facets ->> 'category', '');
  if v_n > 0 then
    raise exception 'ssc consent stop: % active tag(s) publish a stale search facet', v_n;
  end if;

  -- 6. The AFTER trigger demotes as well as promotes.
  select count(*) into v_n from (
    select tag_id from tag_category_assignments where is_primary
     group by tag_id having count(*) > 1) x;
  if v_n > 0 then
    raise exception 'ssc consent stop: % tag(s) carry more than one primary junction', v_n;
  end if;

  raise notice 'ssc consent stop: moved from % to Consent & Negotiation (Safety & Consent); % stale tag facet(s) re-indexed',
    v_from, v_stale;
end
$mig$;
