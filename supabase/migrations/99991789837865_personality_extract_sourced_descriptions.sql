-- The wrong entity's biography, taken from the Wikipedia EXTRACT rather than
-- from the Wikidata description. Four rows the first repair could not see.
--
-- `99991789833562_personality_wrong_entity_repair` cleared `description` on 125
-- rows whose `wikidata_qid` resolves to a different entity, guarded on equality
-- with THAT ENTITY'S OWN English Wikidata description, so a human who had
-- already corrected the field kept their work. Verified on prod after it
-- applied: 119 of 125 descriptions gone, and 6 still standing.
--
-- THE GUARD WAS RIGHT AND THE EVIDENCE WAS INCOMPLETE. `personality-refresh`
-- has TWO writers of `description`. The first is the Wikidata description; the
-- second is `fetchWikipedia(sitelinkTitle)` -> `wiki.extract`, the lead
-- paragraph of the linked article. Only the first was captured, so a row whose
-- text came from the extract compared against a NULL and was correctly left
-- alone -- there was no evidence against it. Q120416052 has no English Wikidata
-- description at all, which is exactly why `/personalities/mike-stone` kept
-- publishing "Milan \"Mike\" Stone was an American labor union leader."
--
-- Found by verifying on prod after the merge, not by the dry run: the first
-- migration's postcondition asserted "no row still carries the wrong entity's
-- WIKIDATA DESCRIPTION", which mike-stone never did. A postcondition can only
-- refute the hypothesis it encodes.
--
-- THE SIX SPLIT TWO WAYS AND ONLY FOUR ARE WRONG. Read individually rather than
-- swept, because the other two are this platform's own correct prose and a
-- blanket "clear every remaining description on a flagged row" would delete it:
--
--   CLEARED -- the other person's biography:
--     mike-stone     Q120416052  "Milan \"Mike\" Stone was an American labor
--                                union leader."
--     jason-collins  Q2317740    the NBA player's career, Stanford, the Nets
--     scott-miller   Q107984823  "...U.S. ambassador to Switzerland and
--                                Liechtenstein from 2022 to early 2025."
--     cameron-davis  Q116641682  "Miss Mississippi's Outstanding Teen 2022",
--                                off a Wikidata item that has since been DELETED
--
--   KEPT -- our own generated adult-performer prose, correct for the row:
--     felix-webster  "Felix Webster is a notable figure in the LGBTQ+ community
--                     as a gay adult performer from the Czech Republic..."
--     joe-parker     same shape
--
-- NO LIVE EXPOSURE REMAINS AS OF THIS MIGRATION, and that is measured, not
-- assumed: all four rows are `visibility='draft'`, and a draft personality is
-- not served to crawlers whatever `seo_indexable` says -- `/personalities/
-- mike-stone` answered Googlebot 404 with a cache-busting query string after the
-- first repair, where minutes earlier it had served the union leader's sentence
-- as its `<meta name="description">`. Two of the four are additionally
-- `seo_indexable=false`. This migration is therefore about the DATA, not about a
-- page: the wrong biography must not be sitting there to be republished the day
-- one of these rows is promoted.
--
-- Content-guarded on the exact stored text, so if a human rewrites any of these
-- between authoring and CI their version survives and the row is simply skipped.
-- Soft on preconditions, hard on postconditions.

do $repair$
declare
  v_actor   text := 'migration:99991789837865_personality_extract_sourced_descriptions';
  v_cleared int;
begin
  perform set_config('app.actor', v_actor, true);

  update public.personalities p
     set description = null,
         enrichment_status = coalesce(p.enrichment_status, '{}'::jsonb)
           || jsonb_build_object('wrong_entity_description_retracted', jsonb_build_object(
                'from', p.description,
                'qid',  p.enrichment_status -> 'wrong_entity_candidate' ->> 'qid',
                'source', 'wikipedia_extract',
                'by',   v_actor,
                'at',   now()
              ))
   where p.enrichment_status -> 'wrong_entity_candidate' ->> 'state' = 'confirmed'
     and p.description is not null
     and (
          (p.slug = 'mike-stone'    and p.description like 'Milan%labor union leader.')
       or (p.slug = 'jason-collins' and p.description like 'Jason Paul Collins was an American professional basketball player%')
       or (p.slug = 'scott-miller'  and p.description like 'Scott C. Miller is an American LGBT rights activist%')
       or (p.slug = 'cameron-davis' and p.description = 'Miss Mississippi''s Outstanding Teen 2022')
     );
  get diagnostics v_cleared = row_count;

  raise notice 'cleared % extract-sourced descriptions', v_cleared;
end $repair$;

do $verify$
declare
  v_bad     int;
  v_kept    int;
  v_stamped int;
begin
  -- (1) none of the four still publishes the other person's biography.
  --     Asserted on the WRONG TEXT, not on `description is null`: a human who
  --     writes a correct description for one of these rows between authoring and
  --     CI has fixed it, and a null-check would abort `db push` for the whole
  --     repo on somebody else's better repair.
  select count(*) into v_bad
    from public.personalities
   where (slug = 'mike-stone'    and description like 'Milan%labor union leader.')
      or (slug = 'jason-collins' and description like 'Jason Paul Collins was an American professional basketball player%')
      or (slug = 'scott-miller'  and description like 'Scott C. Miller is an American LGBT rights activist%')
      or (slug = 'cameron-davis' and description = 'Miss Mississippi''s Outstanding Teen 2022');
  if v_bad <> 0 then
    raise exception 'extract repair: % row(s) still carry the wrong person''s biography', v_bad;
  end if;

  -- (2) CONTROL. The two rows whose prose is OURS must survive. Without this,
  --     check (1) is equally satisfied by clearing every description in the
  --     table, which is the mirror failure and the more destructive one.
  select count(*) into v_kept
    from public.personalities
   where slug in ('felix-webster','joe-parker')
     and description is not null
     and description like '%notable figure in the LGBTQ+ community%';
  if v_kept <> 2 then
    raise exception 'extract repair: expected 2 kept adult-performer descriptions, found %', v_kept;
  end if;

  -- (3) the retraction is recoverable -- the prior text is on the row
  -- The stamp is written as `migration:<version>_<slug>`, so this must match
  -- that prefix. Comparing against the bare version would be a dead arm that
  -- can never fire -- an assertion that cannot fail is not an assertion.
  select count(*) into v_stamped
    from public.personalities
   where enrichment_status -> 'wrong_entity_description_retracted' ->> 'by'
         like 'migration:99991789837865%'
     and enrichment_status -> 'wrong_entity_description_retracted' ->> 'from' is not null;
  if v_stamped < 1 then
    raise exception 'extract repair: no row carries a recoverable retraction snapshot';
  end if;

  raise notice 'extract repair OK: 4 cleared, 2 kept, % snapshots', v_stamped;
end $verify$;
