-- `nonbinary` and `non-binary` are the same concept on two live pages.
--
-- The last real duplicate in the gender-identity family. Both `status='active'`,
-- both `wikidata_id='Q48270'`, both filed under Gender — two glossary pages, two
-- search rows and two filter values for one identity.
--
-- THE OTHER THREE PAIRS THIS WAS GROUPED WITH ARE NOT DEFECTS, which is worth
-- recording because they were flagged as such. Measured 2026-08-30:
-- `deadname`, `misgender` and `transfemme` are each already `deprecated` against a
-- live twin (`deadnaming`, `misgendering`, `transfeminine`). That IS the resting
-- state a merge produces. Only this pair had both halves live.
--
-- CANONICAL IS THE HYPHENATED SPELLING, on corpus evidence rather than style
-- preference. `non-binary` carries 323 uses to `nonbinary`'s 131, has the better
-- short description ("Gender identity outside male/female binary" against
-- "Identifies as nonbinary"), and already has an alias attached. Merging the other
-- direction would rewrite 323 entity rows instead of 131 — more churn, same
-- result. Both spellings remain correct English and both keep resolving:
-- `merge_tag_concept` adds the loser's slug as an alias, so /tags/nonbinary
-- redirects rather than 404s.
--
-- The measurement that settles that this is a merge and not a distinction:
-- **usage_count goes 323 -> 333, not 454.** Verified in a rolled-back transaction
-- on prod. Roughly 121 entities already carried BOTH spellings — they were
-- double-tagged with two words for one thing, which is the clearest possible
-- evidence the corpus never treated them as different concepts.
--
-- `merge_tag_concept` is reversible: it snapshots every affected `tags[]` array
-- across 13 entity tables into an audit row and returns its id, and
-- `unmerge_tag_concept(p_audit_id)` replays it. The audit id is raised as a NOTICE
-- and recoverable from `tag_merge_audit` afterwards.
--
-- The documented "leaves TWO primaries" hazard does NOT fire here and was checked
-- rather than assumed: both tags sit in the same single category, so the canonical
-- ends with exactly one junction row. Asserted below regardless — a future pair in
-- two different categories would need the demote step.
--
-- `assert_admin_or_internal()` passes because `db push` is a direct DB session
-- with no `request.jwt.claims`, which that function returns early on.

select set_config('app.actor', 'admin:merge-nonbinary-20260830', true);

do $mig$
declare
  v_canon uuid;
  v_dup   uuid;
  v_audit uuid;
begin
  select id into v_canon from public.unified_tags where slug = 'non-binary';
  select id into v_dup   from public.unified_tags where slug = 'nonbinary';

  -- Idempotent, and safe against a sibling session having merged either way
  -- already: if the duplicate is gone or already merged, there is nothing to do.
  if v_canon is null or v_dup is null then
    raise notice 'merge_nonbinary: one side missing (canon=%, dup=%), skipping', v_canon, v_dup;
    return;
  end if;

  if exists (select 1 from public.unified_tags where id = v_dup and status = 'merged') then
    raise notice 'merge_nonbinary: already merged, skipping';
    return;
  end if;

  v_audit := public.merge_tag_concept(v_canon, v_dup, 'merge-nonbinary-20260830', 'manual');
  raise notice 'merge_nonbinary: merged, audit id % (unmerge_tag_concept to reverse)', v_audit;
end
$mig$;

do $verify$
declare v_n int; v_bad text;
begin
  -- One live page for the concept.
  select count(*) into v_n from public.unified_tags
   where slug in ('non-binary','nonbinary') and status = 'active';
  if v_n <> 1 then
    raise exception 'merge_nonbinary: expected exactly 1 active spelling, found %', v_n;
  end if;

  -- and it is the hyphenated one, pointed at by the other.
  select count(*) into v_n from public.unified_tags d
    join public.unified_tags c on c.id = d.merged_into_id
   where d.slug = 'nonbinary' and d.status = 'merged' and c.slug = 'non-binary';
  if v_n <> 1 then
    raise exception 'merge_nonbinary: nonbinary does not resolve to non-binary';
  end if;

  -- The loser's URL must still resolve, or this turns 131 tagged entities' links
  -- into 404s. `merge_tag_concept` adds the alias; assert it actually did.
  select count(*) into v_n from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where t.slug = 'non-binary' and a.alias_slug = 'nonbinary';
  if v_n <> 1 then
    raise exception 'merge_nonbinary: nonbinary was not preserved as an alias';
  end if;

  -- Exactly one primary junction row on the survivor — the two-primaries hazard.
  select count(*) into v_n from public.tag_category_assignments a
    join public.unified_tags t on t.id = a.tag_id
   where t.slug = 'non-binary' and a.is_primary;
  if v_n <> 1 then
    raise exception 'merge_nonbinary: canonical has % primary junction rows, expected 1', v_n;
  end if;

  -- No entity may still carry the merged slug in its tags[].
  select string_agg(x.tbl, ', ') into v_bad from (
    select 'venues' as tbl where exists (select 1 from public.venues where 'nonbinary' = any(tags))
    union all
    select 'events' where exists (select 1 from public.events where 'nonbinary' = any(tags))
    union all
    select 'personalities' where exists (select 1 from public.personalities where 'nonbinary' = any(tags))
    union all
    select 'news_articles' where exists (select 1 from public.news_articles where 'nonbinary' = any(tags))
  ) x;
  if v_bad is not null then
    raise exception 'merge_nonbinary: merged slug still present in tags[] on: %', v_bad;
  end if;

  -- The three pairs that were NOT defects stay as they are: one live, one
  -- deprecated. If a later pass "fixes" them by reviving the deprecated half this
  -- fails, which is the point.
  select string_agg(slug, ', ') into v_bad from public.unified_tags
   where slug in ('deadname','misgender','transfemme') and status = 'active';
  if v_bad is not null then
    raise exception 'merge_nonbinary: deprecated spelling variants went live again: %', v_bad;
  end if;
end
$verify$;
