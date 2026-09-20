-- Round nineteen: one summary stamped across a family of DIFFERENT DRUGS.
--
-- Round twelve found this class and named it: "one string stamped across rows
-- that are different things, where the shared summary erases the distinction
-- the family exists to draw." It repaired the sadist family and five gender
-- identities. This is the same class continued into the clinical families,
-- where the erased distinction is a dosing interval rather than a nuance.
--
-- Measured on prod, every one of these rows is ACTIVE and seo_indexable and
-- carries a CORRECT, detailed `description` (275-1183 chars of body beneath
-- it). Only `short_description` is flattened:
--
--   "Medication for erectile dysfunction"  x6  sildenafil tadalafil vardenafil
--                                              avanafil cialis levitra
--   "Antidepressant medication"           x3  fluoxetine paroxetine sertraline
--   "Medication for HIV prevention"       x2  descovy truvada
--   "HIV treatment medication"            x2  bictegravir raltegravir
--   "Medication for HIV/AIDS treatment"   x2  dolutegravir zidovudine
--
-- WHERE THIS RENDERS, AND WHERE IT DOES NOT. Both meta paths prefer
-- `description` -- `TagDetail.tsx:444` and `functions/_lib/detail.ts:1732` are
-- `description ?? short_description ?? ...` -- and description is correct on
-- all fifteen, so there is NO crawler or SEO harm here.
-- `search_documents_index_tags` is the opposite: it emits
-- `coalesce(t.short_description, t.description)`, so the flattened line WINS in
-- site search. Verified on prod: searching this corpus returns six results for
-- the ED drugs with one identical snippet.
--
-- WHY IT MATTERS MORE THAN A DUPLICATE SNIPPET. What separates these six drugs
-- on THIS platform is how long you must wait before poppers, and each row
-- already states its own answer: tadalafil and cialis 48 hours, avanafil 12,
-- sildenafil "unknown", vardenafil and levitra "no safe interval determined".
-- The summary that erases that is the one a reader meets first in search.
-- Descovy/Truvada is the same shape: Descovy's PrEP approval excludes people
-- at risk through receptive vaginal sex and Truvada's does not, which is the
-- entire reason a reader would search one name rather than the other.
--
-- THIS IS NOT THE MERGE PASS IT LOOKED LIKE. The search that found these also
-- returns `marriage`/`married`, `apparel`/`clothing`, `educator`/`teacher` --
-- genuine duplicate-TAG questions -- and `trans-man`/`transmasculine`, which is
-- the GENDERING class ("Man assigned female at birth" is wrong for
-- transmasculine, which includes non-binary people). Each needs its own
-- decision and none is touched here; see the CLAUDE.md entry.
--
-- SCOPE: `short_description` ONLY. No `description`, no `long_description`, no
-- identifier, no category. Nothing is written to `tag_wikidata_repair_audit` --
-- it is the INPUT to `tag_disowned_prose_signals()`, and a row there would
-- perturb a live metric to record what this file already records (round 12).
--
-- Every replacement restates the row's OWN description and adds no fact.
--
-- The actor declaration IS load-bearing: all fifteen rows are `human_reviewed`,
-- and six are `is_sensitive` so `tag_prose_apply()` is unavailable (it hard-
-- refuses sensitive rows whatever the caller claims). Verified live with a REAL
-- value change, since a self-assignment fires no trigger and reads exactly like
-- a permissive one: undeclared returns "human_reviewed tag 57ad63d4-... cannot
-- be modified by system:trigger"; declared is allowed.

select set_config('app.actor', 'migration:99991789887254_tag_prose_clinical_family_summaries', true);

-- Snapshot the two columns this pass must NOT touch, so the postcondition can
-- prove it rather than assert it.
create temporary table _r19_before on commit drop as
select slug, description, long_description
from unified_tags
where status = 'active'
  and slug in ('sildenafil','tadalafil','vardenafil','avanafil','cialis','levitra',
               'fluoxetine','paroxetine','sertraline','descovy','truvada',
               'bictegravir','raltegravir','dolutegravir','zidovudine');

-- ── Family A: PDE5 inhibitors ────────────────────────────────────────────────
-- Distinguished by the nitrite interval each row's own label section states.
update unified_tags set short_description =
  'Sold as Viagra; also treats pulmonary hypertension. Its label states no safe interval before nitrites.'
 where slug = 'sildenafil' and status = 'active'
   and short_description = 'Medication for erectile dysfunction';

update unified_tags set short_description =
  'Sold as Cialis; the longest-acting of its class. Its label requires 48 hours before any nitrate.'
 where slug = 'tadalafil' and status = 'active'
   and short_description = 'Medication for erectile dysfunction';

update unified_tags set short_description =
  'Sold as Levitra. Its label states that no safe interval before a nitrate has been determined.'
 where slug = 'vardenafil' and status = 'active'
   and short_description = 'Medication for erectile dysfunction';

update unified_tags set short_description =
  'Sold as Stendra or Spedra; the fastest-acting of its class. Its label requires 12 hours before any nitrate.'
 where slug = 'avanafil' and status = 'active'
   and short_description = 'Medication for erectile dysfunction';

update unified_tags set short_description =
  'Brand name for tadalafil, licensed both on demand and daily. Its label requires 48 hours before any nitrate.'
 where slug = 'cialis' and status = 'active'
   and short_description = 'Medication for erectile dysfunction';

update unified_tags set short_description =
  'Brand name for vardenafil. Its label states that no safe interval before a nitrate has been determined.'
 where slug = 'levitra' and status = 'active'
   and short_description = 'Medication for erectile dysfunction';

-- ── Family B: PrEP formulations ──────────────────────────────────────────────
-- The exclusion is the whole reason these two are not interchangeable.
update unified_tags set short_description =
  'Emtricitabine with tenofovir alafenamide. Its PrEP approval excludes people at risk through receptive vaginal sex.'
 where slug = 'descovy' and status = 'active'
   and short_description = 'Medication for HIV prevention';

update unified_tags set short_description =
  'Emtricitabine with tenofovir disoproxil, used for both HIV treatment and prevention.'
 where slug = 'truvada' and status = 'active'
   and short_description = 'Medication for HIV prevention';

-- ── Family C: SSRIs ──────────────────────────────────────────────────────────
update unified_tags set short_description =
  'SSRI antidepressant sold as Prozac; also used for OCD, panic disorder and bulimia.'
 where slug = 'fluoxetine' and status = 'active'
   and short_description = 'Antidepressant medication';

update unified_tags set short_description =
  'SSRI antidepressant sold as Paxil; also used for PTSD, social anxiety and menopausal hot flashes.'
 where slug = 'paroxetine' and status = 'active'
   and short_description = 'Antidepressant medication';

update unified_tags set short_description =
  'SSRI antidepressant sold as Zoloft; also used for panic disorder and OCD.'
 where slug = 'sertraline' and status = 'active'
   and short_description = 'Antidepressant medication';

-- ── Family D: HIV antiretrovirals ────────────────────────────────────────────
-- All three integrase inhibitors; the brand and the PEP role separate them.
update unified_tags set short_description =
  'Integrase inhibitor for HIV-1, taken as part of a single-tablet regimen.'
 where slug = 'bictegravir' and status = 'active'
   and short_description = 'HIV treatment medication';

update unified_tags set short_description =
  'Integrase inhibitor sold as Isentress, also used in post-exposure prophylaxis.'
 where slug = 'raltegravir' and status = 'active'
   and short_description = 'HIV treatment medication';

update unified_tags set short_description =
  'Integrase inhibitor sold as Tivicay, also used in post-exposure prophylaxis.'
 where slug = 'dolutegravir' and status = 'active'
   and short_description = 'Medication for HIV/AIDS treatment';

update unified_tags set short_description =
  'The first antiretroviral, also known as AZT; used in combination and to prevent transmission during birth.'
 where slug = 'zidovudine' and status = 'active'
   and short_description = 'Medication for HIV/AIDS treatment';

do $verify$
declare
  v_scope     int;
  v_flattened int;
  v_distinct  int;
  v_thin      int;
  v_touched   int;
  v_controls  int;
begin
  -- Soft on preconditions: a row a concurrent session deprecated or merged is
  -- simply out of scope. The floor is what stops that reading as success.
  select count(*) into v_scope
    from unified_tags
   where status = 'active'
     and slug in ('sildenafil','tadalafil','vardenafil','avanafil','cialis','levitra',
                  'fluoxetine','paroxetine','sertraline','descovy','truvada',
                  'bictegravir','raltegravir','dolutegravir','zidovudine');
  if v_scope < 12 then
    raise exception 'round 19: only % of 15 target rows are still active - refusing to report success on a corpus that moved out from under the file', v_scope;
  end if;

  -- 1. No row still carries a flattened family summary. Keyed on the WRONG
  --    text, so a better fix written by another session also satisfies it.
  select count(*) into v_flattened
    from unified_tags
   where status = 'active'
     and slug in ('sildenafil','tadalafil','vardenafil','avanafil','cialis','levitra',
                  'fluoxetine','paroxetine','sertraline','descovy','truvada',
                  'bictegravir','raltegravir','dolutegravir','zidovudine')
     and short_description in ('Medication for erectile dysfunction',
                               'Antidepressant medication',
                               'Medication for HIV prevention',
                               'HIV treatment medication',
                               'Medication for HIV/AIDS treatment');
  if v_flattened <> 0 then
    raise exception 'round 19: % target row(s) still publish a flattened family summary', v_flattened;
  end if;

  -- 2. The file's actual purpose, stated positively: every summary in scope is
  --    distinct. "The flattened text is gone" alone is satisfied by stamping a
  --    DIFFERENT single string across all fifteen.
  select count(distinct short_description) into v_distinct
    from unified_tags
   where status = 'active'
     and slug in ('sildenafil','tadalafil','vardenafil','avanafil','cialis','levitra',
                  'fluoxetine','paroxetine','sertraline','descovy','truvada',
                  'bictegravir','raltegravir','dolutegravir','zidovudine');
  if v_distinct <> v_scope then
    raise exception 'round 19: % distinct summaries across % active target rows - the family is still collapsed', v_distinct, v_scope;
  end if;

  -- 3. Nothing became unpublishable. Call the real predicate rather than
  --    restating its OR (round eleven).
  select count(*) into v_thin
    from unified_tags
   where status = 'active'
     and slug in ('sildenafil','tadalafil','vardenafil','avanafil','cialis','levitra',
                  'fluoxetine','paroxetine','sertraline','descovy','truvada',
                  'bictegravir','raltegravir','dolutegravir','zidovudine')
     and not tag_has_prose(description, short_description);
  if v_thin <> 0 then
    raise exception 'round 19: % row(s) fail tag_has_prose', v_thin;
  end if;

  -- 4. PROVE the scope claim rather than asserting it: this pass writes
  --    short_description only, so neither other prose column may have moved.
  select count(*) into v_touched
    from _r19_before b
    join unified_tags t on t.slug = b.slug and t.status = 'active'
   where t.description is distinct from b.description
      or t.long_description is distinct from b.long_description;
  if v_touched <> 0 then
    raise exception 'round 19: % row(s) had description/long_description modified - this pass writes short_description only', v_touched;
  end if;

  -- 5. Controls OUTSIDE the pass. `viagra` and `prep` already carried
  --    distinguishing summaries and are the in-corpus model for the fix; if a
  --    sweep took them too, the repair over-reached.
  select count(*) into v_controls
    from unified_tags
   where status = 'active'
     and ((slug = 'viagra' and short_description like 'Sildenafil, prescribed for erectile dysfunction%')
       or (slug = 'prep'   and short_description like 'Pre-exposure prophylaxis%'));
  if v_controls <> 2 then
    raise exception 'round 19: expected 2 untouched controls (viagra, prep), found %', v_controls;
  end if;

  raise notice 'round 19 OK: % rows in scope, % distinct summaries, 0 flattened, 0 thin, 0 collateral writes, 2 controls intact', v_scope, v_distinct;
end $verify$;
