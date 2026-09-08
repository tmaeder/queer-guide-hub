-- Revive 14 glossary terms that two sweeps culled, and repair two miscategorised
-- or mis-summarised rows.
--
-- Found by comparing the glossary against three English Wikipedia categories —
-- LGBTQ and disability, LGBTQ and health, LGBTQ and society (96 direct pages,
-- 34 subcategories). The comparison turned up two different problems, and this
-- migration handles the second one, which was the more surprising: a large part
-- of the "missing" vocabulary was not missing at all. It was DEPRECATED.
--
-- All 14 were culled by one of two passes, neither of which was reasoning about
-- glossary terms:
-- TWO CANDIDATES WERE DROPPED BECAUSE THEY ARE HELD AS ALIASES, and the two
-- cases are not the same finding:
--
--   `pinkwashing`   is an APPROVED alias of `rainbow-washing`, which is active.
--                   The concept is live under another name, so this was never a
--                   gap. Recorded so the next comparison against a category
--                   listing does not "find" it again and re-propose it.
--
--   `queer-theory`  is an alias of `queerness`, and that alias is WRONG: queer
--                   theory is an academic field, not a synonym for queerness,
--                   and it is typed `multilingual` as though it were a
--                   translation. It is `review_status='auto'`, so it neither
--                   displays as a synonym nor drives auto-tagging — but it does
--                   block the revival. Left alone deliberately: unpicking it
--                   means deleting a tag_aliases row and its search_synonyms row
--                   in the right order (that FK is ON DELETE SET NULL), which
--                   changes search behaviour and deserves its own change rather
--                   than riding along on a bulk revive. Until then the only live
--                   row for the phrase is `genre-queer-theory`, a BOOK GENRE tag.
--
-- Both were found by `tag_reject_alias_shadow()` aborting the first dry run, not
-- by inspection. The explicit guard below now says so before the UPDATE runs.
--
--   'auto: zero usage'                       — closeted, down-low, feminist-separatism,
--                                              gender-bender, homonationalism,
--                                              lesbian-feminism, queer-erasure
--   2026-06-05 orphan audit ("no entity      — bi-erasure, gay-separatism, heterosexism,
--   assignments, relations, synonyms,          homophile-movement, men-who-have-sex-with-men,
--   or aliases")                               no-homo, pinkwashing, queer-theory,
--                                              transmisogyny
--
-- THE PREMISE OF BOTH IS FALSE FOR A GLOSSARY TERM, which is exactly the finding
-- 20261211100000 recorded when it revived `femdom`, `voyeur` and `pretzel` on
-- identical grounds: a glossary term has no entity assignments by nature, so
-- those sweeps culled vocabulary rather than junk. None of the 14 is merged
-- (merged_into_id is NULL on every one), so none is a redirect to a surviving
-- concept — they are simply gone. Every one carries a real body, 323 to 558
-- characters, so nothing here is being invented; the prose already existed and
-- was being withheld.
--
-- What was lost is not marginal. `men-who-have-sex-with-men` is the standard
-- public-health category for HIV epidemiology and is absent from an LGBTQ+
-- health platform. `heterosexism`, `transmisogyny` and `pinkwashing` are core
-- vocabulary.
--
-- THE EXISTING BODIES ARE KEPT AS THEY ARE. They were written by an earlier
-- Wikidata/LLM pass and no human has read them, which is precisely why every row
-- comes back UNPUBLISHED — seo_indexable=false, human_reviewed=false,
-- verification_status='unverified'. Rewriting them here would be the LLM prose
-- rewrite this repo has banned since the judge measured at ~19% precision.
-- Reviving them published would be worse: most of the 14 are still
-- seo_indexable=true on their deprecated rows, so a revive that did not clear
-- that flag would put unreviewed machine prose straight in front of crawlers.
--
-- The cost, stated once: unpublished + zero usage means `deprecate_unused_tags`
-- can sweep them again. That is accepted for the same reason as elsewhere in
-- this branch — a term that gets swept can be revived again, a false
-- human_reviewed=true cannot be undone by inspection — and it is why the fix for
-- this class is eventually the sweep's predicate, not another revival.
--
-- FIVE HAVE NO CATEGORY AT ALL and would revive as uncategorized rows, which
-- `tag_hygiene_stats` counts and nothing would explain. They are assigned from
-- house precedent, not invented: `homophobia` and `transphobia` both sit in
-- Violence & Hate, so `heterosexism` and `transmisogyny` go there.
--
-- TWO REPAIRS ride along, both narrow:
--   `bi-erasure`  was filed under **Events & Parties**. Bisexual erasure is not
--                 an event. Moved to Orientation, where `biphobia` sits.
--                 `category_id` is the lever — the BEFORE trigger derives the
--                 text and the AFTER trigger moves the primary junction row,
--                 which is what /tags/:slug actually renders.
--   `trauma`      is ACTIVE and its `short_description` reads "Physical harm to
--                 living tissue" — the injury sense — on a row filed under
--                 Mental Health whose own long_description correctly opens
--                 "Psychological trauma is the lasting effect of an overwhelming
--                 experience". The card and the search facet render the short
--                 one, so the page contradicts itself. Only that single column
--                 is rewritten. This is NOT the wrong-sense class: the body is
--                 right and the Wikidata id is left alone.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:wikipedia-society-revivals', true);

-- The loop variable is `rec`, not `r`, and that is load-bearing: the guards
-- below alias the temp table as `_revive r`, and PL/pgSQL resolves a qualified
-- name to a DECLAREd variable before a table alias. With a variable named `r` in
-- scope, `r.slug` in a guard reads the unassigned record and the migration dies
-- with "record \"r\" is not assigned yet" — which is what it did on the first
-- dry run, before any row was touched.
do $mig$
declare
  rec    record;
  v_bad  int;
  v_n    int := 0;
begin
  create temp table _revive (slug text primary key, cat text) on commit drop;

  -- cat is NULL where the row already carries a correct category; it is only
  -- named where the row has none, or where the existing one is wrong.
  insert into _revive (slug, cat) values
    ('closeted',                  null),
    ('down-low',                  null),
    ('feminist-separatism',       null),
    ('gender-bender',             null),
    ('homonationalism',           null),
    ('lesbian-feminism',          null),
    ('queer-erasure',             null),
    ('homophile-movement',        null),
    ('gay-separatism',            'political-activism'),
    ('heterosexism',              'violence-hate'),
    ('transmisogyny',             'violence-hate'),
    ('men-who-have-sex-with-men', 'sexual-health'),
    ('no-homo',                   'slang-terminology'),
    ('bi-erasure',                'sexual-orientation');

  ------------------------------------------------------------------ guards
  select count(*) into v_bad from _revive r
   where not exists (select 1 from public.unified_tags t
                      where t.slug = r.slug and t.status = 'deprecated');
  if v_bad > 0 then
    raise exception 'society revivals: % row(s) are not deprecated — re-check before reviving', v_bad;
  end if;

  -- A merged row is a redirect to another concept and must never be revived:
  -- that would produce two live rows for one thing, pointing at each other.
  select count(*) into v_bad from _revive r
    join public.unified_tags t on t.slug = r.slug
   where t.merged_into_id is not null;
  if v_bad > 0 then
    raise exception 'society revivals: % row(s) are merged, not merely deprecated', v_bad;
  end if;

  -- Nothing here should be inventing prose. If a body has gone missing since
  -- this was authored, stop rather than publish an empty term.
  select count(*) into v_bad from _revive r
    join public.unified_tags t on t.slug = r.slug
   where coalesce(t.long_description, '') = '';
  if v_bad > 0 then
    raise exception 'society revivals: % row(s) have no body — this migration only revives, it does not write prose', v_bad;
  end if;

  select count(*) into v_bad from _revive r
   where r.cat is not null
     and not exists (select 1 from public.tag_categories c where c.slug = r.cat);
  if v_bad > 0 then
    raise exception 'society revivals: % row(s) name a category that does not exist', v_bad;
  end if;

  -- A slug held as an alias of another tag cannot be revived: two rows would
  -- answer to one name. `tag_reject_alias_shadow()` enforces this on the UPDATE,
  -- but it fires mid-loop about a single tag; checking up front names the whole
  -- set and points at the two known cases in the header.
  select count(*) into v_bad from _revive r
   where exists (select 1 from public.tag_aliases a where a.alias_slug = r.slug);
  if v_bad > 0 then
    raise exception 'society revivals: % slug(s) are held as an alias of another tag — not gaps, see header', v_bad;
  end if;

  ------------------------------------------------------------------ revive
  for rec in select * from _revive order by slug loop
    update public.unified_tags t set
      status              = 'active',
      deprecated_at       = null,
      deprecation_reason  = null,
      seo_indexable       = false,
      human_reviewed      = false,
      verification_status = 'unverified',
      category_id         = coalesce(
                              (select c.id from public.tag_categories c where c.slug = rec.cat),
                              t.category_id)
    where t.slug = rec.slug;
    v_n := v_n + 1;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'Revived unpublished. The row was culled by a sweep keyed on zero usage or on having no entity assignments, neither of which is evidence about a glossary term — a glossary term has no entity assignments by nature. Existing body kept unchanged and unreviewed; it predates this migration.',
           false
      from public.unified_tags t where t.slug = rec.slug;
  end loop;

  if v_n <> 14 then
    raise exception 'society revivals: expected 14, revived %', v_n;
  end if;

  ------------------------------------------------- repair: trauma summary line
  update public.unified_tags set
    short_description = 'The lasting effect of an overwhelming experience — not the event itself.'
  where slug = 'trauma'
    and status = 'active'
    and short_description = 'Physical harm to living tissue';

  if not found then
    raise exception 'society revivals: trauma did not carry the expected injury-sense summary — re-check by hand';
  end if;

  insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
  select t.id, 'editorial:general-knowledge',
         'short_description replaced. It read "Physical harm to living tissue" — the injury sense — while the row sits in Mental Health and its own long_description correctly describes psychological trauma. Only the summary line was wrong; body and Wikidata id untouched.',
         false
    from public.unified_tags t where t.slug = 'trauma';

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _revive r
    join public.unified_tags t on t.slug = r.slug
   where t.status <> 'active' or t.deprecated_at is not null or t.deprecation_reason is not null;
  if v_bad > 0 then
    raise exception 'society revivals: % row(s) revived into an inconsistent state', v_bad;
  end if;

  -- Not one may be publishable.
  select count(*) into v_bad from _revive r
    join public.unified_tags t on t.slug = r.slug
   where t.seo_indexable or coalesce(t.human_reviewed, false)
      or t.verification_status <> 'unverified';
  if v_bad > 0 then
    raise exception 'society revivals: % row(s) are publishable — they must land unreviewed and unindexed', v_bad;
  end if;

  -- Every revived row has a category. An uncategorized active row is the state
  -- the five null-category rows would otherwise have landed in.
  select count(*) into v_bad from _revive r
    join public.unified_tags t on t.slug = r.slug
   where t.category_id is null;
  if v_bad > 0 then
    raise exception 'society revivals: % revived row(s) have no category', v_bad;
  end if;

  -- The two recategorisations actually moved.
  select count(*) into v_bad from public.unified_tags
   where slug = 'bi-erasure' and category <> 'Orientation';
  if v_bad > 0 then
    raise exception 'society revivals: bi-erasure did not move to Orientation';
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug = 'trauma' and short_description ilike '%living tissue%';
  if v_bad > 0 then
    raise exception 'society revivals: trauma still carries the injury-sense summary';
  end if;

  -- The CI zero-invariant, corpus-wide.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and seo_indexable
     and coalesce(nullif(btrim(description), ''), short_description) is null;
  if v_bad > 0 then
    raise exception 'society revivals: % indexable row(s) corpus-wide have no description', v_bad;
  end if;

  raise notice 'society revivals: % revived, 2 repaired', v_n;
end
$mig$;
