-- Re-clear `marineflieger`, whose wrong Wikidata identity came back after a human
-- removed it.
--
-- WHAT HAPPENED, from tag_change_log (join unified_tags on tag_id; the timestamp
-- column is created_at):
--
--   2026-09-04 22:54:20  admin:tag-review-backlog-drain   Q1898391 -> null
--   2026-09-05 08:01:53  llm:tag-enrichment-sweep         null -> Q1898391
--
-- Q1898391 is the Marinefliegerkommando, the naval air arm of the German Navy.
-- The tag is filed under `Sex & Kink`. A military branch was published as a kink
-- glossary entry nine hours after a human had judged it wrong and removed it, and
-- `tag_wikidata_repair_regressions()` — the sentinel written for exactly this
-- shape — has hard-failed `pipeline-health.yml` every day since.
--
-- WHY THE PRODUCER GUARD DID NOT HOLD. Reproduced against the live upstream
-- responses, not reasoned about. `_shared/tag-wiki-guard.ts` has three gates and
-- all three passed:
--
--   1. titleAgrees("Marineflieger", "Marineflieger") -> true. Exact. This is the
--      namesake shape the module's own header describes: the en.wikipedia article
--      really is titled "Marineflieger", so name agreement is what the failure
--      PRODUCES, not evidence against it.
--
--   2. implausibleClassOf(["naval aviation command"]) -> null, i.e. "plausible".
--      Q1898391's sole non-deprecated P31 is Q137515605 `naval aviation command`.
--      The `org` arm is a WORD LIST — it requires the literal string
--      organization/organisation/company/enterprise/university/... — so an
--      institution whose class label happens not to contain any of those words
--      walked straight through. A military unit is an institution; the rule was
--      right and its vocabulary was short.
--
--   3. The sense gate NEVER RAN. `isSenseCategory('Sex & Kink')` returns FALSE:
--      `SENSE_CATEGORY_KEYS` in `_shared/tag-style.ts` lists twelve categories by
--      slug and by display name and `sex-kink` / `sex & kink` is in neither list.
--      Had it fired it would have refused — the article's extract contains no
--      queer/kink vocabulary at all (`extractSupportsQueerSense` -> false).
--
-- Both holes are closed in this PR, independently, so neither alone is
-- load-bearing. Measured after the fix: the class gate returns `institution` and
-- the sense gate returns `generic-sense`; either refuses on its own.
--
-- THIS MIGRATION ONLY CLEARS. Per the 2026-08-29 repair's standing rule, prefer
-- NULL to a guess: nothing is re-resolved to a "better" QID, because
-- `tag_medical_codes_sync` and `tag_wikidata_hierarchy` rebuild from this
-- identifier weekly, so a plausible-but-wrong id regenerates wrong data forever
-- while a null one regenerates nothing. `wikipedia_url` goes with it — it is
-- literally the redirect target, the same wrong article.
--
-- No prose is retracted because there is none: measured on prod, description,
-- short_description and long_description are all NULL on this row, and
-- seo_indexable is already false. So this migration deliberately writes no
-- seo_indexable branch (the 20261008100000 repair needed one; here there is no
-- prose whose removal could empty the page).
--
-- The tag_wikidata_repair_audit row already exists from the human's clear
-- (disposition='cleared', previous_wikidata_id='Q1898391'). It is UPDATED, not
-- re-inserted, so `tag_wikidata_repair_regressions()` keeps comparing against the
-- same previous id — that equality is the whole sentinel predicate and must not
-- be disturbed.

do $repair$
declare
  v_id uuid;
  v_cleared int;
  v_still int;
begin
  -- log_unified_tag_change() RAISEs when an undeclared `system:%` actor modifies a
  -- human_reviewed row. This row is not human_reviewed, but declaring the actor is
  -- how a content write is attributed here and the record is the only way back.
  perform set_config(
    'app.actor', 'migration:20360901100000_tag_marineflieger_reclear', true);

  select id into v_id from public.unified_tags where slug = 'marineflieger';
  if v_id is null then
    raise notice 'marineflieger re-clear: tag not present, nothing to do';
    return;
  end if;

  -- Refuse to act on stale evidence. If the identifier has moved on since this
  -- migration was written, a human or a corrected resolver owns the row and
  -- clearing it would destroy their decision. Same guard as 20261008100000.
  update public.unified_tags
     set wikidata_id   = null,
         wikipedia_url = null,
         updated_at    = now()
   where id = v_id
     and wikidata_id = 'Q1898391';
  get diagnostics v_cleared = row_count;

  if v_cleared = 0 then
    raise notice 'marineflieger re-clear: identifier is no longer Q1898391, left alone';
    return;
  end if;

  update public.tag_wikidata_repair_audit
     set disposition   = 'cleared',
         wikidata_class = 'institution',
         reason = 'Q1898391 is the naval air arm of the German Navy (P31 '
               || 'Q137515605 "naval aviation command"). Cleared by a human '
               || '2026-09-04 22:54Z and re-adopted by tag-enrichment-sweep '
               || '2026-09-05 08:01Z; re-cleared here after closing both guard '
               || 'holes (institution class arm + Sex & Kink sense category).',
         repaired_at = now()
   where tag_id = v_id;

  -- The sentinel is the assertion. It reports a cleared tag that carries its old
  -- identifier again, so after this statement it must not see this row.
  select count(*) into v_still
    from public.tag_wikidata_repair_regressions()
   where slug = 'marineflieger';
  if v_still <> 0 then
    raise exception 'marineflieger re-clear did not take: still reported as a regression';
  end if;

  raise notice 'marineflieger re-clear: wikidata_id and wikipedia_url cleared';
end $repair$;
