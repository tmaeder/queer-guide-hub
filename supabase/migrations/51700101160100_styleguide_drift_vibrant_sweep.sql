-- Styleguide drift: remove the one word that is 61% of the backlog, where and
-- only where the removal needs no judgement.
--
-- `styleguide_content_drift()` stood at 615 flagged rows over 138 active
-- phrases, and `vibrant` alone is 374 of the hits — the single largest entry by
-- a factor of two over `explore`. This file takes the part of that which is a
-- deletion rather than a rewrite, and leaves the rest NAMED.
--
-- WHY NOT JUST REWRITE ALL 615. Because that is the experiment this repo
-- already ran and retired: `tag-enrichment-sweep mode='prose'` had an LLM judge
-- and rewrite prose, its first live batch of 18 retracted 16 rows and **13 of
-- those were WRONG**, and both auto-apply paths are disabled with the cron off
-- (`20261018094000`). Doing it here would be the same mechanism at 34x the
-- scale, on city pages that rank. The deletion below is not that: it is a
-- literal, reversible, judgement-free string removal with no model in the loop.
--
-- TWO HYPOTHESES WERE MEASURED AND BOTH FAILED, which is why the scope is what
-- it is rather than what it first looked like.
--
--   (1) "Most of the backlog is on unreachable rows, so narrow the counter."
--       FALSE. `styleguide_content_drift()` already filters tags to
--       `status='active'`, so the 118 deprecated tag rows carrying drift were
--       never in the 615 at all. Cities are filtered only on `duplicate_of_id`,
--       so the genuinely unreachable share counted is 38 ghost/deindexed rows —
--       about 6%. Narrowing the scanner would have bought almost nothing and
--       would have hidden rows that a revive can make live again, which this
--       very repo does routinely (40 tags revived with prose unchanged in
--       50400101100100). THE COUNTER IS LEFT EXACTLY AS IT IS.
--
--   (2) "`vibrant` can be deleted globally." FALSE. The collocations are
--       grammatically varied: `a vibrant and X` 162, `the vibrant capital` 25,
--       `a vibrant city` 14, `and vibrant X` 34. A blanket deletion produces
--       "a and diverse city" and "beaches markets".
--
-- SO ONLY THE PROVABLY SAFE SHAPES ARE TOUCHED, and the unsafe ones are skipped
-- rather than guessed at:
--
--   a vibrant and <consonant>  -> a <consonant>     119 rows   "a vibrant and diverse city" -> "a diverse city"
--   the vibrant <word>         -> the <word>         26 rows   "the vibrant capital of" -> "the capital of"
--   its vibrant <word>         -> its <word>         23 rows   (with the possessive "'s vibrant" form)
--   a vibrant <consonant>      -> a <consonant>      30 rows   "a vibrant city" -> "a city"
--
--   SKIPPED — `a vibrant and <vowel>` (37 rows). Removing the adjective strands
--   the article: "a vibrant and iconic port" -> "a iconic port". Fixing that
--   means rewriting "a" to "an", and "a unique" / "a historic" are exactly the
--   cases where the vowel-letter test is wrong, so the article is not touched
--   and the rows are left.
--
--   SKIPPED — `and vibrant <word>` (34 rows). Genuinely ambiguous: "beaches and
--   vibrant markets" wants the adjective removed, "beautiful and vibrant city"
--   wants "and vibrant" removed, and nothing in the string distinguishes them.
--
-- ORDER IS LOAD-BEARING and removes the need for a lookahead. Rule 1 consumes
-- every `a vibrant and <consonant>`; whatever `a vibrant and ...` survives is
-- vowel-initial, and rule 5's character class `[b-df-hj-np-tv-z]` cannot match
-- the "a" of "and". So rule 5 is safe written plainly, without `(?!and)`.
--
-- SCOPE IS REACHABLE ROWS ONLY — indexable, not ghost/merged, not a duplicate.
-- The 38 unreachable rows keep their prose: they are counted by the sentinel
-- (see hypothesis 1) and rewriting text nobody is served is work for its own
-- sake. That is a deliberate, stated residue, not an oversight.
--
-- COST. A `cities` UPDATE reaches search one hop away (`trg_sync_geo_spine` ->
-- `geo_places` -> `search_reindex_queue`), measured at 2.6 ms/row by
-- `20260913114500`. ~200 rows is far inside the 300-row batch discipline, and
-- this is a one-shot rather than a recurring job.
--
-- PROVENANCE. Every touched row keeps its original text under
-- `field_provenance.description.styleguide_corrected.from`, built with `||`
-- rather than `jsonb_set(..., create_missing => true)` — the trap
-- `21050101100000` recorded, where `create_missing` creates only the LAST path
-- element and silently writes nothing when the parent key is absent.

select set_config('app.actor', 'migration:51700101160100_styleguide_drift_vibrant_sweep', true);

with target as (
  select c.id,
         c.description as before_txt,
         regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(c.description, '\ma vibrant and ([b-df-hj-np-tv-z])', 'a \1', 'g'),
               '\mthe vibrant (\w)', 'the \1', 'g'),
             '\mits vibrant (\w)', 'its \1', 'g'),
           '''s vibrant (\w)', '''s \1', 'g'),
         '\ma vibrant ([b-df-hj-np-tv-z])', 'a \1', 'g') as after_txt
    from public.cities c
   where c.duplicate_of_id is null
     and c.seo_indexable
     and coalesce(c.shell_status::text, 'real') not in ('ghost', 'merged')
     and c.description ~ '\mvibrant\M'
)
update public.cities c set
  description = t.after_txt,
  field_provenance = coalesce(c.field_provenance, '{}'::jsonb)
    || jsonb_build_object(
         'description',
         coalesce(c.field_provenance -> 'description', '{}'::jsonb)
           || jsonb_build_object(
                'styleguide_corrected',
                jsonb_build_object(
                  'from', t.before_txt,
                  'by',   'migration:51700101160100_styleguide_drift_vibrant_sweep',
                  'at',   now(),
                  'rule', 'removed the banned intensifier "vibrant" where deletion needs no article or clause repair')))
from target t
where c.id = t.id
  and t.after_txt is distinct from t.before_txt;

-- ── Postcondition ───────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_fixed    int;
  v_left     int;
  v_broken   int;
  v_skipped  int;
BEGIN
  -- Positive count: rows that carry the correction stamp.
  SELECT count(*) INTO v_fixed FROM public.cities
   WHERE field_provenance -> 'description' -> 'styleguide_corrected' ->> 'by'
         = 'migration:51700101160100_styleguide_drift_vibrant_sweep';
  IF v_fixed < 100 THEN
    RAISE EXCEPTION 'expected ~198 corrected city descriptions, found % — the patterns did not match', v_fixed;
  END IF;

  -- NOTHING MAY BE LEFT UNGRAMMATICAL. These are the exact breakages a careless
  -- deletion produces, and each is a real sentence shape from this corpus.
  SELECT count(*) INTO v_broken FROM public.cities
   WHERE duplicate_of_id IS NULL
     AND (description ~ '\ma and\M' OR description ~ '\mthe and\M' OR description ~ '\mits and\M'
          OR description ~ '\ba  +\w' OR description ~ '\mand\s+and\M');
  IF v_broken > 0 THEN
    RAISE EXCEPTION 'the sweep produced % ungrammatical description(s)', v_broken;
  END IF;

  -- The two skipped classes must STILL BE THERE. If they are zero, the sweep
  -- over-reached into the shapes this file deliberately refuses to guess at,
  -- and the "skipped" comment above would be a lie.
  SELECT count(*) INTO v_skipped FROM public.cities
   WHERE duplicate_of_id IS NULL
     AND (description ~* '\ma vibrant and [aeiou]' OR description ~* '\mand vibrant \w');
  IF v_skipped = 0 THEN
    RAISE EXCEPTION 'the deliberately-skipped vowel/ambiguous rows are gone — the sweep over-reached';
  END IF;

  -- Honest residue, reported not asserted: reachable rows still carrying the word.
  SELECT count(*) INTO v_left FROM public.cities
   WHERE duplicate_of_id IS NULL AND seo_indexable
     AND coalesce(shell_status::text,'real') NOT IN ('ghost','merged')
     AND description ~* '\mvibrant\M';

  RAISE NOTICE 'vibrant sweep: % descriptions corrected, % reachable rows still carry the word (% deliberately skipped shapes)',
    v_fixed, v_left, v_skipped;
END
$verify$;
