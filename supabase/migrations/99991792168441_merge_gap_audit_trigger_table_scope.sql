-- merge_gap_audit_trigger() raised 42703 on every city and venue merge AND unmerge.
--
-- `merge_gap_fields` is BEFORE INSERT OR UPDATE OF undone_at on all THREE audit
-- tables, and the body opened by picking `kind` out of a single CASE expression
-- whose ELSE arm reads `NEW.entity_type`:
--
--   kind := CASE TG_TABLE_NAME WHEN 'venue_merge_audit' THEN 'venue'
--                              WHEN 'city_merge_audit'  THEN 'city'
--                              ELSE NEW.entity_type END;
--
-- Only `entity_merge_audit` has that column. A CASE is ONE expression: the record
-- field reference is resolved when the expression is prepared, not lazily per
-- branch, so for `city_merge_audit` and `venue_merge_audit` it raised
--   42703 record "new" has no field "entity_type"
-- before the WHEN arm that would have answered correctly could be taken. The arm
-- was right; folding it into the same expression as the ELSE is what broke it.
--
-- This is the trap 50700101100000:261 already records for trg_sync_tag_category --
-- "TG_OP is tested in its own `if` branch rather than folded into an `or` with an
-- `old` reference, because PostgreSQL does not guarantee OR short-circuits and the
-- compact form can still evaluate `old` on an INSERT and raise." Same class, one
-- trigger over. Note the function ALREADY depends on the lazy-statement property
-- this fix uses: its `ELSIF OLD.undone_at IS NULL` arm touches OLD and is only
-- safe because an IF/ELSIF *statement* is evaluated per path. An IF is lazy; a
-- CASE expression is not.
--
-- Measured on prod 2026-10-16 04:15Z with entity_merge_audit as a live control:
--   INSERT  city_merge_audit   -> 42703 record "new" has no field "entity_type"
--   INSERT  venue_merge_audit  -> 42703 record "new" has no field "entity_type"
--   INSERT  entity_merge_audit -> P0001 gap fill requires a canonical survivor ...
-- i.e. the two column-less tables died at line 4 while the third reached its own
-- validation. The same 42703 came back out of unmerge_cities() line 124 ("update
-- public.city_merge_audit set undone_at = now()"), so BOTH directions were dead:
-- merge_cities, unmerge_cities, merge_venues/_venue_merge_core and unmerge_venues.
--
-- Introduced by 99991792121194_merge_gap_policy (#4429). Breakage window is pinned
-- by the audit tables themselves: last successful city merge 2026-10-16 00:21:49Z,
-- last venue merge 2026-10-15 20:59:23Z, still failing when probed at 04:15:52Z.
--
-- Why this could not wait for the morning: `dedup_truth_sweep` fires `50 5 * * *`
-- with mode=full for BOTH city and venue (its 2026-10-15 summary lists
-- "city": "full", "venue": "full"), so the next run would have attempted auto-merges
-- against a trigger that throws. Either it aborts and consecutive_failures walks up
-- to auto_pause_threshold=3 -- the one-way door that then reads exactly like a
-- deliberate retirement, which this repo has now recorded three times -- or it
-- swallows per-pair and books last_run_status='success' having merged nothing,
-- which is the silent half of the same failure.
--
-- The body is otherwise BYTE-IDENTICAL to what 99991792121194 shipped. Only the
-- `kind :=` assignment changes; this is deliberately not an opportunity to tidy
-- anything else in a hotfix.

create or replace function public.merge_gap_audit_trigger()
returns trigger
language plpgsql
set search_path to ''
as $function$
DECLARE kind text; tab text; survivor jsonb; donor jsonb; patch jsonb; before_values jsonb := '{}'; k text; v jsonb;
BEGIN
  -- Separate statements, never one CASE: `NEW.entity_type` must be reachable only
  -- on the table that HAS that column. See this migration's header.
  IF TG_TABLE_NAME = 'venue_merge_audit' THEN
    kind := 'venue';
  ELSIF TG_TABLE_NAME = 'city_merge_audit' THEN
    kind := 'city';
  ELSE
    kind := NEW.entity_type;
  END IF;
  tab := public.merge_gap_table(kind);
  IF tab IS NULL THEN RETURN NEW; END IF;
  -- Stable row order also serializes simultaneous field fills of a survivor.
  EXECUTE format('SELECT 1 FROM public.%I WHERE id IN ($1,$2) ORDER BY id FOR UPDATE', tab) USING NEW.keep_id, NEW.drop_id;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO survivor USING NEW.keep_id;
  IF TG_OP = 'INSERT' THEN
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO donor USING NEW.drop_id;
    IF survivor IS NULL OR donor IS NULL OR NEW.keep_id = NEW.drop_id OR
       NOT public.merge_gap_empty(survivor->'duplicate_of_id') OR donor->>'duplicate_of_id' IS DISTINCT FROM NEW.keep_id::text THEN
      RAISE EXCEPTION 'gap fill requires a canonical survivor and its merged donor';
    END IF;
    patch := public.merge_gap_patch(kind, survivor, donor);
    FOR k IN SELECT jsonb_object_keys(patch) LOOP before_values := before_values || jsonb_build_object(k, survivor->k); END LOOP;
    PERFORM public.merge_gap_write(tab, NEW.keep_id, patch);
    NEW.details := coalesce(NEW.details,'{}') || jsonb_build_object('field_transfer', jsonb_build_object(
      'policy',1,'donor_id',NEW.drop_id,'donor_source',coalesce(donor->>'data_source',donor->>'source_type',donor->>'source_name'),
      'donor_provenance',donor->'field_provenance','before',before_values,'after',patch));
  ELSIF OLD.undone_at IS NULL AND NEW.undone_at IS NOT NULL THEN
    patch := '{}';
    FOR k, v IN SELECT * FROM jsonb_each(coalesce(OLD.details#>'{field_transfer,after}','{}')) LOOP
      patch := patch || jsonb_build_object(k,public.merge_gap_restore(survivor->k, OLD.details#>ARRAY['field_transfer','before',k], v));
    END LOOP;
    -- Never undo half of a coordinate pair if either half was subsequently edited.
    IF (OLD.details#>'{field_transfer,after}') ? 'latitude' AND
       (survivor->'latitude' IS DISTINCT FROM OLD.details#>'{field_transfer,after,latitude}' OR
        survivor->'longitude' IS DISTINCT FROM OLD.details#>'{field_transfer,after,longitude}') THEN
      patch := patch - 'latitude' - 'longitude';
    END IF;
    PERFORM public.merge_gap_write(tab, NEW.keep_id, patch);
  END IF;
  RETURN NEW;
END;
$function$;

-- Postconditions assert the REACHED state, behaviourally. A source-text check that
-- the CASE is gone would pass against a body that raises for some other reason, and
-- `42703` is exactly the kind of error no structural test sees.
do $verify$
declare
  v_state text;
  v_rows  int;
begin
  -- 1-2. The two tables with no `entity_type` column must now get PAST the `kind`
  -- assignment and reach the function's own validation. P0001 is the pass; 42703 is
  -- the defect this migration exists to remove. Each probe runs in its own
  -- subtransaction and writes nothing -- the trigger refuses a bogus pair before any
  -- row is stored.
  begin
    insert into public.city_merge_audit(keep_id, drop_id)
      values (gen_random_uuid(), gen_random_uuid());
    raise exception 'merge_gap_fields no longer validates a bogus city pair -- it '
                    'accepted one, so the guard that protects the audit log is gone';
  exception
    when sqlstate '42703' then
      raise exception 'city_merge_audit still raises 42703 -- the kind assignment '
                      'was not fixed';
    when sqlstate 'P0001' then
      null;  -- reached its own validation: the assignment is sound
  end;

  begin
    insert into public.venue_merge_audit(keep_id, drop_id)
      values (gen_random_uuid(), gen_random_uuid());
    raise exception 'merge_gap_fields no longer validates a bogus venue pair';
  exception
    when sqlstate '42703' then
      raise exception 'venue_merge_audit still raises 42703 -- the kind assignment '
                      'was not fixed';
    when sqlstate 'P0001' then
      null;
  end;

  -- 3. The entity path was never broken and must STAY working -- a fix that reached
  -- the two tables by severing `NEW.entity_type` altogether would satisfy 1 and 2
  -- and silently stop resolving every event/news/organization/personality merge.
  begin
    insert into public.entity_merge_audit(entity_type, keep_id, drop_id)
      values ('event', gen_random_uuid(), gen_random_uuid());
    raise exception 'merge_gap_fields no longer validates a bogus entity pair';
  exception
    when sqlstate '42703' then
      raise exception 'entity_merge_audit now raises 42703 -- the entity arm was '
                      'broken while fixing the city/venue arms';
    when sqlstate 'P0001' then
      null;
  end;

  -- 4. The trigger must still be attached to all three tables. Replacing the
  -- function cannot detach it, but a later migration dropping one is how this
  -- becomes a silent gap rather than an error.
  select count(*) into v_rows
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and t.tgfoid = 'public.merge_gap_audit_trigger'::regproc
     and c.relname in ('city_merge_audit','venue_merge_audit','entity_merge_audit');
  if v_rows <> 3 then
    raise exception 'merge_gap_fields is attached to % of 3 audit tables', v_rows;
  end if;

  raise notice 'merge_gap_audit_trigger: city/venue/entity all reach validation; '
               'trigger attached to 3 tables';
end $verify$;
