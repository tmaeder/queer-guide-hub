-- Merge genuine duplicate tags that share a Wikidata identifier.
--
-- Companion to 20261221100000, which retracted the 34 identifiers that were
-- simply WRONG. These 37 pairs are the opposite case: two names for one thing.
-- Everything not in either migration is still open on purpose -- 21 groups need
-- a human call, 4 are generic-sense twins (mat-lace the textile vs lace the
-- fetish) and 2 are real vocabulary boundaries. Silence there is a decision.
--
-- DIRECTION follows one rule: merge toward the LIVE row and correct its filing
-- in the same migration, rather than flipping which slug is canonical. That is
-- cheaper (no slug churn, no redirect, no search_documents slug rewrite) and it
-- does not have to trade a live page against a correct one. Two directions were
-- FLIPPED by re-measuring rather than by reasoning:
--   prostate-stimulator wins over prostate-massager -- the QID label favours the
--     latter, but it is seo_indexable=false with the stub prose "Toys tag".
--   retifism and breast-fetishism win over shoe-fetish / breast-fetish, both of
--     which are not-indexable "Philia tag" stubs in Slang & Language.
--
-- THE CROSS-CATEGORY HAZARD IS THE WHOLE DESIGN. 13 of these 37 pairs cross a
-- category, and merge_tag_concept reparents the loser's tag_category_assignments
-- onto the winner. Two consequences, both live and both measured:
--
--   1. tag_category_assignments_one_primary_per_tag is UNIQUE(tag_id) WHERE
--      is_primary. Reparenting the loser's PRIMARY row gives the winner two, so
--      the merge dies on 23505 -- the recorded "aborts leaving two primaries"
--      failure. The loser's primary flag is therefore cleared BEFORE the call.
--   2. unified_tags_recompute_is_adult_trigger fires on that table and sets
--      is_adult from the winner's categories, and trg_tag_seo_sensitivity_gate
--      can then move seo_indexable. Carrying "Fetishes" onto a non-adult winner
--      silently marks it 18+ and can deindex it.
--
-- So each pair snapshots the winner's category set BEFORE the merge and drops
-- anything the merge added afterwards. It is a snapshot rather than "delete
-- everything except the intended category" because winners legitimately hold
-- several: drag-queen has 3 junction rows, blowjob / rimming / scissoring /
-- demigirl / lgbtq-friendly have 2. A blanket delete would strip real filings.
--
-- The only deliberate refile is lgbtq-culture, which is the live row (u=55) but
-- sits in Events & Parties with the prose "Cultural news and stories".
--
-- NOT a merge, deliberately: clothing/apparel. Their prose is inverted against
-- their filing -- clothing (Expression & Style, is_adult=false) carries the
-- fetish body, apparel (Gear, is_adult=true) the encyclopaedic one -- so either
-- direction publishes a page whose category and text disagree. That is a prose
-- decision. And gender-non-conforming stays on Q48270 beside non-binary: enby
-- is a synonym, GNC is a different concept, so this group is only half-resolved.
--
-- Generated from scripts/data-quality/out/decisions.json by
-- scripts/data-quality/generate-tag-merge-migration.mjs.
-- Do not hand-edit: src/lib/__tests__/tagMergeMigration.test.ts round-trips the two.

do $do$
declare
  r          record;
  v_before   uuid[];
  v_adult    boolean;
  v_index    boolean;
  v_wid      uuid;
  v_lid      uuid;
  v_cat      uuid;
  v_merged   int := 0;
  v_skipped  int := 0;
  v_stripped int := 0;
  v_left     int;
  v_primary  int;
begin
  create temp table _merge (winner text, loser text, qid text, refile text) on commit drop;
  insert into _merge (winner, loser, qid, refile) values
  ('accessibility', 'accessible', 'Q555097', null),
  ('age-play', 'ageplay', 'Q392963', null),
  ('agender', 'genderless', 'Q505371', null),
  ('bisexual', 'bisexuality', 'Q43200', null),
  ('blowjob', 'cocksucking', 'Q8401', null),
  ('breast-fetishism', 'breast-fetish', 'Q2651749', null),
  ('cafe', 'coffee-shop', 'Q30022', null),
  ('dapoxetine', 'priligy', 'Q424965', null),
  ('demigirl', 'demiwoman', 'Q93955709', null),
  ('drag-queen', 'dragqueen', 'Q337084', null),
  ('female-dominance', 'femdom', 'Q1404482', null),
  ('film', 'cinema', 'Q11424', null),
  ('film', 'movies', 'Q11424', null),
  ('fluoxetine', 'prozac', 'Q422244', null),
  ('hate-crimes', 'hate-crime', 'Q459409', null),
  ('heteroflexibility', 'heteroflexible', 'Q2880760', null),
  ('heterosexual', 'straight', 'Q1035954', null),
  ('homosexuality', 'homosexual', 'Q6636', null),
  ('lgbtq-community', 'lgbt-community', 'Q51393', null),
  ('lgbtq-culture', 'lgbt-culture', 'Q51389', 'Culture & Community'),
  ('lgbtq-friendly', 'lgbt-friendly', 'Q661717', null),
  ('lgbtqia-rights', 'queer-rights', 'Q17625913', null),
  ('market', 'marketplace', 'Q330284', null),
  ('mdma', 'ecstasy', 'Q69488', null),
  ('medroxyprogesterone-acetate', 'provera', 'Q2823834', null),
  ('muscle-worship', 'sthenolagnia', 'Q2599391', null),
  ('nightclub', 'night-club', 'Q622425', null),
  ('non-binary', 'enby', 'Q48270', null),
  ('prostate-massage', 'prostate-milking', 'Q646522', null),
  ('prostate-stimulator', 'prostate-massager', 'Q93929090', null),
  ('queer-history', 'lgbt-history', 'Q17897', null),
  ('restaurant', 'eateries', 'Q11707', null),
  ('retifism', 'shoe-fetish', 'Q1651685', null),
  ('rimming', 'analingus', 'Q210749', null),
  ('scissoring', 'tribbing', 'Q376032', null),
  ('shibari', 'japanese-bondage', 'Q1190983', null),
  ('stepbrother', 'step-brother', 'Q20746702', null);

  create temp table _refile (slug text, category text) on commit drop;
  insert into _refile (slug, category) values
  ('lgbtq-culture', 'Culture & Community');
  delete from _refile where slug is null;

  for r in select * from _merge order by winner, loser loop
    select id into v_wid from public.unified_tags where slug = r.winner and status = 'active';
    select id into v_lid from public.unified_tags where slug = r.loser  and status = 'active';

    -- A loser another session already merged is SKIPPED, not re-merged:
    -- merge_tag_concept raises 'duplicate already merged' and would abort the
    -- whole migration. Same composability rule as the retraction pass.
    if v_wid is null or v_lid is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select coalesce(array_agg(category_id), '{}') into v_before
      from public.tag_category_assignments where tag_id = v_wid;
    select is_adult, seo_indexable into v_adult, v_index
      from public.unified_tags where id = v_wid;

    -- Clear the loser's primary flag so the reparent cannot collide (see header).
    update public.tag_category_assignments
       set is_primary = false
     where tag_id = v_lid and is_primary;

    perform public.merge_tag_concept(v_wid, v_lid, 'tag-qid-dedupe', 'qid-duplicate-pass');
    v_merged := v_merged + 1;

    -- Drop whatever the merge added to the winner's filing.
    delete from public.tag_category_assignments
     where tag_id = v_wid and not (category_id = any(v_before));
    get diagnostics v_primary = row_count;
    v_stripped := v_stripped + v_primary;

    -- The winner's category, adult flag and indexability must survive the merge
    -- untouched. If any moved, the strip above did not undo what the reparent
    -- did, and continuing would publish a silently re-rated page.
    if exists (select 1 from public.unified_tags
                where id = v_wid and (is_adult is distinct from v_adult
                                   or seo_indexable is distinct from v_index)) then
      raise exception
        'merge % <- % moved the winner''s is_adult/seo_indexable', r.winner, r.loser;
    end if;
  end loop;

  -- Deliberate refile of a winner whose own filing was wrong. Insert the
  -- junction first: the AFTER trigger promotes the row category_id points at,
  -- and cannot promote one that does not exist.
  for r in select * from _refile loop
    select id into v_wid from public.unified_tags where slug = r.slug and status = 'active';
    select id into v_cat from public.tag_categories where name = r.category;
    if v_wid is null or v_cat is null then
      raise exception 'refile target missing: % -> %', r.slug, r.category;
    end if;
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (v_wid, v_cat, false)
    on conflict (tag_id, category_id) do nothing;
    update public.unified_tags set category_id = v_cat, updated_at = now()
     where id = v_wid and category_id is distinct from v_cat;
  end loop;

  raise notice 'tag merge: % merged, % skipped, % carried junctions stripped',
    v_merged, v_skipped, v_stripped;

  -- Re-assert the postconditions rather than trusting the counters.
  -- (a) every loser is retired and points at its winner.
  select count(*) into v_left
    from _merge m join public.unified_tags l on l.slug = m.loser
   where l.status <> 'merged';
  if v_left <> 0 then
    raise exception 'tag merge incomplete: % loser(s) still active', v_left;
  end if;

  -- (b) no winner was left holding two primary category rows, which is the
  --     shape that makes /tags/:slug pick a category nondeterministically.
  -- DISTINCT winners. Joining _merge directly multiplies a winner that appears
  -- on several rows (film absorbs both cinema and movies), so a single primary
  -- row counts twice and the check fails on correct data. It did, on the first
  -- dry run -- an aggregate over a one-to-many join inventing a defect.
  select count(*) into v_primary from (
    select a.tag_id
      from public.tag_category_assignments a
     where a.is_primary
       and a.tag_id in (select id from public.unified_tags
                         where slug in (select distinct winner from _merge))
     group by a.tag_id having count(*) > 1) z;
  if v_primary <> 0 then
    raise exception 'tag merge left % winner(s) with multiple primary categories', v_primary;
  end if;
end $do$;
