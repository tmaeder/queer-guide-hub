-- Clear the last 38 news articles tagged by a vocabulary dump, and the 118
-- graph edges the reconciler already built from them.
--
-- WHAT THESE ROWS ARE
--
-- Some earlier path wrote SLICES OF THE TAG VOCABULARY onto news articles
-- instead of tags about the article. Most were cleaned by 20261007100000,
-- 20261007180000 and 20261007180100. 38 rows survived because the obvious
-- structural test — "every tag shares one initial and they are sorted" — does
-- not fire on them: their five tags are drawn from several places in the
-- alphabet at once.
--
-- What they are is not in doubt:
--
--   "Judge Orders Restoration of Slavery Exhibit"
--       giantess-foot-slave, service-slave, rest-and-leisure
--   "[Catholic/Anglican Caucus] Fr. James Martin praises Pope"
--       ass-fetish, safe-consumption-site-supervised-injection-facility
--   "Gemma Collins Shares Swimsuit Photo"
--       hot-railing-smoking-through-heated-glass-tube, sti
--   "GOP hopefuls debate US immigration policies"
--       rope-bat, anti-bullying-policies
--   "Best Movies in Miami in February"
--       three UN human-rights conventions, progestin-only-pill
--
-- A news report about restoring a HISTORICAL SLAVERY EXHIBIT carries BDSM
-- slave-play vocabulary. That is not merely wrong metadata.
--
-- HOW THE SET IS IDENTIFIED, AND WHY THE RULE IS SAFE
--
-- Twelve tags are provably dump-only. The evidence is not their subject matter
-- but their DISTRIBUTION:
--
--   * `civil-and-political-rights` and `history-and-activism` appear on
--     EXACTLY THE SAME 18 ARTICLES — among them "The Rookie Season 8", "Six
--     Flags' Cheap Passes Won't Fix Financial Issues" and "Economic Sentiment
--     in the U.S." Two independently-chosen editorial tags do not land on an
--     identical set.
--   * Across the whole corpus, NOT ONE article carries any of the twelve on its
--     own — every occurrence is alongside another one of them. An editorial tag
--     would appear alone somewhere. Measured: 38 articles with >=2, 0 with
--     exactly 1.
--
-- So the fingerprint is ">=2 of the twelve", and it selects 38 articles.
--
-- WHY ALL FIVE TAGS GO, NOT JUST THE TWELVE
--
-- ALL 38 CARRY EXACTLY FIVE TAGS — 38 of 38, against a corpus average of 3.69.
-- That is the dump's batch size, and it means the other tags on these rows came
-- out of the same write. Subtracting only the twelve would leave
-- `giantess-foot-slave` on the slavery article and `ass-fetish` on the Catholic
-- caucus piece, which is the worst possible outcome: the provably-wrong tags
-- removed and the offensive ones kept.
--
-- Clearing to '{}' rather than guessing a replacement. These articles lose
-- fabricated metadata and keep their content; the news tag backfill can tag
-- them properly later from the article text.
--
-- THE ASSIGNMENTS MUST GO TOO
--
-- run_tag_assignment_reconcile has already converted this text into 118 rows in
-- unified_tag_assignments across 37 of the 38, so the junk is live in the
-- content graph (tag pages, related rails), not just in a text column. Clearing
-- `tags` alone would leave those edges standing with nothing left to explain
-- them. Both entity_type spellings are handled — `nonclean_entity_type` is a
-- tracked hygiene metric precisely because both occur.
--
-- NOT A PRODUCER FIX. Measured before writing this: zero dump-shaped rows among
-- articles created in the last 10 days (3,578 with 4+ tags). The writing path is
-- not currently active, so this is residue, not an ongoing leak. If dumps
-- reappear, find the writer — do not re-run this.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:news-vocab-dump-residue', true);

do $mig$
declare
  v_ids    uuid[];
  v_n      int;
  v_bad    int;
  v_asg    int;

  -- CLASS A — kink, drug-method and clinical-contraception vocabulary. These
  -- have no editorial place on a news article, and the corpus agrees: EVERY
  -- occurrence of every one of them, without exception, is on a five-tag
  -- article. Not one was ever used on its own or on a normally-tagged row, so a
  -- SINGLE hit is enough to condemn the article.
  v_kink   text[] := array[
    'ass-fetish',
    'service-slave',
    'giantess-foot-slave',
    'rope-bat',
    'lab-rat',
    'hot-railing-smoking-through-heated-glass-tube',
    'vaginal-contraceptive-ring',
    'safe-consumption-site-supervised-injection-facility',
    'novel-psychoactive-substances-nps',
    'progestin-only-pill',
    'post-use-recovery-plan',
    'comedown-care',
    'after-scene-drop'
  ];

  -- CLASS B — dump-only by DISTRIBUTION rather than by subject. These read like
  -- plausible news tags, so two are required: `civil-and-political-rights` and
  -- `history-and-activism` land on exactly the same 18 articles, and no article
  -- anywhere carries any of them alone.
  v_dump   text[] := array[
    'convention-on-the-elimination-of-all-forms-of-discrimination-against-women',
    'convention-on-the-rights-of-persons-with-disabilities',
    'convention-on-the-rights-of-the-child',
    'un-high-commissioner-for-human-rights',
    'inter-american-court-of-human-rights',
    'two-spirit-advocacy',
    'civil-and-political-rights',
    'history-and-activism'
  ];
begin
  select array_agg(n.id) into v_ids
    from public.news_articles n
   where (select count(*) from unnest(n.tags) x where x = any (v_kink)) >= 1
      or (select count(*) from unnest(n.tags) x where x = any (v_dump)) >= 2;

  v_n := coalesce(array_length(v_ids, 1), 0);

  -- Absolute floor, not "nothing is left undone". An empty set must fail here
  -- rather than pass silently — the trap 20261007160400 fell into.
  if v_n < 30 then
    raise exception 'news vocab dump: only % article(s) matched the fingerprint; expected ~39', v_n;
  end if;

  -- The batch signature is load-bearing evidence that ALL five tags are dump
  -- output. If a matched row does not have exactly five, the assumption behind
  -- clearing the whole array does not hold for it and this must stop.
  select count(*) into v_bad
    from public.news_articles
   where id = any (v_ids) and coalesce(array_length(tags, 1), 0) <> 5;
  if v_bad > 0 then
    raise exception 'news vocab dump: % matched article(s) do not carry exactly 5 tags; the batch assumption does not hold', v_bad;
  end if;

  delete from public.unified_tag_assignments
   where entity_type in ('news', 'news_article')
     and entity_id = any (v_ids);
  get diagnostics v_asg = row_count;

  update public.news_articles
     set tags = '{}'::text[], updated_at = now()
   where id = any (v_ids);

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad
    from public.news_articles
   where id = any (v_ids) and coalesce(array_length(tags, 1), 0) > 0;
  if v_bad > 0 then
    raise exception 'news vocab dump: % article(s) still carry tags', v_bad;
  end if;

  select count(*) into v_bad
    from public.unified_tag_assignments
   where entity_type in ('news', 'news_article') and entity_id = any (v_ids);
  if v_bad > 0 then
    raise exception 'news vocab dump: % assignment(s) survived', v_bad;
  end if;

  -- Corpus-wide: the fingerprint must no longer match anything. Scoped wider
  -- than the id list on purpose, so a row that acquires the shape between the
  -- snapshot above and this check fails here instead of shipping.
  select count(*) into v_bad
    from public.news_articles n
   where (select count(*) from unnest(n.tags) x where x = any (v_kink)) >= 1
      or (select count(*) from unnest(n.tags) x where x = any (v_dump)) >= 2;
  if v_bad > 0 then
    raise exception 'news vocab dump: % article(s) still match the fingerprint', v_bad;
  end if;

  -- Not one kink, drug-method or contraception term may remain on ANY news
  -- article. This is the check that would have caught the row the first draft
  -- missed: "Joe DeCamillis brings experience to Las Vegas Raiders special
  -- teams", tagged ass-fetish + vaginal-contraceptive-ring, carried NONE of the
  -- class-B tags and so was invisible to a class-B-only fingerprint.
  select count(*) into v_bad
    from public.news_articles n
   where exists (select 1 from unnest(n.tags) x where x = any (v_kink));
  if v_bad > 0 then
    raise exception 'news vocab dump: % news article(s) still carry kink/drug vocabulary', v_bad;
  end if;

  raise notice 'news vocab dump: % article(s) cleared, % assignment(s) deleted', v_n, v_asg;
end
$mig$;
