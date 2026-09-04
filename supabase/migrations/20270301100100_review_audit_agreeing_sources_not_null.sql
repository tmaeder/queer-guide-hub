-- _review_write_audit could only ever write a VENUE audit row for one action.
--
-- THE BUG -------------------------------------------------------------------
-- `venue_consensus_audit.agreeing_sources` is NOT NULL **and carries its own
-- DEFAULT '{}'::text[]**. The helper passed an explicit value:
--
--   CASE WHEN p_action = 'auto_commit' THEN ARRAY['llm','human'] ELSE NULL END
--
-- and an explicit NULL OVERRIDES a column default. So every action other than
-- `auto_commit` raised 23502 and rolled back the caller's whole transaction.
-- The ELSE branch was unreachable-by-success: it existed, type-checked, and
-- could never do anything but throw.
--
-- Hit for real on 2026-09-03 applying ten venue-category reviews with
-- `action='service_role_apply'`. The insert aborted the batch; nothing landed.
-- (The rollback is the only reason this was harmless — the apply and the audit
-- share one transaction, so the failure could not leave a change unaudited.)
--
-- WHY IT HID ----------------------------------------------------------------
-- `approve_entity_review()` is the only caller and it hardcodes `auto_commit`,
-- which is exactly the branch that supplies a non-NULL value. So the live path
-- was always fine and the fault only surfaces for a NEW caller — i.e. at the
-- moment someone extends the review system, which is the worst time to discover
-- that the audit layer cannot record your action.
--
-- THE FIX -------------------------------------------------------------------
-- `ELSE NULL` becomes `ELSE ARRAY[]::text[]` — the same value the column
-- default would have produced. Empty is the honest answer: no sources agreed,
-- because for a non-consensus action no consensus was computed. It is also
-- distinguishable from `{llm,human}`, which is the point — a manual or
-- service-role apply must not be recorded as if a model and a human concurred.
--
-- NOT widening the column to NULL: NULL and `{}` would then both mean "no
-- sources" and the NOT NULL that caught this would stop catching it.
-- NOT touching the city branch: `city_consensus_audit.agreeing_sources` is
-- nullable and the city INSERT omits the column entirely, so it is unaffected.
--
-- Restated from the LIVE definition (pg_get_functiondef on prod, read
-- immediately before writing this), not from the newest migration file — the
-- same discipline that kept the hotels and queer_villages branches alive when
-- recompute_safety_gated_for_country was restated in 20261110100000.

create or replace function public._review_write_audit(
  p_entity_type text,
  p_entity_id   uuid,
  p_field       text,
  p_proposed    jsonb,
  p_confidence  numeric,
  p_action      text,
  p_source      text,
  p_details     jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
  IF p_entity_type = 'city' THEN
    INSERT INTO public.city_consensus_audit
      (city_id, field, winning_value, winning_source, confidence, action, details)
    VALUES (p_entity_id, p_field, p_proposed, p_source, p_confidence, p_action, p_details);

  ELSIF p_entity_type = 'venue' THEN
    -- venue's audit table carries an extra agreeing_sources column, NOT NULL.
    -- ARRAY[]::text[] rather than NULL: an explicit NULL overrides the column
    -- default and violates the constraint, which made every non-auto_commit
    -- action unwritable. Empty means "no sources agreed", which is true for a
    -- non-consensus action and is deliberately distinct from {llm,human}.
    INSERT INTO public.venue_consensus_audit
      (venue_id, field, winning_value, winning_source, confidence, agreeing_sources, action, details)
    VALUES (p_entity_id, p_field, p_proposed, p_source, p_confidence,
            CASE WHEN p_action = 'auto_commit' THEN ARRAY['llm','human'] ELSE ARRAY[]::text[] END,
            p_action, p_details);

  -- village, personality and marketplace have no consensus-audit table.
  END IF;
END
$function$;

-- ---------------------------------------------------------------------------
-- Post-condition: prove BOTH branches write, then roll the probes back.
-- A fix to an insert path that is never exercised is a guess.
-- ---------------------------------------------------------------------------
do $$
declare
  v_venue uuid;
  v_auto  int;
  v_other int;
begin
  select id into v_venue from public.venues limit 1;
  if v_venue is null then
    raise notice 'no venues to probe against; skipping';
    return;
  end if;

  -- the branch that always worked
  perform public._review_write_audit('venue', v_venue, '_probe', '{"value":"x"}'::jsonb,
            0.5, 'auto_commit', 'probe', '{}'::jsonb);
  -- the branch that could not write before this migration
  perform public._review_write_audit('venue', v_venue, '_probe', '{"value":"x"}'::jsonb,
            0.5, 'service_role_apply', 'probe', '{}'::jsonb);

  select count(*) filter (where action = 'auto_commit'),
         count(*) filter (where action = 'service_role_apply')
    into v_auto, v_other
    from public.venue_consensus_audit
   where field = '_probe';

  if v_auto < 1 or v_other < 1 then
    raise exception 'audit probe failed: auto_commit=% other=%', v_auto, v_other;
  end if;

  -- agreeing_sources must differ between them, or the fix has flattened the
  -- distinction it exists to preserve.
  if exists (
    select 1 from public.venue_consensus_audit
     where field = '_probe' and action = 'service_role_apply'
       and agreeing_sources @> ARRAY['llm']
  ) then
    raise exception 'non-consensus action was stamped with llm agreement';
  end if;

  -- Explicit cleanup rather than raise-into-a-handler. Both undo the rows, but
  -- an exception caught by its own block relies on the implicit savepoint and
  -- reads like a bug to the next person.
  delete from public.venue_consensus_audit where field = '_probe';

  if exists (select 1 from public.venue_consensus_audit where field = '_probe') then
    raise exception 'probe rows were not cleaned up';
  end if;

  raise notice 'both audit branches write (auto_commit=%, service_role_apply=%); probes removed',
    v_auto, v_other;
end;
$$;
