-- The five summaries #3810 left gendered under a de-gendered description.
--
-- THIRD OCCURRENCE OF ONE MISTAKE, AND IT IS MINE EACH TIME. The pattern:
--
--   #3807  fixed two namesake SUMMARIES and left their BODIES.
--          -> #3835 cleaned up five bodies.
--   #3810  fixed thirteen gendered DESCRIPTIONS and left five SUMMARIES.
--          -> this file.
--
-- A row has three prose fields and they are read on different surfaces:
-- `description` is the lead paragraph on /tags/:slug, `short_description` is
-- the facet text in search AND the lead on a deindexed row, `long_description`
-- is the body. Repairing one and stopping is the half-repaired class this repo
-- already records on `collar` — careful kink prose in two fields with "Family
-- name or surname" still on the lead line. Writing the fix for it twice did not
-- stop me doing it a third time. WHEN A ROW IS WRONG IN ONE FIELD, READ ALL
-- THREE BEFORE MOVING ON.
--
-- Found by the prod e2e after #3810 and #3835 merged. It is also a lesson about
-- which of my two checks was honest: a bash script asserting only "the bad text
-- is gone" passed 28/0, because these rows are deindexed and the crawler
-- surface renders no <article> for them — absence of the defect and absence of
-- the page are the same green. The Playwright spec pairs every negative with a
-- POSITIVE fingerprint, so it refused to pass and sent me to the table.
--
--   clitoris          "Erogenous female sex organ with internal and external anatomy"
--   fallopian-tubes   "Part of female reproductive organs"
--   seminal-vesicles  "Male reproductive organs"
--   sperm             "Male reproductive cell"
--   testicle          "Male reproductive organ"
--
-- None is seo_indexable, so there is no crawler exposure — but a deindexed row
-- still renders to a signed-out reader in the SPA, and short_description is in
-- trg_search_documents_tag's column list, so this text IS the search facet.
--
-- Each replacement restates that row's own (already correct) description and
-- chooses nothing new. `description` is not touched: it is the evidence.
--
-- Guarded by src/lib/__tests__/glossarySummariesDegender.test.ts.

begin;

select set_config('app.actor', 'migration:99991789833238_glossary_summaries_degender', true);

update unified_tags t set short_description = v.s
from (values
  ('clitoris',         'The primary organ of sexual pleasure in people with a vulva.'),
  ('fallopian-tubes',  'The tubes carrying an egg from the ovaries to the uterus.'),
  ('seminal-vesicles', 'Glands behind the bladder that produce most of the fluid in semen.'),
  ('sperm',            'The reproductive cell carried in semen.'),
  ('testicle',         'One of the pair of organs that produce sperm and testosterone.')
) as v(slug, s)
where t.slug = v.slug
  and t.short_description ~* '\m(male|female)\M';

-- ── the eleven BODIES, which are what the page actually renders ──────────────
-- `tagDetail()` in functions/_lib/detail.ts renders long_description FIRST,
-- falling back to description and then short_description. #3810 rewrote
-- `description` on thirteen rows and left the bodies, so on every row that has
-- one the repair never reached a reader: /tags/erectile-dysfunction is
-- seo_indexable and still served "a condition where males experience persistent
-- or recurring inability ... the most common sexual problem in males" to
-- crawlers, which is the text #3810 existed to remove.
--
-- `ovaries` is worse than gendered — its body is about the OVUM ("The egg cell
-- or ovum is the female reproductive cell") on a row about the ORGAN. Wrong
-- subject, the class this pass keeps finding.
--
-- Nulled rather than rewritten: each row's `description` now carries the full,
-- correct definition, so the fallback renders it. Asserted against
-- tag_has_prose rather than assumed. Minting eleven replacement bodies would be
-- the LLM rewrite both auto-apply paths were retired for.
update unified_tags set long_description = null
where slug in ('erectile-dysfunction','clitoris','fallopian-tubes','foreskin','ovaries','perineum',
               'seminal-vesicles','sperm','testicle','uncircumcised','vagina')
  and coalesce(long_description,'') ~* '\m(male|female|males|females|men|women|man|woman)\M';

-- ============================ postconditions ============================
do $verify$
declare v_bad int; v_n int;
begin
  -- 1. the reached state, counted positively
  select count(*) into v_n from unified_tags
  where slug in ('clitoris','fallopian-tubes','seminal-vesicles','sperm','testicle')
    and status = 'active'
    and short_description !~* '\m(male|female)\M'
    and tag_has_prose(description, short_description);
  if v_n <> 5 then raise exception 'expected 5 de-gendered summaries, found %', v_n; end if;

  -- 2. THE WHOLE POINT: no row repaired by #3810 may still be gendered on ANY
  --    of its THREE prose fields. That is the check whose absence let the miss
  --    through twice — description was fixed while the summary and the body,
  --    which is the field the page actually renders, kept the old text.
  select count(*) into v_bad from unified_tags
  where slug in ('erectile-dysfunction','clitoris','ovaries','fallopian-tubes','foreskin','perineum',
                 'pregnancy','seminal-vesicles','sperm','testicle','vagina','uncircumcised','sex-worker')
    and (coalesce(short_description,'') ~* '\m(male|female)\M'
      or coalesce(long_description,'')  ~* '\m(male|female|males|females|men|women)\M'
      or coalesce(description,'') ~* '\m(male reproductive|female reproductive|female sex organ|in males)\M');
  if v_bad <> 0 then
    raise exception '% of the #3810 rows are still gendered on one of their three fields', v_bad;
  end if;

  -- 2b. every one of them still PUBLISHES something after the body is nulled —
  --     detail.ts falls back long_description -> description -> short_description
  select count(*) into v_bad from unified_tags
  where slug in ('erectile-dysfunction','clitoris','ovaries','fallopian-tubes','foreskin','perineum',
                 'seminal-vesicles','sperm','testicle','uncircumcised','vagina')
    and not tag_has_prose(description, short_description);
  if v_bad <> 0 then raise exception '% rows were left unpublishable', v_bad; end if;

  -- 3. description untouched — it is the evidence each replacement restates
  select count(*) into v_bad from unified_tags
  where slug in ('clitoris','fallopian-tubes','seminal-vesicles','sperm','testicle')
    and coalesce(btrim(description),'') = '';
  if v_bad <> 0 then raise exception '% rows lost their description', v_bad; end if;

  -- 4. CONTROLS: rows where the word is doing real work must survive. A sweep
  --    broad enough to take them would satisfy check 2 just as happily.
  select count(*) into v_bad from unified_tags
  where (slug = 'ceterosexual' and description !~* 'neither exclusively male nor female')
     or (slug = 'feminism'     and description !~* 'women''s rights')
     or (slug = 'penis'        and description !~* 'Trans women, non-binary people and intersex people');
  if v_bad <> 0 then raise exception '% control rows were swept', v_bad; end if;
end
$verify$;

commit;
