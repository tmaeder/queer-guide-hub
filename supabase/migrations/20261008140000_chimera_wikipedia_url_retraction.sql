-- Clear the wrong wikipedia_url on the 44 chimera tags — the layer
-- 20261007160200 missed, and the one that was doing the most damage.
--
-- WHAT WAS MISSED
--
-- 20261007160200_tag_wikidata_chimera_retraction cleared `long_description` and
-- `wikidata_id` on 44 tags whose stored identifier pointed at a different
-- subject. Verified on prod immediately afterwards with a Googlebot UA,
-- /tags/flogger STILL SERVED THE MiG-23 — not from cache (`cf-cache-status:
-- DYNAMIC`, no `age` header) and not from the prose, which was correctly gone.
--
-- It came from a THIRD column, `wikipedia_url`, rendered into the page's
-- JSON-LD:
--
--   "@type":"DefinedTerm","name":"Flogger","description":"Toys tag",
--   "sameAs":["https://en.wikipedia.org/wiki/Mikoyan-Gurevich_MiG-23"]
--
-- 42 of the 44 carry one, and `sameAs` is not prose — it is a MACHINE-READABLE
-- IDENTITY CLAIM. The page was telling search engines that our `passing` tag
-- IS the Wikipedia article on Death, `seafood` IS COVID-19, `kinderfur` IS
-- Child protection, `snuggling` IS Sexual intercourse, `s-a-m` IS the United
-- States. That is a stronger and more machine-actionable assertion than the
-- paragraph that was retracted, and it outlived the retraction.
--
-- THIS IS THE THIRD TIME THIS CLASS HAS BITTEN, IN THE SAME PROGRAM
--
--   1. 20261002100100 rewrote health-tag prose; six wrong wikidata_id survived.
--   2. 20261007160200 cleared prose + wikidata_id; 42 wrong wikipedia_url
--      survived — written while citing lesson 1.
--   3. This.
--
-- The rule that keeps being relearned: A DERIVED VALUE IS NOT ONE COLUMN.
-- Repairing an entity means enumerating every column and table that was derived
-- from the bad identifier, not the one that is most visible.
--
-- Checked for a fourth layer rather than assuming this is the last:
--   tag_sources          26 rows across these tags, ALL is_public = false, so
--                        none is rendered; left alone.
--   tag_medical_codes    keyed on wikidata_id, now null, so the weekly
--                        tag_medical_codes_sync cannot regenerate from them.
--   image_url            zero non-null on active tags (a hygiene invariant).
--
-- No search reindex is needed and none is triggered: trg_search_documents_tag
-- is scoped to (name, short_description, description, category, slug,
-- image_url, entity_kind, merged_into_id, deprecated_at, status) and
-- wikipedia_url is not among them. The JSON-LD is composed per request from the
-- table by functions/_lib/detail.ts, so clearing the column fixes the served
-- page directly.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:chimera-wikipedia-url-retraction', true);

do $mig$
declare
  v_bad  int;
  v_done int;
begin
  create temp table _chimera (slug text primary key) on commit drop;
  insert into _chimera (slug) values
    ('amateur'),('archangel'),('ballbuster'),('bearded'),('big'),('bingo'),
    ('branding'),('buck'),('buns'),('cane'),('crew'),('ddlg'),('dp'),('drone'),
    ('flogger'),('gimp'),('gin'),('hindu'),('human-doll'),('kinderfur'),
    ('madame'),('marionette'),('men-only'),('passing'),('piggy'),('pixie'),
    ('public'),('ralf'),('representation'),('s-a-m'),('seafood'),('siren'),
    ('sitter'),('size-xxs'),('snuggling'),('sounding'),('spankee'),('spill'),
    ('synchron'),('tease'),('trash'),('treffen'),('white-knight'),('witch');

  with upd as (
    update public.unified_tags t
       set wikipedia_url = null, updated_at = now()
      from _chimera c
     where t.slug = c.slug and t.wikipedia_url is not null
    returning 1)
  select count(*) into v_done from upd;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _chimera c
    join public.unified_tags t on t.slug = c.slug
   where t.wikipedia_url is not null or t.wikidata_id is not null;
  if v_bad > 0 then
    raise exception 'chimera wikipedia_url: % row(s) still point at an external entity', v_bad;
  end if;

  -- The named wrong targets must be gone corpus-wide, matched on the value
  -- itself rather than on the slug list, so another row in the same shape fails
  -- here instead of shipping.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and coalesce(wikipedia_url, '') ~ '(Mikoyan|/COVID-19|/Death$|/Child_protection|/PubMed|/Cross-site_scripting|/Sexual_intercourse|/United_States$|/Advisory_board)';
  if v_bad > 0 then
    raise exception 'chimera wikipedia_url: % active row(s) still link a known-wrong article', v_bad;
  end if;

  raise notice 'chimera wikipedia_url: % row(s) cleared', v_done;
end
$mig$;
