-- Retract 115 unusable page bodies, 103 of them published by the tag revival.
--
-- WHAT WENT WRONG
--
-- Waves 1-5 revived 1,067 tags on the strength of "the row already has prose".
-- The test for that was `description IS NOT NULL` — which is exactly what
-- tag_hygiene_stats().indexable_without_description measures, and it measures
-- PRESENCE, NOT SUBSTANCE. So the gate was green while the pages were not.
--
-- Measured on prod after the revival: 115 active rows have a long_description
-- that is not a definition, and every one of them is seo_indexable. Two
-- mechanical families plus a hand-found one:
--
--   1. AN LLM REFUSAL PUBLISHED AS ENCYCLOPEDIA CONTENT — 97 rows. fucklicking
--      reads "There is no provided information or sources about this term. If
--      you have any more context or details, I would be happy to try and help
--      further." This is the same class 20261002100100 cleaned out of the health
--      tags; its verify block already greps for several of these phrasings, and
--      this migration reuses that vocabulary rather than inventing a new one.
--
--   2. THE BODY IS THE TITLE REPEATED — 18 rows. long_description is literally
--      the tag name ("Fuckdoll", "Incest Play", "medical play"), so the page
--      renders a heading and one word.
--
--   3. A WRONG-ENTITY CHIMERA — white-knight is described as "Scene safety tag"
--      and its body reads "The White Knight is a 2011 American comedy film ...
--      stars Tom Sizemore and Olga Segura." Same failure as `bingo` -> "Bingo,
--      Bluey's younger sister" (20260919130000). And `sufferer`, whose body is
--      style guidance ABOUT the word rather than a definition OF it. Neither
--      matches a mechanical pattern; both were found by reading. They are listed
--      explicitly, because pretending a regex found them would be a lie about
--      how much of this class is detectable.
--
-- THE SELECTION IS A PREDICATE, NOT A SLUG LIST
--
-- A first draft of this migration carried 18 hand-collected slugs. That was a
-- large undercount — it had been sampled from rows whose body was SHORT, and
-- most refusals are several hundred characters long. Deriving the set from the
-- defect itself is what took it from 18 to 115, and it is why re-running this
-- after more revivals will still be correct.
--
-- WHY CLEARING, NOT REWRITING
--
-- There is nothing to repair: the body is absent, refused, or about a different
-- subject. Writing 115 replacement definitions is editorial work with its own
-- sourcing requirement and does not belong in a retraction. Clearing
-- long_description makes the page render its `description` alone, which for 39
-- of the 115 is a real definition — those pages end up correct and stay
-- published. Removing a claim is safe; inventing one is not.
--
-- INDEXABILITY IS DERIVED, NOT LISTED
--
-- After clearing, the deindex test is a length check on what actually remains
-- (76 rows fall below it), so it cannot drift from the data the way a
-- maintained list would. 80 characters is the bar: below it the page is a
-- dictionary stub with no body, which is what run_tag_thin_page_reindex exists
-- to keep out of the sitemap — and its re-index half will restore any of these
-- automatically once a real body is written.
--
-- run_tag_thin_page_reindex could NOT have caught these: it keys on
-- `description`, which is non-null on all 115, and never reads long_description.
--
-- The removed text is not lost. `unified_tags_audit` records before_data /
-- after_data for every row touched, and the actor set below names this migration
-- as the reason, so tag_change_log holds each retracted body.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:kinktionary-prose-defect-retraction', true);

do $mig$
declare
  r       record;
  v_bad   int;
  v_clear int := 0;
  v_deidx int := 0;
begin
  -- Materialised so the assertions test the same set the updates touched.
  create temp table _defect on commit drop as
  select id, slug
    from public.unified_tags
   where status = 'active'
     and (
       -- family 1: refusal artifacts
       coalesce(long_description, '') ~* 'there is no (available|provided|specific) information'
       or coalesce(long_description, '') ~* 'we cannot provide a detailed description'
       or coalesce(long_description, '') ~* 'if you have any (more context|other questions)'
       or coalesce(long_description, '') ~* 'i would be happy to try and help'
       or coalesce(long_description, '') ~* 'not a topic related to lgbtq'
       or coalesce(long_description, '') ~* 'no specific information provided about its relation'
       -- family 2: the body is the title
       or lower(btrim(long_description)) = lower(btrim(name))
       -- family 3: read by hand, no pattern to match on
       or slug in ('white-knight', 'sufferer')
     );

  for r in select id from _defect loop
    update public.unified_tags
       set long_description = null, updated_at = now()
     where id = r.id and long_description is not null;
    if found then v_clear := v_clear + 1; end if;
  end loop;

  for r in select d.id from _defect d
             join public.unified_tags t on t.id = d.id
            where t.seo_indexable
              and length(coalesce(nullif(btrim(t.description), ''), t.short_description, '')) < 80 loop
    update public.unified_tags
       set seo_indexable = false, updated_at = now()
     where id = r.id;
    v_deidx := v_deidx + 1;
  end loop;

  ------------------------------------------------------------------ assertions
  -- The defect itself, re-evaluated against the live table. Matching the
  -- condition rather than counting updates is what makes this meaningful.
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and (coalesce(long_description, '') ~* 'there is no (available|provided|specific) information'
       or coalesce(long_description, '') ~* 'we cannot provide a detailed description'
       or coalesce(long_description, '') ~* 'if you have any (more context|other questions)'
       or coalesce(long_description, '') ~* 'i would be happy to try and help'
       or coalesce(long_description, '') ~* 'not a topic related to lgbtq'
       or coalesce(long_description, '') ~* 'no specific information provided about its relation'
       or lower(btrim(long_description)) = lower(btrim(name)));
  if v_bad > 0 then
    raise exception 'prose retraction: % active row(s) still publish a non-definition body', v_bad;
  end if;

  -- Parenthesised deliberately: `a AND b OR c` binds as `(a AND b) OR c`, which
  -- would apply the second pattern to rows of any status and make this assert
  -- something other than it reads.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and (coalesce(long_description, '') ~* '2011 American comedy film');
  if v_bad > 0 then
    raise exception 'prose retraction: the wrong-entity film body is still published on % row(s)', v_bad;
  end if;

  -- The CI zero-invariant, for every row touched here.
  select count(*) into v_bad from _defect d
    join public.unified_tags t on t.id = d.id
   where t.seo_indexable
     and coalesce(nullif(btrim(t.description), ''), t.short_description) is null;
  if v_bad > 0 then
    raise exception 'prose retraction: % indexable row(s) left with no description at all', v_bad;
  end if;

  raise notice 'prose retraction: % bodies cleared, % rows deindexed, % examined',
    v_clear, v_deidx, (select count(*) from _defect);
end
$mig$;
