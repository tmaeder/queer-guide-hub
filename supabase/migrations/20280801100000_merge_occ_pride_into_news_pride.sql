-- Two active tags are both named "Pride", and the collision hides every Pride
-- event on the site from tag-based discovery.
--
-- `run_event_tag_link` builds its key map from both `slug` and `name`, then
-- DROPS any key that resolves to more than one tag. Both `news-pride` and
-- `occ-pride` are named "Pride", so the key `pride` is ambiguous and discarded:
--
--     key      maps to  competing slugs              event uses blocked
--     pride    2        news-pride | occ-pride       7,398
--     history  2        genre-history | history         54
--     rubber   2        mat-rubber | rubber              2
--     (10 more namespaced/bare pairs)                     0
--
-- Measured consequence: 3,856 events carry tags that resolve to NOTHING, and
-- 3,855 of them are blocked by this single key — 3,772 distinct titles. On an
-- LGBTQ+ events platform, Pride events are invisible to the tag system. It is
-- the largest value in that table by two orders of magnitude.
--
-- THEY ARE GENUINE DUPLICATES, WHICH TOOK A REAL MEASUREMENT TO ESTABLISH.
-- A four-row sample of `news-pride` showed titles with no Pride connection
-- ("Chicago Deserves PWHL Team", "151: Politisode"), which read as a generic
-- news bucket wrongly named Pride, and the first plan here was to RENAME it.
-- That would have put a false label on explicitly-Pride content. Across the
-- full population the two are indistinguishable:
--
--     news-pride   1,559 news items   882 titles match \mpride\M   56.6%
--     occ-pride    1,116 news items   651 titles match \mpride\M   58.3%
--
-- Both are Pride tags. The difference is a namespace prefix, not a concept.
--
-- DIRECTION: `news-pride` SURVIVES, despite having FEWER assignments
-- (1,636 vs 2,179). Assignment volume is not the tiebreak here, because
-- `occ-pride`'s identity metadata is wrong:
--
--   news-pride   description "Pride events and celebrations"   wikidata NULL
--   occ-pride    description "Pride is a primary emotion…"     wikidata Q3071551
--
-- Q3071551 was read on Wikidata: label "pride", *instance of: emotion*,
-- subclass of satisfaction. It is the feeling, not the parade. `occ-pride`
-- inherited both the wrong QID and the emotion prose from the original `pride`
-- row, which carries the identical text and QID and was itself already merged
-- INTO `news-pride`. So `news-pride` is the established canonical and the only
-- one of the two that describes what it is tagging.
--
-- WHY THE WRONG METADATA DOES NOT TRAVEL. `merge_tag_concept` touches neither
-- `wikidata_id` nor `description` — verified against the deployed body, not
-- assumed. The survivor keeps its correct prose and its NULL QID; the emotion
-- QID dies with the loser. Had the merge copied those fields, this direction
-- would relabel the canonical Pride tag as an emotion and would be the wrong
-- call.
--
-- The documented "merge carries the loser's category junction" hazard does not
-- apply: `occ-pride` has NO `tag_category_assignments` row at all, and
-- `news-pride` keeps its primary (Events & Parties / events-scene). Checked
-- rather than hoped.
--
-- IDs are looked up by slug, never hardcoded.

do $mig$
declare
  v_canonical uuid;
  v_duplicate uuid;
  v_before    int;
  v_after     int;
begin
  select id into v_canonical from public.unified_tags
   where slug = 'news-pride' and status = 'active' and merged_into_id is null;
  select id into v_duplicate from public.unified_tags
   where slug = 'occ-pride'  and status = 'active' and merged_into_id is null;

  -- Idempotent: a re-run after the merge has landed finds no live duplicate and
  -- does nothing, rather than erroring or merging something else.
  if v_duplicate is null then
    raise notice 'occ-pride is not an active unmerged tag — nothing to do';
    return;
  end if;

  if v_canonical is null then
    raise exception 'pride merge: news-pride is not an active unmerged tag — direction cannot be assumed';
  end if;

  select count(*) into v_before
    from public.unified_tag_assignments where tag_id = v_canonical;

  -- Snapshot the survivor's identity metadata BEFORE the merge, so the check
  -- below can compare it across the merge instead of against a literal.
  -- Pinning the literal 'Pride events and celebrations' would make this migration
  -- abort -- taking the whole db push with it -- if anything edited news-pride's
  -- description first, and `description` is legitimately written by
  -- tag_enrichment_apply / the enrichment sweep and by hand in the admin CMS.
  -- What the assertion actually wants to prove is "the merge did not copy the
  -- loser's metadata onto the survivor", which is a BEFORE/AFTER property.
  create temp table if not exists _pride_merge_snapshot (
    description text,
    wikidata_id text
  ) on commit drop;
  delete from _pride_merge_snapshot;
  insert into _pride_merge_snapshot (description, wikidata_id)
  select description, wikidata_id from public.unified_tags where id = v_canonical;

  perform public.merge_tag_concept(
    p_canonical_id := v_canonical,
    p_duplicate_id := v_duplicate,
    p_actor        := 'migration:20270401100500_merge_occ_pride',
    p_source       := 'pride key collision blocked 7,398 event tag uses; duplicates confirmed at 56.6%/58.3% pride-titled'
  );

  select count(*) into v_after
    from public.unified_tag_assignments where tag_id = v_canonical;

  raise notice 'pride merge: news-pride assignments % -> %', v_before, v_after;
end
$mig$;

do $verify$
declare
  v_bad  int;
  v_amb  int;
  v_desc text;
  v_qid  text;
begin
  -- 1. The duplicate is merged, and merged into the RIGHT tag. A merge that
  --    landed in the other direction would still satisfy "is merged".
  select count(*) into v_bad
    from public.unified_tags d
    join public.unified_tags c on c.id = d.merged_into_id
   where d.slug = 'occ-pride' and c.slug <> 'news-pride';
  if v_bad > 0 then
    raise exception 'pride merge: occ-pride merged into the wrong tag';
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug = 'occ-pride' and (status <> 'merged' or merged_into_id is null);
  if v_bad > 0 then
    raise exception 'pride merge: occ-pride is not in the merged state';
  end if;

  -- 2. The survivor is still live and still says what it is. The whole reason
  --    this direction is safe is that the merge does not copy description or
  --    wikidata_id — so assert exactly that, rather than trusting the read.
  select description, wikidata_id into v_desc, v_qid
    from public.unified_tags where slug = 'news-pride';

  -- Compare ACROSS the merge, not against a literal. The snapshot is taken in the
  -- block above; if it is missing the migration short-circuited (occ-pride already
  -- merged), and there is nothing to verify.
  if to_regclass('pg_temp._pride_merge_snapshot') is not null then
    if exists (
      select 1 from _pride_merge_snapshot s
       where s.description is distinct from v_desc
          or s.wikidata_id is distinct from v_qid
    ) then
      raise exception
        'pride merge: the survivor''s identity metadata changed across the merge — description now %, wikidata_id now %',
        coalesce(v_desc, '<null>'), coalesce(v_qid, '<null>');
    end if;
  end if;

  -- Independent of the above: the survivor must not carry the loser's QID.
  -- Q3071551 is pride the EMOTION, which is what occ-pride was wrongly linked to.
  if v_qid = 'Q3071551' then
    raise exception 'pride merge: the survivor inherited Q3071551 — that is pride the EMOTION, not the event';
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug = 'news-pride' and (status <> 'active' or merged_into_id is not null);
  if v_bad > 0 then
    raise exception 'pride merge: the survivor is not active';
  end if;

  -- 3. THE POINT OF THE MIGRATION. The key `pride` must no longer be ambiguous
  --    in the map `run_event_tag_link` builds, or nothing is unblocked and this
  --    was an expensive no-op.
  select count(*) into v_amb from (
    select lower(btrim(k)) as key
      from public.unified_tags u, lateral (values (u.slug), (u.name)) v(k)
     where u.status = 'active' and u.merged_into_id is null and btrim(k) <> ''
     group by 1 having count(distinct u.id) > 1
  ) a where a.key = 'pride';
  if v_amb > 0 then
    raise exception 'pride merge: the key ''pride'' is still ambiguous — a third tag is named Pride';
  end if;

  -- 4. And it must resolve to the survivor, not merely be unambiguous. A key
  --    that resolves to nothing is also "not ambiguous".
  select count(*) into v_bad from public.unified_tags u
   where u.status = 'active' and u.merged_into_id is null
     and (lower(u.slug) = 'pride' or lower(u.name) = 'pride');
  if v_bad <> 1 then
    raise exception 'pride merge: expected exactly one active tag keyed ''pride'', found %', v_bad;
  end if;
end
$verify$;
