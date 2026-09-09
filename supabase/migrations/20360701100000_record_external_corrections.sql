-- A writable path for the before-image representation the audit table mandates.
--
-- WHY THIS EXISTS. `external_correction_audit.before_value` is `jsonb NOT NULL`,
-- and `20270301100400` defines the jsonb scalar 'null' as "the column was empty"
-- so that it stays distinct from "we failed to capture the value".
-- `rollback_external_correction_batch` keys on exactly that:
--     case when $2 = 'null'::jsonb then null else <cast> end
-- The DB side has been right the whole time. What was missing is that
-- **no PostgREST request body can produce `'null'::jsonb`**, so the
-- representation the table requires was unwritable by every client we have.
--
-- MEASURED against this project's own PostgREST (2026-09-09), inserting into
-- this exact column with the service key:
--
--   body                          stored              = 'null'::jsonb
--   ---------------------------   -----------------   ---------------
--   {"before_value": null}        SQL NULL -> 23502   insert fails
--   {"before_value": "null"}      jsonb *string*      false
--   text/csv, bare  null          jsonb *string*      false
--
-- All three are wrong, and only the first is wrong LOUDLY. The other two look
-- like success and leave a row whose before-image is the four-character string
-- "null" — which `rollback_external_correction_batch` would faithfully restore
-- INTO `cities.region_name`, replacing a real region with the text "null".
-- A silently wrong audit trail is worse than a failed insert, so the two
-- "working" encodings are the dangerous ones. Do not reach for them.
--
-- The cause is that PostgREST resolves a request body through a record cast
-- (`json_to_recordset(...) as _(before_value jsonb)`), and every JSON->record
-- primitive in Postgres maps JSON null to SQL NULL — verified for
-- json_populate_record, jsonb_populate_record, json_to_recordset and
-- jsonb_to_recordset. That is a property of the cast, not a PostgREST bug, and
-- it is not configurable.
--
-- WHY A FUNCTION AND NOT A COLUMN DEFAULT OR A TRIGGER. Both were considered and
-- rejected for the same reason: they coalesce a MISSING before_value into
-- 'null'::jsonb for every writer of this table, which makes "the caller forgot
-- to capture the before-image" indistinguishable from "the column really was
-- empty" — precisely the distinction the NOT NULL was added to preserve, and
-- precisely the absence-recorded-as-evidence-of-absence failure this codebase
-- keeps paying for. This function keeps them apart, because it takes the payload
-- as **jsonb** and reads it with `->` rather than casting it to a record:
--
--   {"before_value": null}       ->  jsonb 'null'   (the column was empty)
--   {"before_value": "Bavaria"}  ->  jsonb "Bavaria"
--   {}                           ->  SQL NULL       (caller bug -> RAISE)
--
-- `->` is the whole fix. It preserves the explicit-null / absent-key
-- distinction that the record cast destroys.

create or replace function public.record_external_corrections(p_rows jsonb)
  returns integer
  -- SECURITY INVOKER on purpose. The audit table already grants insert to
  -- service_role and nothing else; a definer here would hand that write to any
  -- role that could reach the function, for no benefit. The caller must already
  -- be entitled to write the table.
  language plpgsql
  security invoker
  set search_path to 'public'
as $$
declare
  v_missing integer;
  v_count   integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'record_external_corrections expects a jsonb array, got %',
      coalesce(jsonb_typeof(p_rows), 'null');
  end if;

  if jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;

  -- An ABSENT before_value is a caller bug and must say so by name. The NOT NULL
  -- would catch it anyway, but as a constraint violation that reads identically
  -- to the JSON-null case this function exists to fix — and that ambiguity is
  -- what cost a scheduled job every run it ever had.
  select count(*) into v_missing
  from jsonb_array_elements(p_rows) e
  where not (e ? 'before_value') or not (e ? 'after_value');
  if v_missing > 0 then
    raise exception
      'record_external_corrections: % row(s) omit before_value or after_value. '
      'Send an explicit null for "the column was empty"; omitting the key is not '
      'the same claim and is never assumed.', v_missing;
  end if;

  insert into public.external_correction_audit (
    batch_id, entity_type, entity_id, field,
    before_value, after_value,
    source, external_id, confidence, actor, reason
  )
  select
    (e->>'batch_id')::uuid,
    e->>'entity_type',
    (e->>'entity_id')::uuid,
    e->>'field',
    e->'before_value',   -- jsonb 'null' when the caller sent an explicit null
    e->'after_value',
    e->>'source',
    e->>'external_id',
    (e->>'confidence')::numeric,
    e->>'actor',
    e->>'reason'
  from jsonb_array_elements(p_rows) e;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.record_external_corrections(jsonb) from public, anon, authenticated;
grant execute on function public.record_external_corrections(jsonb) to service_role;

comment on function public.record_external_corrections(jsonb) is
  'Insert external_correction_audit rows from a jsonb array. Exists because no PostgREST '
  'request body can store the jsonb scalar ''null'' that before_value uses for "the column '
  'was empty" — a JSON null becomes SQL NULL and the string "null" becomes a jsonb string. '
  'Reads the payload with -> so an explicit null and an absent key stay distinct; an absent '
  'before_value/after_value raises rather than being assumed empty.';

-- ---------------------------------------------------------------------------
-- Assert the property this migration exists to create, against the real
-- constraint, rather than trusting that the function body reads correctly.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_batch uuid := gen_random_uuid();
  v_eid   uuid := gen_random_uuid();
  v_n     integer;
  v_typeof text;
  v_is_null boolean;
begin
  v_n := public.record_external_corrections(jsonb_build_array(
    jsonb_build_object(
      'batch_id', v_batch, 'entity_type', 'city', 'entity_id', v_eid,
      'field', 'region_name',
      'before_value', null,          -- the case that could not be written before
      'after_value', 'Bavaria',
      'source', 'migration-self-test', 'actor', 'migration:20360701100000'
    )
  ));
  if v_n <> 1 then
    raise exception 'self-test: expected 1 row, got %', v_n;
  end if;

  select jsonb_typeof(before_value), before_value = 'null'::jsonb
    into v_typeof, v_is_null
  from public.external_correction_audit where batch_id = v_batch;

  if v_typeof is distinct from 'null' or not v_is_null then
    raise exception
      'self-test: before_value stored as %, expected the jsonb scalar null', v_typeof;
  end if;

  -- And the caller-bug case must RAISE rather than invent an empty before-image.
  begin
    perform public.record_external_corrections(jsonb_build_array(
      jsonb_build_object(
        'batch_id', v_batch, 'entity_type', 'city', 'entity_id', v_eid,
        'field', 'region_name', 'after_value', 'X',
        'source', 'migration-self-test', 'actor', 'migration:20360701100000'
      )
    ));
    raise exception 'self-test: an omitted before_value was accepted';
  exception
    when others then
      if sqlerrm not like '%omit before_value%' then raise; end if;
  end;

  delete from public.external_correction_audit where batch_id = v_batch;
end $verify$;
