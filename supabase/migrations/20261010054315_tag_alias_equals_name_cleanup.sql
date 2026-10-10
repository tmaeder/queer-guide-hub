-- Follow-up to 20261010053810. That migration reverted 40 colliding tag names
-- to the German originals the campaign migrations had recorded as aliases —
-- which made each of those aliases equal to its tag's own name, taking the
-- `alias_equals_name` zero-invariant 0 -> 41. One zero-invariant traded for
-- another; this closes it.
--
-- An alias exists to record a name the tag does NOT currently carry. Once the
-- revert put the German name back on the tag, the alias duplicates the name
-- and carries no information, so it is deleted rather than re-typed.
--
-- 40 of the 41 are from the revert. The 41st is `begine`, created by
-- 20261010052531, which set it review_status='rejected' but left the row —
-- and the metric has NO review_status filter, so a rejected self-alias still
-- counts. It is inert by definition (a rejected alias equal to the tag's own
-- name routes nothing) and has to go for the invariant to reach zero.
--
-- Bounded to aliases created after 04:50Z so it cannot reach any alias that
-- predates the campaign: measured, 41 match and 0 pre-existing rows do.

select set_config('app.actor', 'admin:tag-alias-equals-name-cleanup', true);

delete from public.tag_aliases a
 using public.unified_tags t
 where t.id = a.canonical_tag_id
   and a.created_at > '2026-10-10T04:50:00Z'
   and lower(btrim(a.alias_name)) = lower(btrim(t.name));

do $verify$
declare v int; v_tot int;
begin
  -- Both invariants, because fixing one by breaking the other is exactly what
  -- produced this migration.
  v := (public.tag_hygiene_stats() ->> 'alias_equals_name')::int;
  if v <> 0 then raise exception 'P1 failed: alias_equals_name is %, expected 0', v; end if;

  v := (public.tag_hygiene_stats() ->> 'duplicate_active_name')::int;
  if v <> 0 then raise exception 'P2 failed: duplicate_active_name is %, expected 0', v; end if;

  -- P3: not a zero over an emptied table. The campaign's non-colliding aliases
  -- are the point of its work and must survive.
  select count(*) into v_tot from public.tag_aliases;
  if v_tot < 1000 then
    raise exception 'P3 failed: only % aliases remain — refusing a zero over a gutted table', v_tot;
  end if;

  raise notice 'alias_equals_name=0, duplicate_active_name=0, % aliases remain', v_tot;
end
$verify$;
