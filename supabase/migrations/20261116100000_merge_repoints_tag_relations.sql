-- `merge_tag_concept` never touched `tag_relations`, so every merge orphans them.
--
-- Found by auditing the relations backlog. `merge_tag_concept` rewrites `tags[]`
-- across 13 entity tables and `unified_tag_assignments`, and it is careful about
-- both — but it does not mention `tag_relations` at all. (A substring search says
-- otherwise and is a false positive: the only match is inside
-- `tag_relationship_exclusions`, a different table whose name contains it. Worth
-- stating because that is how I first mis-read it.)
--
-- So a relation whose source or target gets merged keeps pointing at the dead row.
-- Measured 2026-08-30: **15 relations point at a merged tag**, 4 of them created
-- by the `naturism` -> `naturist` merge in 20261026100000 — i.e. this migration is
-- cleaning up after a merge from earlier in the same programme. Left alone, every
-- future merge adds more.
--
-- It matters because `get_tag_ontology` — the read path for the glossary page's
-- broader/narrower band — filters `t.status = 'active'` on the target but the
-- relation row survives, so the edge silently disappears from the page instead of
-- following the merge. `beach -[related]-> naturism` should read
-- `beach -[related]-> naturist`; instead beach simply loses the edge.
--
-- TWO CLASSES, TWO REMEDIES, and conflating them would be wrong:
--
--   MERGED (15) -> REPOINT. There is a canonical to move to, and the editorial
--     intent ("beach relates to naturism") is still true of the survivor.
--   DEPRECATED (76) -> DELETE. There is no canonical. These are scrape residue
--     from the food/venue vocabulary sweeps — `artichokes -[broader]-> vegetables`,
--     `arabic-coffee -[broader]-> coffee`, `casino -[broader]-> amenities`. The
--     tags are gone deliberately and the edges are dead weight.
--
-- Repointing has three ways to fail and all three are handled:
--   * `tag_relations_check` / `_no_self_chk` forbid source = target, and
--     `naturist -[related]-> naturism` becomes exactly that. Dropped, not repointed.
--   * `UNIQUE (source_tag_id, target_tag_id, relation_type)` — the repointed pair
--     may already exist. Dropped rather than upserted; the surviving row already
--     carries the relation and may have a better review_status.
--   * `trg_tag_relations_no_cycle` rejects a `broader` edge that would close a
--     cycle. Repointing can create one, so those are dropped too rather than
--     letting the trigger abort the whole migration.
--
-- Chains are followed to the terminal (A -> B -> C), capped at 10 hops, the same
-- shape `merge_tag_concept` already uses for its canonical resolution.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: hand-review the ~412 `auto` relations
-- between live tags. They are not a backlog. `get_tag_ontology` renders
-- `review_status in ('auto','approved')`, so `auto` already displays — and
-- `run_tag_cooccurrence_relations` DELETES every `related`/`auto` row and
-- regenerates it on each run, so promoting one to `approved` would pin a transient
-- co-occurrence artifact permanently, past the wipe that is supposed to retire it.
-- Approving them would be a bug, not a chore.

select set_config('app.actor', 'admin:merge-repoints-relations-20260830', true);

-- ── 1. Teach the merge to carry its relations ──────────────────────────────
create or replace function public.merge_tag_repoint_relations(
  p_canonical_id uuid,
  p_duplicate_id uuid
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_moved int := 0;
  -- GET DIAGNOSTICS assigns a variable directly from an item and accepts no
  -- expression, so `get diagnostics v_moved = v_moved + row_count` is a syntax
  -- error (42601). Accumulate through a scratch variable instead.
  v_n     int := 0;
begin
  -- Drop what cannot survive the move, before moving anything.
  --   a) would become a self-relation
  delete from public.tag_relations
   where (source_tag_id = p_duplicate_id and target_tag_id = p_canonical_id)
      or (source_tag_id = p_canonical_id and target_tag_id = p_duplicate_id);

  --   b) the canonical already holds the same edge
  delete from public.tag_relations d
   where d.source_tag_id = p_duplicate_id
     and exists (select 1 from public.tag_relations c
                  where c.source_tag_id = p_canonical_id
                    and c.target_tag_id = d.target_tag_id
                    and c.relation_type = d.relation_type);
  delete from public.tag_relations d
   where d.target_tag_id = p_duplicate_id
     and exists (select 1 from public.tag_relations c
                  where c.target_tag_id = p_canonical_id
                    and c.source_tag_id = d.source_tag_id
                    and c.relation_type = d.relation_type);

  --   c) a `broader` edge that would close a cycle once repointed. Checked here
  --      rather than left to trg_tag_relations_no_cycle, which would abort the
  --      caller's whole transaction instead of skipping one edge.
  delete from public.tag_relations d
   where d.relation_type = 'broader'
     and d.source_tag_id = p_duplicate_id
     and exists (
       with recursive up(id) as (
         select p_canonical_id
         union
         select r.target_tag_id from public.tag_relations r join up on r.source_tag_id = up.id
          where r.relation_type = 'broader'
       ) select 1 from up where up.id = d.target_tag_id);

  update public.tag_relations set source_tag_id = p_canonical_id
   where source_tag_id = p_duplicate_id;
  get diagnostics v_n = row_count;
  v_moved := v_moved + v_n;

  update public.tag_relations set target_tag_id = p_canonical_id
   where target_tag_id = p_duplicate_id;
  get diagnostics v_n = row_count;
  v_moved := v_moved + v_n;

  return v_moved;
end;
$fn$;

comment on function public.merge_tag_repoint_relations(uuid, uuid) is
  'Moves tag_relations from a merged duplicate onto its canonical, dropping edges that would self-reference, duplicate an existing edge, or close a broader-cycle. Fired by trg_unified_tags_repoint_relations on any write that sets status=merged; safe to call again (idempotent once the duplicate has no relations left).';

revoke all on function public.merge_tag_repoint_relations(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_tag_repoint_relations(uuid, uuid) to service_role;

-- ── 1b. Fire it from the row, not from one caller ──────────────────────────
-- A TRIGGER rather than a CREATE OR REPLACE of `merge_tag_concept`, for two
-- reasons:
--
--   1. `merge_tag_concept` is not the only writer. This repo has twelve merge
--      cores plus `merge_tag`, and a fix wired into one of them leaves the rest
--      orphaning relations exactly as before. The trigger keys on the STATE
--      (status becoming 'merged' with a canonical), so every path is covered
--      including ones written later.
--   2. Restating a shared SECURITY DEFINER function from a feature branch is a
--      known collision surface here — two branches that both CREATE OR REPLACE
--      the same function silently drop each other's changes on merge. Adding a
--      trigger touches nothing another branch is likely to be rewriting.
--
-- AFTER, so the row is already in its merged state; guarded on the transition so
-- a later UPDATE of an already-merged row is a no-op. No recursion risk:
-- `tag_relations` has no trigger that writes back to `unified_tags`.
create or replace function public.unified_tags_repoint_relations_on_merge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $trg$
begin
  perform public.merge_tag_repoint_relations(new.merged_into_id, new.id);
  return null;
end;
$trg$;

drop trigger if exists trg_unified_tags_repoint_relations on public.unified_tags;
create trigger trg_unified_tags_repoint_relations
  after update of status, merged_into_id on public.unified_tags
  for each row
  when (new.status = 'merged'
        and new.merged_into_id is not null
        and (old.status is distinct from 'merged' or old.merged_into_id is distinct from new.merged_into_id))
  execute function public.unified_tags_repoint_relations_on_merge();

-- ── 2. Repair what past merges already orphaned ────────────────────────────
do $mig$
declare
  r        record;
  v_canon  uuid;
  v_hops   int;
  v_moved  int := 0;
  v_repointed int := 0;
begin
  for r in
    select distinct d.id as dup_id, d.slug as dup_slug
      from public.unified_tags d
     where d.status = 'merged'
       and d.merged_into_id is not null
       and exists (select 1 from public.tag_relations x
                    where x.source_tag_id = d.id or x.target_tag_id = d.id)
  loop
    -- Follow the chain to its terminal, same cap as merge_tag_concept.
    v_canon := r.dup_id; v_hops := 0;
    loop
      exit when v_hops >= 10;
      exit when not exists (select 1 from public.unified_tags
                             where id = v_canon and status = 'merged' and merged_into_id is not null);
      select merged_into_id into v_canon from public.unified_tags where id = v_canon;
      v_hops := v_hops + 1;
    end loop;

    if v_canon is null or v_canon = r.dup_id then
      raise notice 'repoint: % has no resolvable canonical, skipped', r.dup_slug;
      continue;
    end if;

    v_moved := public.merge_tag_repoint_relations(v_canon, r.dup_id);
    v_repointed := v_repointed + v_moved;
    raise notice 'repoint: % -> canonical, % edge(s) moved', r.dup_slug, v_moved;
  end loop;

  raise notice 'repoint: % edge(s) moved in total', v_repointed;
end
$mig$;

-- ── 3. Drop the deprecation-orphaned edges ─────────────────────────────────
-- No canonical exists for a deprecated tag, so there is nothing to move to. These
-- are scrape residue whose tags were retired on purpose.
delete from public.tag_relations r
 using public.unified_tags s, public.unified_tags t
 where r.source_tag_id = s.id and r.target_tag_id = t.id
   and (s.status = 'deprecated' or t.status = 'deprecated');

do $verify$
declare v_n int; v_bad text;
begin
  -- No relation may reference a non-active tag in either direction.
  select count(*) into v_n from public.tag_relations r
    join public.unified_tags s on s.id = r.source_tag_id
    join public.unified_tags t on t.id = r.target_tag_id
   where s.status <> 'active' or t.status <> 'active';
  if v_n <> 0 then
    raise exception 'repoint: % relation(s) still reference a dead tag', v_n;
  end if;

  -- The specific edges the naturism merge orphaned must have followed it, not
  -- vanished. `beach` and `clothing-optional` related to the concept before the
  -- merge and still do.
  select string_agg(s.slug, ', ') into v_bad
    from public.tag_relations r
    join public.unified_tags s on s.id = r.source_tag_id
    join public.unified_tags t on t.id = r.target_tag_id
   where t.slug = 'naturist' and s.slug in ('beach','clothing-optional');
  if v_bad is null then
    raise exception 'repoint: the naturism edges did not follow the merge onto naturist';
  end if;

  -- and the one that would have become a self-relation is gone rather than
  -- having aborted the migration.
  select count(*) into v_n from public.tag_relations
   where source_tag_id = target_tag_id;
  if v_n <> 0 then
    raise exception 'repoint: % self-relation(s) created', v_n;
  end if;

  -- The unique key still holds.
  select count(*) into v_n from (
    select source_tag_id, target_tag_id, relation_type
      from public.tag_relations
     group by 1,2,3 having count(*) > 1) d;
  if v_n <> 0 then
    raise exception 'repoint: % duplicate edge(s) created', v_n;
  end if;
end
$verify$;
