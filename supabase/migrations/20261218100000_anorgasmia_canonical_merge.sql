-- Take a clinical sexual dysfunction off the Fetishes shelf, and settle which of
-- its two rows is the glossary's page for it.
--
-- ============================================================================
-- PART 1 IS THE LIVE DEFECT AND STANDS ALONE.
-- ============================================================================
-- `/tags/orgasmic-dysfunction` returns HTTP 200 to Googlebot today. The crawler
-- body (functions/_lib/detail.ts) reads, verbatim:
--
--     Orgasmic Dysfunction
--     Category: Fetishes
--     Anorgasmia is a type of sexual dysfunction where a person cannot achieve
--     orgasm despite adequate sexual stimulation...
--
-- and the SPA layers a Diagnostic codes band over it carrying ICD-11 HA02.0,
-- ICD-10 F52.3, ICD-9 302.73/302.74, SNOMED CT 62607004, ICPC-2 P08 and
-- DiseasesDB 23879. A medical condition is publishing as a fetish, indexably,
-- on a queer health glossary — the `sexual-pain-penetration-disorder` shape the
-- 2026-08-29 alias-shadow cleanup (20261011090000) already dispositioned once.
--
-- The Fetishes filing is also what makes the row `is_adult`: Fetishes sits under
-- the `Sex & Kink` parent, and `unified_tags_recompute_is_adult()` is keyed on
-- those category NAMES. So the row is 18+ because of where it was filed, not
-- because of what it is.
--
-- BOTH the denormalized text and the junction row have to move, and neither
-- alone is enough. Writing `category_id` fires `sync_tag_category_assignment`
-- (BEFORE, rewrites `category`) and `sync_tag_category_assignment_after`
-- (AFTER, demotes the old primary and promotes the new one) — but demotion
-- leaves the Fetishes row STANDING at is_primary=false, and
-- `unified_tags_recompute_is_adult()` matches ANY assignment, not the primary.
-- That exact residue is live on `vaginismus` right now: it won the 2026-08-29
-- merge, inherited the loser's Fetishes junction, and is `is_adult=true` and
-- `seo_indexable=false` today because of it. The junction is DELETED here, not
-- demoted, and the assertion is on `is_adult`, not on the category text.
--
-- SEXUAL HEALTH, NOT BODY & REPRODUCTIVE HEALTH. Measured on the corpus rather
-- than argued from the category descriptions, which disagree with the data
-- ("Sexual Health" reads STI/PrEP/testing and holds far more than that). Among
-- active clinical sexual-dysfunction tags: Sexual Health holds vaginismus,
-- priapism, porn-induced-erectile-dysfunction-pied, vaginal-dryness,
-- vaginal-atrophy and orgasm (6); Body & Reproductive Health holds
-- erectile-dysfunction and premature-ejaculation (2). Every PDE5 inhibitor —
-- sildenafil, tadalafil, vardenafil, avanafil, viagra, cialis, levitra — is
-- filed Sexual Health too, while the condition they treat is not; that
-- inconsistency is noted, not resolved here.
--
-- ============================================================================
-- PART 2-4: THE MERGE, AND WHY IT GOES AGAINST THE ALIAS DIRECTION.
-- ============================================================================
-- 20261217100000 held `anorgasmia` back from the footjob revival because it is
-- an alias of the ACTIVE `orgasmic-dysfunction` carrying THE SAME Wikidata item,
-- Q1772397 — a merge candidate, not a revival candidate. It deliberately did
-- not decide the direction. This does, and the answer is the row that is
-- currently deprecated.
--
-- Six independent readings, none of which is the alias arrow:
--
--   1. Q1772397's English LABEL is "anorgasmia". "orgasmic dysfunction" is one
--      of its ALIASES (alongside "inhibited orgasm", "psychogenic anorgasmy").
--      Read from the live entity, not from memory.
--   2. Every other clinical sexual dysfunction in this corpus is named for the
--      Wikidata label, never for an alias: vaginismus (Q1128431, label
--      "vaginismus"; "sexual pain-penetration disorder" is its alias),
--      erectile-dysfunction (Q184674; "Male Impotence" is an alias),
--      premature-ejaculation, delayed-ejaculation, dyspareunia.
--      `orgasmic-dysfunction` is the single member of the class named for an
--      alias, and the row named for the label is the one sitting deprecated.
--   3. The 2026-08-29 precedent is the SAME QID-alias shape one item over:
--      Q1128431's label-named row `vaginismus` (Sexual Health) beat its
--      alias-named row `sexual-pain-penetration-disorder` (Fetishes). Same
--      question, same corpus, already answered.
--   4. The live page's own long_description opens "Anorgasmia is a type of
--      sexual dysfunction…". The page already calls the concept by the other
--      name in its first word.
--   5. BOTH rows carry wikipedia_url = en.wikipedia.org/wiki/Anorgasmia. The
--      page titled "Orgasmic Dysfunction" links out to "Anorgasmia".
--   6. The German aliases already on the active row are `Anorgasmie` and
--      `Orgasmushemmung`; the deprecated row carries name_i18n for pl/pt/ru/zh.
--      The multilingual surface is anorgasmia-shaped on both rows.
--
-- WHAT THE ALIAS DIRECTION AND THE FLAGS ARE WORTH. `human_reviewed=true` on
-- the active row is not evidence — it is largely bulk-stamped across this
-- corpus. Both rows' category filings were written by ONE bulk pass on
-- 2026-04-11 11:42:58 (identical `tag_category_assignments.created_at`), so
-- "the deprecated row already has the right category" is not human curation
-- either; the corpus in Part 1 is the evidence, not that timestamp.
--
-- WHAT DOES NOT TRAVEL, AND SO IS MOVED BY HAND. `merge_tag_concept` rewrites
-- the loser's slug out of `tags[]` across 13 entity tables, repoints
-- `unified_tag_assignments` and `tag_category_assignments`, inserts the loser's
-- name as a ('synonym','approved') alias, writes the redirect via
-- `log_unified_tag_merge_redirect`, repoints relations and recounts usage. It
-- does NOT re-parent the loser's OTHER aliases, does not move
-- `tag_medical_codes`, and does not deindex the tombstone — the last of which
-- is why `sexual-pain-penetration-disorder` is `status='merged'` and
-- `seo_indexable=true` on prod today, three months after its merge.
--
-- THE PROSE COMES OFF THE LOSER. Per [[merge_direction_can_delete_content]] a
-- merge takes content out of circulation, because the duplicate's body does not
-- travel. The active row's description is the better one — tighter, ICD-citing,
-- house voice — and carries a German translation that matches it, so it is
-- transplanted onto the survivor together with `description_i18n`. The
-- deprecated row's own `description_i18n` (a Chinese translation of the text
-- being replaced) is dropped rather than carried: a translation of prose that
-- no longer exists is worse than none, and the i18n cron refills it.
-- `name_i18n` is KEPT — it translates the NAME, which is not changing.
--
-- ORDERING. This migration must land AFTER 20261217100000, which asserts
-- `anorgasmia` is still `status='deprecated'` — an assertion this change makes
-- false. That migration has NOT applied yet (remote max is 20261216114900), so
-- "db push skips applied versions" does not protect it: if this lands first,
-- 20261217100000 aborts db push for the whole repo with a message about
-- anorgasmia having been revived, which is the wrong diagnosis to hand the next
-- person. The precondition below fails LOUDLY and says what to do instead.

do $mig$
declare
  v_anorg     uuid;
  v_od        uuid;
  v_fetishes  uuid;
  v_sexhealth uuid;
  v_alias_id  uuid;
  v_bad       int;
  v_n         int;
  v_audit     uuid;
  v_desc      text;
  v_long      text;
  v_desc_i18n jsonb;
begin
  -- Declared INSIDE the block for the reason 20261217100000 gives: `db push`
  -- makes no promise that a bare statement before a `do` block shares its
  -- transaction. Here it is load-bearing rather than merely good manners —
  -- `orgasmic-dysfunction` IS human_reviewed, and `log_unified_tag_change`
  -- RAISEs when a `system:%` actor touches such a row, so an undeclared actor
  -- aborts Part 1 outright.
  perform set_config('app.actor', 'migration:anorgasmia-canonical-merge', true);

  ------------------------------------------------------------ ordering guard
  if not exists (
    select 1 from supabase_migrations.schema_migrations
     where version = '20261217100000'
  ) then
    raise exception
      'anorgasmia merge: 20261217100000 has not applied — merge PR #3346 first. It asserts anorgasmia is still deprecated, and this migration makes that false; landing this first aborts db push on that assertion with a misleading message.';
  end if;

  ------------------------------------------------------------- preconditions
  select id into v_anorg from public.unified_tags where slug = 'anorgasmia';
  select id into v_od    from public.unified_tags where slug = 'orgasmic-dysfunction';
  select id into v_fetishes  from public.tag_categories where slug = 'fetishes-interests';
  select id into v_sexhealth from public.tag_categories where slug = 'sexual-health';

  if v_anorg is null or v_od is null then
    raise exception 'anorgasmia merge: one of the two rows does not exist';
  end if;
  if v_fetishes is null or v_sexhealth is null then
    raise exception 'anorgasmia merge: category vocabulary has moved';
  end if;

  -- The premise, asserted rather than assumed. A sibling session revives,
  -- merges or re-files these rows on its own schedule; if any of this has
  -- moved, the reasoning above was about a different corpus.
  if not exists (
    select 1 from public.unified_tags
     where id = v_anorg and status = 'deprecated' and merged_into_id is null
       and wikidata_id = 'Q1772397' and category_id = v_sexhealth
  ) then
    raise exception 'anorgasmia merge: the anorgasmia row is no longer the deprecated Q1772397 Sexual Health row';
  end if;

  if not exists (
    select 1 from public.unified_tags
     where id = v_od and status = 'active' and merged_into_id is null
       and wikidata_id = 'Q1772397' and category_id = v_fetishes and seo_indexable
  ) then
    raise exception 'anorgasmia merge: orgasmic-dysfunction is no longer the active indexable Q1772397 Fetishes row';
  end if;

  -- Same QID is the whole reason these are one concept and not two.
  select count(*) into v_bad from public.unified_tags where wikidata_id = 'Q1772397';
  if v_bad <> 2 then
    raise exception 'anorgasmia merge: expected exactly 2 rows on Q1772397, found %', v_bad;
  end if;

  -- The shadowing alias must still be the one reasoned about.
  select id into v_alias_id from public.tag_aliases
   where lower(alias_slug) = 'anorgasmia' and canonical_tag_id = v_od;
  if v_alias_id is null then
    raise exception 'anorgasmia merge: the anorgasmia alias no longer points at orgasmic-dysfunction — resolve by hand';
  end if;

  -- Zero entity usage on both sides is what makes the merge's `tags[]` rewrite
  -- and its usage_count recount provable no-ops rather than hoped-for ones.
  -- If either has picked up assignments the direction question reopens, because
  -- merge_tag_concept rewrites the LOSER's slug out of 13 entity tables and the
  -- cheaper direction is then the one with fewer rows to rewrite.
  select (select count(*) from public.unified_tag_assignments where tag_id in (v_anorg, v_od))
       + (select count(*) from public.venues         where 'anorgasmia' = any(tags) or 'orgasmic-dysfunction' = any(tags))
       + (select count(*) from public.news_articles  where 'anorgasmia' = any(tags) or 'orgasmic-dysfunction' = any(tags))
       + (select count(*) from public.events         where 'anorgasmia' = any(tags) or 'orgasmic-dysfunction' = any(tags))
       + (select count(*) from public.personalities  where 'anorgasmia' = any(tags) or 'orgasmic-dysfunction' = any(tags))
    into v_bad;
  if v_bad <> 0 then
    raise exception 'anorgasmia merge: % entity usage(s) appeared on these slugs — re-decide direction before merging', v_bad;
  end if;

  ------------------------------------------- part 1: off the Fetishes shelf
  update public.unified_tags set category_id = v_sexhealth where id = v_od;

  -- The demoted junction, not the primary one. See the header: demotion alone
  -- leaves is_adult true, which is the residue live on vaginismus today.
  delete from public.tag_category_assignments
   where tag_id = v_od and category_id = v_fetishes;

  if exists (select 1 from public.unified_tags where id = v_od and (is_adult or category <> 'Sexual Health')) then
    raise exception 'anorgasmia merge: orgasmic-dysfunction is still adult or still filed Fetishes after re-filing';
  end if;

  ------------------------------------------------ part 2: drop the shadow
  -- Synonyms first, while `search_synonyms.tag_alias_id` still points at the
  -- alias — the FK is ON DELETE SET NULL, so a synonym row SURVIVES its alias
  -- and keeps rewriting queries toward the merged-away tag. Measured zero at
  -- authoring time; the ordering is here because being right only when the
  -- table happens to be empty is not being right.
  delete from public.search_synonyms where tag_alias_id = v_alias_id;
  get diagnostics v_n = row_count;
  raise notice 'anorgasmia merge: % shadow synonym(s) deleted', v_n;

  -- DELETE, never re-point. `trg_tag_alias_reject_shadow` is BEFORE INSERT OR
  -- UPDATE on `tag_aliases` only — it does not fire when a TAG is revived, so
  -- reviving `anorgasmia` with this row standing would silently create exactly
  -- the state that trigger exists to refuse. Re-pointing it at the survivor
  -- would be an alias equal to its own tag's slug, which is the same defect
  -- wearing a different hat.
  delete from public.tag_aliases where id = v_alias_id;

  ------------------------------------------------- part 3: revive the survivor
  select description, long_description, description_i18n
    into v_desc, v_long, v_desc_i18n
    from public.unified_tags where id = v_od;

  -- Revived BEFORE the merge, on purpose: `sync_tag_alias_to_search_synonym`
  -- only mints the query-rewrite rule when the canonical is already
  -- status='active', so merging into a deprecated row would produce the alias
  -- and silently skip its synonym.
  --
  -- status / deprecated_at / deprecation_reason move TOGETHER — the CHECK
  -- `unified_tags_status_matches_deprecated_at` makes the half-revived state
  -- unrepresentable, so getting it wrong aborts here rather than shipping.
  --
  -- human_reviewed is not decoration either: the row is `is_sensitive`, and
  -- `enforce_tag_seo_sensitivity_gate` forces seo_indexable=false on a
  -- sensitive row that is not human_reviewed. The prose being transplanted is
  -- the reviewed prose, so the flag travels with it rather than being invented.
  update public.unified_tags set
    description         = v_desc,
    long_description    = v_long,
    description_i18n    = coalesce(v_desc_i18n, '{}'::jsonb),
    status              = 'active',
    deprecated_at       = null,
    deprecation_reason  = null,
    seo_indexable       = true,
    seo_deindex_reason  = null,
    human_reviewed      = true,
    verification_status = 'reviewed'
  where id = v_anorg;

  if not exists (
    select 1 from public.unified_tags
     where id = v_anorg and status = 'active' and deprecated_at is null and seo_indexable
  ) then
    raise exception 'anorgasmia merge: the survivor did not come back active and indexable — a BEFORE gate refused it';
  end if;

  ----------------------------------------------------------- part 4: the merge
  v_audit := public.merge_tag_concept(
    v_anorg, v_od,
    'migration:anorgasmia-canonical-merge',
    'wikidata-label-canonicalisation');

  -- Not moved by the merge core. Without this the surviving page loses its
  -- Diagnostic codes band until the next weekly `tag_medical_codes_sync`
  -- (30 5 * * 1) rebuilds it from the QID.
  update public.tag_medical_codes set tag_id = v_anorg where tag_id = v_od;
  get diagnostics v_n = row_count;
  if v_n <> 7 then
    raise exception 'anorgasmia merge: expected 7 diagnostic codes to move, moved %', v_n;
  end if;

  -- Nor these. `Anorgasmie` and `Orgasmushemmung` are the German forms of the
  -- surviving name; left on the tombstone they would be aliases of a merged row.
  update public.tag_aliases set canonical_tag_id = v_anorg where canonical_tag_id = v_od;

  -- Nor this. `sexual-pain-penetration-disorder` is `status='merged'` and
  -- `seo_indexable=true` on prod today because the merge core does not deindex
  -- what it retires; a retraction that leaves the page advertised is not a
  -- retraction.
  update public.unified_tags
     set seo_indexable = false,
         seo_deindex_reason = 'migration:anorgasmia-canonical-merge'
   where id = v_od;

  ------------------------------------------------------------------ assertions
  -- The merge landed the way merge_tag_concept documents it, restated here
  -- rather than trusted.
  if not exists (
    select 1 from public.unified_tags
     where id = v_od and status = 'merged' and merged_into_id = v_anorg
       and not seo_indexable and deprecated_at is not null
  ) then
    raise exception 'anorgasmia merge: the tombstone is not cleanly merged and deindexed';
  end if;

  -- ONE live page for one live concept — the defect 20261217100000 refused to
  -- create by revival, stated as an outcome rather than an intention.
  select count(*) into v_bad from public.unified_tags
   where wikidata_id = 'Q1772397' and status = 'active';
  if v_bad <> 1 then
    raise exception 'anorgasmia merge: % active rows on Q1772397, expected 1', v_bad;
  end if;

  -- The URL actually moves. resolve_tag_slug does NOT consult tag_aliases —
  -- only unified_tags.slug (active) then tag_slug_redirects — so an alias is
  -- not a redirect and /tags/anorgasmia was a plain 404 until this ran.
  if not exists (select 1 from public.resolve_tag_slug('anorgasmia') r
                  where r.id = v_anorg and not r.redirected) then
    raise exception 'anorgasmia merge: /tags/anorgasmia does not resolve to the survivor';
  end if;
  if not exists (select 1 from public.resolve_tag_slug('orgasmic-dysfunction') r
                  where r.id = v_anorg and r.redirected) then
    raise exception 'anorgasmia merge: /tags/orgasmic-dysfunction does not redirect to the survivor';
  end if;

  -- The redirect target must be the ACTIVE row, or the edge lookup filters it
  -- out and the old URL 404s in one hop instead of redirecting.
  if not exists (
    select 1 from public.tag_slug_redirects r join public.unified_tags t on t.id = r.tag_id
     where r.old_slug = 'orgasmic-dysfunction' and r.new_slug = 'anorgasmia' and t.status = 'active'
  ) then
    raise exception 'anorgasmia merge: the redirect row is missing or points at a non-active tag';
  end if;

  -- The surviving page, as a reader meets it: not a fetish, not 18+, and
  -- carrying the clinical codes it was already publishing.
  if not exists (
    select 1 from public.unified_tags
     where id = v_anorg and status = 'active' and seo_indexable
       and not is_adult and category = 'Sexual Health'
  ) then
    raise exception 'anorgasmia merge: the survivor is not a non-adult, indexable Sexual Health page';
  end if;

  select count(*) into v_bad from public.tag_category_assignments
   where tag_id = v_anorg and category_id <> v_sexhealth;
  if v_bad > 0 then
    raise exception 'anorgasmia merge: % stray category junction(s) rode the merge onto the survivor', v_bad;
  end if;
  if (select count(*) from public.tag_category_assignments where tag_id = v_anorg and is_primary) <> 1 then
    raise exception 'anorgasmia merge: the survivor does not have exactly one primary category';
  end if;

  select count(*) into v_bad from public.tag_medical_codes where tag_id = v_anorg;
  if v_bad <> 7 then
    raise exception 'anorgasmia merge: survivor carries % diagnostic codes, expected 7', v_bad;
  end if;

  -- The merge inserted the loser's slug as a ('synonym','approved') alias; the
  -- reconcile ignores an alias that is not approved, so this is checked rather
  -- than assumed from reading the function.
  if not exists (
    select 1 from public.tag_aliases
     where alias_slug = 'orgasmic-dysfunction' and canonical_tag_id = v_anorg
       and alias_type = 'synonym' and review_status = 'approved'
  ) then
    raise exception 'anorgasmia merge: the surviving redirect alias is missing or unapproved';
  end if;
  if exists (select 1 from public.tag_aliases where canonical_tag_id = v_od) then
    raise exception 'anorgasmia merge: aliases are still parented to the tombstone';
  end if;

  -- Scoped to the slug that just went active. The corpus carries 26 other
  -- pre-existing shadows that are not this change's to clear, and folding them
  -- in would make the assertion unsatisfiable and therefore useless.
  --
  -- The predicate is "no alias carries this slug AT ALL", not "no alias carries
  -- it for a different tag", and the difference is not pedantry: mutation-tested
  -- by removing the Part 2 delete, the narrower form PASSED, because the
  -- re-parent above then sweeps the shadowing alias onto the survivor and
  -- launders it into a self-alias. That is still a defect, just a different one
  -- — it was caught two assertions down by alias_equals_name. An assertion that
  -- its own failure mode walks around is not an assertion.
  if exists (select 1 from public.tag_aliases where lower(alias_slug) = 'anorgasmia') then
    raise exception 'anorgasmia merge: an alias still carries the revived slug';
  end if;

  -- Corpus zero-invariants that a merge is known to move, restated on the shape
  -- rather than on these two rows. usage_count is included because
  -- recount_unified_tag_usage_for() historically recomputed it from three
  -- `tags[]` arrays instead of from assignments; 20261210100000 fixed that, and
  -- this asserts the fix rather than citing it.
  select count(*) into v_bad from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where lower(a.alias_name) = lower(t.name);
  if v_bad > 0 then
    raise exception 'anorgasmia merge: % alias(es) now equal their own tag name', v_bad;
  end if;

  select count(*) into v_bad from public.unified_tags
   where merged_into_id is not null and status <> 'merged';
  if v_bad > 0 then
    raise exception 'anorgasmia merge: % row(s) carry merged_into_id without status=merged', v_bad;
  end if;

  select count(*) into v_bad from public.unified_tags t
   where t.id in (v_anorg, v_od)
     and t.usage_count is distinct from
         (select count(*)::int from public.unified_tag_assignments a where a.tag_id = t.id);
  if v_bad > 0 then
    raise exception 'anorgasmia merge: usage_count disagrees with the assignment count on % row(s)', v_bad;
  end if;

  -- Search follows the entity writes through search_reindex_queue, not inline.
  -- Asserting the enqueue is the only thing this transaction can honestly
  -- assert; search_documents itself is settled a minute later by the drain.
  if (select count(*) from public.search_reindex_queue
       where entity_type = 'tag' and entity_id in (v_anorg, v_od)) = 0 then
    raise exception 'anorgasmia merge: neither row was enqueued for reindex';
  end if;

  raise notice 'anorgasmia merge: audit %, orgasmic-dysfunction -> anorgasmia, 7 codes moved', v_audit;
end
$mig$;
