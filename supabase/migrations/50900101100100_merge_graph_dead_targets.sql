-- Merge graph: the six deprecated merge targets the HIV/STI pass named and left.
--
-- 50400101100100 established the invariant — A MERGE TARGET MUST BE ACTIVE —
-- because a merge mints a redirect from the loser's slug to the winner's page,
-- so a winner that is deprecated is a redirect to a page that does not render.
-- It repaired seven and NAMED the remaining six rather than counting them
-- silently, because each needed an editorial decision on a row outside that
-- pass's subject. 50400101100300 then made the invariant a reported signal
-- (`tag_merge_graph_signals()`), where `target_deprecated` has stood at exactly
-- 6 by design ever since, warning rather than gating.
--
-- Those six decisions are made here, and they are NOT one decision. Reading the
-- targets splits them cleanly in two, and the split is about whether a correct
-- live destination exists — not about whether the target has text on it.
--
-- ── ONE REPOINT ─────────────────────────────────────────────────────────────
--
-- `fluctuating-evolving` → `fluctuating/evolving` is repointed to `abrosexual`.
--
-- Three things decided this. (a) The concept is ALREADY LIVE under its proper
-- name: `abrosexual` is active, indexable, 27 uses, and its `description` is
-- BYTE-IDENTICAL to the dead target's — both read "Sexual orientation that
-- changes over time". Reviving the target would have minted the duplicate the
-- `lesbophobia` and `deliriants` findings exist to prevent. (b) The target's
-- slug CONTAINS A SLASH. Measured corpus-wide, six tag slugs contain one and
-- five are `merged`, i.e. never rendered; `fluctuating/evolving` is the only
-- one a revive could publish, and `/tags/fluctuating/evolving` does not match
-- the `/tags/:tagName` route, so reviving it would have created this corpus's
-- first live unroutable page. (c) Its body is not vocabulary — "It's essential
-- to respect and acknowledge the fluidity of a person's identity ... Everyone's
-- experience is unique and valid" is the affirmation-boilerplate register
-- TAG_STYLE_SYSTEM bans and 20261012090000 stripped 112 rows of.
--
-- So the routable slug keeps routing and now lands on a live, correct page.
-- This is the same move as `sexually-transmitted-infections-stis` → `sti` in
-- 50400101100100: repoint onto the active row that already holds the concept.
--
-- The dead target is additionally DEINDEXED. It is `seo_indexable = true` while
-- `deprecated` — the trap 20360101101300 recorded and 50300101100000 hit on 41
-- rows at once. Nothing publishes it today, but the flag is a loaded gun for
-- whatever revives it next.
--
-- ── FIVE DEMOTIONS ──────────────────────────────────────────────────────────
--
-- For the other five there is no correct live destination, so the honest repair
-- is to stop claiming there is one: clear `merged_into_id` and leave the loser
-- `deprecated`. A merge whose target holds nothing a reader can use is not a
-- merge — it is two dead rows pretending to redirect. Both sides stay
-- deprecated, so nothing is published and nothing new is hidden; what goes away
-- is a redirect that resolves to a blank page.
--
--   jan-mikol-ek   → jan-mikolasek                  target 0-char body, 0-char description
--   kirsten-pl-tz  → kirsten-plotz                  target 0/0, no category at all
--   preistr-ger    → preistrager                    target 0/0 ("Preisträger", German scrape residue)
--   projectors     → projector                      target no body; its own deprecation_reason
--                                                   already reads "venue menu/scrape residue:
--                                                   rejected by the venue vocabulary and present
--                                                   on no live venue"
--   sensation-and- → sensation-stimulation-devices  target's DESCRIPTION is a scrape timestamp
--   stimulation-                                    ("Updated July  6, 2023 12:57pmUpdated July  6,
--   devices                                         2023 12:57pm") — the same defect as `stis-stds`,
--                                                   which 50100101100000 merged away — and its body
--                                                   is product prose closing "It's essential to
--                                                   prioritize safety and consent when using any
--                                                   device", the banned register again.
--
-- The four losers with mojibake slugs are the evidence the merges were correct
-- as merges; it is only their destinations that died under the same two blind
-- sweeps this repo has now documented five times.
--
-- WHY NOT REVIVE THE FIVE TARGETS. A revive publishes a page. Four of the five
-- have no body at all, so reviving them trades a redirect-to-nothing for a
-- live-page-with-nothing, which is worse: the first is invisible and the second
-- is indexable. The fifth has a body in a register this repo strips on sight.
--
-- WHAT THIS CHANGES IN THE SIGNAL. `target_deprecated` goes 6 → 0, so it stops
-- being a baseline six people scroll past and becomes a number where any
-- non-zero reading is new. `merges_total` falls by exactly 5 for the same
-- reason. The three structural keys were already 0 and stay 0.
--
-- THE DEMOTION MUST ALSO DEINDEX, and the postcondition here is what found
-- that. A `merged` row is inert to crawlers — measured, 0 of 288 merged tags
-- are in `search_documents` — so a merged row carrying `seo_indexable = true`
-- is untidy rather than harmful. A DEPRECATED one is not: that is the
-- publish-on-revive trap 20360101101300 recorded. Demoting `merged` ->
-- `deprecated` therefore CONVERTS a harmless leftover flag into a live one, and
-- `projectors` carries exactly that flag today. The first draft of this file
-- moved the status and left the flag; its own "nothing here may publish" check
-- rejected it on the dry run.
--
-- ONE UPDATE PER SLUG (the 27000 "tuple already modified" trap, 20260907100000).
-- ACTOR declared because `log_unified_tag_change()` RAISEs when a `system:%`
-- actor touches a `human_reviewed` row.
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS: every statement is guarded on
-- the state it repairs, so a row another session has already fixed is a no-op
-- rather than an abort that blocks every migration queued behind it.

select set_config('app.actor', 'migration:50900101100100_merge_graph_dead_targets', true);

-- ── Repoint: the routable slug lands on the live row holding the concept ─────
update public.unified_tags t set
  merged_into_id = (select a.id from public.unified_tags a
                     where a.slug = 'abrosexual' and a.status = 'active')
where t.slug = 'fluctuating-evolving'
  and t.merged_into_id is not null
  and exists (select 1 from public.unified_tags w
               where w.id = t.merged_into_id and w.status = 'deprecated')
  and exists (select 1 from public.unified_tags a
               where a.slug = 'abrosexual' and a.status = 'active');

-- ── Deindex the dead target (deprecated AND seo_indexable) ───────────────────
update public.unified_tags set
  seo_indexable = false
where slug = 'fluctuating/evolving'
  and status = 'deprecated'
  and seo_indexable;

-- ── Demote the five merges whose target holds nothing usable ─────────────────
update public.unified_tags set
  merged_into_id     = null,
  status             = 'deprecated',
  seo_indexable      = false,
  deprecation_reason = 'merge target held no usable content (50900101100100): the redirect resolved to a blank deprecated page, so the merge is withdrawn and both rows stay deprecated'
where slug in ('jan-mikol-ek','kirsten-pl-tz','preistr-ger','projectors','sensation-and-stimulation-devices')
  and merged_into_id is not null
  and exists (select 1 from public.unified_tags w
               where w.id = unified_tags.merged_into_id and w.status = 'deprecated');

-- ── Postcondition ───────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_sig     jsonb := public.tag_merge_graph_signals();
  v_total   int;
  v_demoted int;
  v_target  text;
BEGIN
  -- The invariant this file exists to reach: every merge target is ACTIVE.
  IF (v_sig->>'target_deprecated')::int <> 0 THEN
    RAISE EXCEPTION 'target_deprecated is %, expected 0 — remaining: %',
      v_sig->>'target_deprecated', v_sig->>'deprecated_examples';
  END IF;

  -- The three structural keys were already zero and may not regress.
  IF (v_sig->>'target_merged')::int <> 0
     OR (v_sig->>'target_missing')::int <> 0
     OR (v_sig->>'self_merged')::int <> 0 THEN
    RAISE EXCEPTION 'structural merge-graph keys regressed: %', v_sig::text;
  END IF;

  -- Positive control: the probe must be measuring a real corpus. Four zeroes
  -- from a corpus with no merges at all is not a clean merge graph, which is
  -- why 50400101100300 reports merges_total first.
  v_total := (v_sig->>'merges_total')::int;
  IF v_total < 250 THEN
    RAISE EXCEPTION 'merges_total is % — too low to trust the zeroes above', v_total;
  END IF;

  -- The repoint landed on the ACTIVE row, not merely on a different row.
  SELECT w.slug INTO v_target
    FROM public.unified_tags t
    JOIN public.unified_tags w ON w.id = t.merged_into_id
   WHERE t.slug = 'fluctuating-evolving' AND w.status = 'active';
  IF v_target IS DISTINCT FROM 'abrosexual' THEN
    RAISE EXCEPTION 'fluctuating-evolving does not point at the active abrosexual row (got %)',
      coalesce(v_target, 'no active target');
  END IF;

  -- The five demotions carry no merge claim and are deprecated, not active.
  SELECT count(*) INTO v_demoted FROM public.unified_tags
   WHERE slug IN ('jan-mikol-ek','kirsten-pl-tz','preistr-ger','projectors','sensation-and-stimulation-devices')
     AND merged_into_id IS NULL
     AND status = 'deprecated';
  IF v_demoted <> 5 THEN
    RAISE EXCEPTION 'expected 5 withdrawn merges left deprecated with no target; found %', v_demoted;
  END IF;

  -- Nothing here may publish anything.
  IF EXISTS (SELECT 1 FROM public.unified_tags
              WHERE slug IN ('fluctuating/evolving','jan-mikol-ek','kirsten-pl-tz','preistr-ger',
                             'projectors','sensation-and-stimulation-devices')
                AND seo_indexable) THEN
    RAISE EXCEPTION 'a row touched here is still seo_indexable';
  END IF;

  RAISE NOTICE 'merge graph: target_deprecated 6 -> 0 (1 repointed to abrosexual, 5 withdrawn), merges_total now %', v_total;
END
$verify$;
