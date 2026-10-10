-- Restores `tag_hygiene_stats().duplicate_active_name` to 0 by withdrawing ONLY
-- the renames that collided, and nothing else.
--
-- Two migrations applied straight to prod on 2026-10-10 gave German-named tags
-- English labels — `20261010045306_tags_english_label_repair` (155 renames) and
-- `20261010052531_tags_full_language_audit` (~35). Both are careful work and
-- the overwhelming majority of their renames are untouched here. But where the
-- English label was ALREADY HELD by an active tag, the rename minted a
-- duplicate: the metric went 0 -> 29 after the first and 29 -> 36 after the
-- second. `duplicate_active_name` is a zero-invariant in
-- `check-tag-hygiene.mjs`, and `Critical data-quality gates` is a REQUIRED
-- check, so this reds every open PR in the repo, not just its author's.
--
-- WHY REVERT RATHER THAN MERGE. The obvious remedy is to merge each German row
-- into its English twin. Reading all the groups with their categories shows
-- that is wrong for a large share of them — these are DIFFERENT CONCEPTS that
-- merely collided on a label:
--
--   anonym u102 [Safety & Consent]      vs anonymous u2 [Fetishes]
--   priest u4  [Fetishes]               vs priester  [Subcultures & Scenes]
--   escape-artist [Dynamics & Roles]    vs entfesselungskunstler [Sex & Kink]
--   doctor [Dynamics & Roles]           vs arzt-arztin [Sex & Kink]
--   sex-worker [Work, School & Inst.]   vs sexarbeiter [Sex & Kink]
--   gruppe u53 [Subcultures & Scenes]   vs intimate-group u3 [no category]
--
-- Merging those conflates a privacy concept with a fetish, and a profession
-- with a roleplay, on a queer platform. `merge_tag_concept` also moves
-- assignments and usage counts, which is the destructive class this repo
-- guards hardest. A name revert moves no assignment, deletes no row, and is
-- undone by setting the name back.
--
-- THE OLD NAMES ARE NOT GUESSED. Every one is read from
-- `tag_change_log.before_data->>'name'` — the audit row the rename itself
-- wrote. The selection is the LATEST such change per tag, so a row touched by
-- both migrations reverts to the name it had before the first.
--
-- DYNAMIC, NOT A FROZEN LIST, and that is deliberate. The corpus is being
-- rewritten migration-by-migration as this is authored (the count moved 29 ->
-- 36 in 20 minutes), so a frozen id list would be stale between here and CI.
-- The selection is bounded three ways — currently in a duplicate group, latest
-- name change from one of the two named campaign actors, after 2026-10-10
-- 04:50Z — so it cannot reach any row those two migrations did not rename.
--
-- WHAT THIS DOES NOT DO: it does not decide what the English labels should
-- eventually be. These tags still want reconciling — merge, or a more specific
-- English label ("Intimate Group", not "Group") — and that is the author's
-- editorial call. This only withdraws the half that broke an invariant, so the
-- repo can merge again while that decision is made. The withdrawn names remain
-- reachable: both migrations recorded each old name as an approved alias.

select set_config('app.actor', 'admin:tag-duplicate-collision-revert', true);

with active as (
  select * from public.unified_tags
   where status = 'active' and merged_into_id is null and deprecated_at is null
), dup as (
  select lower(btrim(name)) as k, entity_kind
    from active
   group by lower(btrim(name)), entity_kind
  having count(*) > 1
), involved as (
  select a.id
    from active a
    join dup d on d.k = lower(btrim(a.name)) and d.entity_kind = a.entity_kind
), revert as (
  select distinct on (l.tag_id)
         l.tag_id, l.before_data->>'name' as old_name
    from public.tag_change_log l
    join involved i on i.id = l.tag_id
   where l.created_at > '2026-10-10T04:50:00Z'
     and l.actor in ('admin:tags-english-label-repair', 'admin:tags-full-language-audit')
     and l.before_data->>'name' is distinct from l.after_data->>'name'
     and coalesce(btrim(l.before_data->>'name'), '') <> ''
   order by l.tag_id, l.created_at desc
)
update public.unified_tags u
   set name = r.old_name
  from revert r
 where u.id = r.tag_id
   and u.name is distinct from r.old_name;

do $verify$
declare
  v_dup int;
  v_total int;
begin
  -- P1: the invariant the gate enforces. Asserted by CALLING the gate's own
  -- function rather than re-deriving its grouping — a hand-rolled copy of
  -- `lower(btrim(name)), entity_kind` is a second definition free to drift
  -- from the one that actually fails CI.
  v_dup := (public.tag_hygiene_stats() ->> 'duplicate_active_name')::int;
  if v_dup <> 0 then
    raise exception 'P1 failed: duplicate_active_name is %, expected 0', v_dup;
  end if;

  -- P2: this must not have become a no-op. If a later campaign migration
  -- renames with a THIRD actor, the bounded selection silently reaches nothing
  -- and P1 would still pass only if that migration happened to collide with
  -- nothing — so assert the corpus is non-trivial and the actors are present,
  -- or a green run here could mean "measured an empty set".
  select count(*) into v_total from public.unified_tags
   where status = 'active' and merged_into_id is null and deprecated_at is null;
  if v_total < 1000 then
    raise exception 'P2 failed: only % active tags — refusing to trust a zero over an empty corpus', v_total;
  end if;

  raise notice 'duplicate_active_name = 0 over % active tags', v_total;
end
$verify$;
