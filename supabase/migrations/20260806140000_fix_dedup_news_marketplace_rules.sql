-- Fix two dedup sweep rules that produced only false positives.
--
-- Found by triaging the 1,070-pair review backlog: 588 of the open pairs came
-- from these two rules and NOT ONE of them was a duplicate.
--
-- news (406 pairs, incl. 50 at confidence 0.97 flagged auto_eligible)
--   The rule joined on despaced title + published day and never looked at the
--   URL. Zero of the 406 queued pairs shared a URL and 370 spanned different
--   publisher hosts -- identical wire/recap headlines ("Euphoria Season 3
--   Episode 5 Recap") collide across outlets. source_id gates auto_eligible but
--   it identifies the FEED, not the publisher, so aggregator feeds made
--   different-publisher pairs look same-source: a Yahoo article and a Decider
--   article were queued at 0.97 as auto-mergeable. Under mode='full' those would
--   have silently merged and deleted real articles.
--   True re-ingests cannot reach this rule anyway -- news_articles.fingerprint is
--   UNIQUE -- and multi-outlet coverage of one event is what news_stories /
--   news_story_articles exist for. Merging is simply the wrong operation.
--   Fix: require the URLs to match. `url` is added to the live CTE and the join
--   gains `and a.url is not distinct from b.url`.
--
-- marketplace (182 pairs)
--   same_merchant_tokens compared dedup_core_tokens as a SORTED array, so word
--   order was discarded and every variant axis encoded in word order collided:
--   "Black/White" = "White/Black", and worse "PLUG IT Egg ... 6.8 Inch"
--   (GBP 54.99) = "... 8.6 Inch" (GBP 89.99). All 182 pairs had a distinct
--   source_entity_id (merchant SKU) AND a distinct external_url; 55 differed in
--   price. Merging would delete separately purchasable products and show the
--   wrong price. The despaced-exact same_merchant_key arm (0.97) already catches
--   real duplicates, so the token arm is removed outright.
--
-- Verified after patching, via run_dedup_truth_sweep(<type>,'dry_run',300):
--   news        would_queue 406 -> 0
--   marketplace would_queue 182 -> 0
--   venue       unchanged (the genuinely ambiguous set)
--
-- Applied on prod by rewriting the live definition in place (the branches are
-- string literals inside one 17 KB function); this file records the resulting
-- source so the repo matches. The two edits are:
--   1. news live CTE:  select id, title, source_id, ...
--                   -> select id, title, url, source_id, ...
--   2. news join:      ... and a.dsp = b.dsp
--                   -> ... and a.dsp = b.dsp
--                        and a.url is not distinct from b.url
--   3. marketplace:    the entire `union all ... 'same_merchant_tokens' ...`
--                      arm is deleted.

-- Applied as anchored string surgery on the live definition rather than a 17 KB
-- paste: the edits are three exact substrings inside one big CASE, and doing it
-- this way keeps the diff reviewable. Every anchor is asserted, so if an earlier
-- migration has already reshaped this function the migration FAILS LOUDLY
-- instead of silently not applying. Idempotent: re-running is a no-op.
do $outer$
declare def text; newdef text; mkt_arm text; a1 text; a2 text; b1 text; b2 text;
begin
  def := pg_get_functiondef('public.run_dedup_truth_sweep(text,text,integer)'::regprocedure);

  -- already patched?
  if position('same_merchant_tokens' in def) = 0
     and position('a.url is not distinct from b.url' in def) > 0 then
    raise notice 'run_dedup_truth_sweep already patched; skipping';
    return;
  end if;

  mkt_arm := '      union all
      select a.id, b.id, a.title, b.title, false, 0.75, ''same_merchant_tokens'',
             null::double precision, a.q, a.f, a.c, b.q, b.f, b.c
      from live a join live b on a.merchant_domain = b.merchant_domain
        and a.id < b.id and a.core = b.core and a.dsp <> b.dsp
      where cardinality(a.core) >= 1
';
  if position(mkt_arm in def) = 0 then
    raise exception 'dedup fix: marketplace same_merchant_tokens arm not found';
  end if;
  newdef := replace(def, mkt_arm, '');

  a1 := 'select id, title, source_id, published_at::date pday, public.dedup_despace(title) dsp,';
  a2 := 'select id, title, url, source_id, published_at::date pday, public.dedup_despace(title) dsp,';
  if position(a1 in newdef) = 0 then
    raise exception 'dedup fix: news live CTE select not found';
  end if;
  newdef := replace(newdef, a1, a2);

  b1 := 'from live a join live b on a.pday = b.pday and a.id < b.id and a.dsp = b.dsp
    where length(a.dsp) >= 6';
  b2 := 'from live a join live b on a.pday = b.pday and a.id < b.id and a.dsp = b.dsp
      and a.url is not distinct from b.url
    where length(a.dsp) >= 6';
  if position(b1 in newdef) = 0 then
    raise exception 'dedup fix: news join not found';
  end if;
  newdef := replace(newdef, b1, b2);

  execute newdef;
end $outer$;

do $verify$
declare src text;
begin
  select prosrc into src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'run_dedup_truth_sweep';
  if position('same_merchant_tokens' in src) <> 0 then
    raise exception 'dedup fix verify: marketplace token arm still present';
  end if;
  if position('a.url is not distinct from b.url' in src) = 0 then
    raise exception 'dedup fix verify: news URL guard missing';
  end if;
end $verify$;
