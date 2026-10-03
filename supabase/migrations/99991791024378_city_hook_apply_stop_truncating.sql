-- city.editorial_hook: stop publishing an approved hook cut mid-word.
--
-- `review_field_registry` carried apply_mode='text_truncated' with apply_args={"max_len":120},
-- and `_apply_review_value` implements that mode as a bare `left($1, 120)` — a hard
-- character cut with no word-boundary handling and no ellipsis. So approving any hook
-- longer than 120 characters published a sentence stopping mid-word.
--
-- THE 120 WAS NEVER A HARD CONSTRAINT. `cities.editorial_hook` is unbounded `text`, and
-- the human editor for this very field (src/pages/admin/AdminPlacesEditorial.tsx) accepts
-- `maxLength={140}` while labelling 120 "recommended". The apply path turned an editorial
-- RECOMMENDATION into a silent destructive write.
--
-- IT HAS ALREADY DAMAGED A HUMAN DECISION, which is what moves this out of hygiene.
-- Measured on prod 2026-10-03: a human approved Khandwa's hook on 2026-10-01 19:24 and
-- what published was
--   'Khandwa’s rails cross like old stories — where Kishore Kumar’s voice once echoed,
--    now trains carry the Nimar region forw'
-- — exactly 120 characters, cut at "forw". 12 live non-duplicate cities sit at exactly
-- 120, all seo_indexable; 11 are genuinely cut (Daphne is the control that is 120 and
-- ends in a full stop). The field is ALSO batchable=true, so the machine batch approver
-- can publish cut prose with no human in the loop.
--
-- `text_required` is the correct mode: it writes the value whole, and RAISEs on an empty
-- one. Today's mode does `coalesce(v_text,'')`, so an empty proposal silently BLANKS a
-- published column — a second, latent defect this removes in passing.
--
-- SCOPE. This flips one registry row. It deliberately does NOT:
--   * touch `_apply_review_value` — `text_truncated` becomes used by zero rows and an
--     unused CASE arm is harmless, while restating that shared function is a collision
--     surface. P3 below asserts nobody re-adopts it, which is the self-enforcing version
--     of deleting it.
--   * repair the 11 already-cut live hooks. Each needs a complete hook or a NULL, and
--     bulk-LLM-rewriting published prose is the experiment this repo ran and retired
--     (the tag prose judge retracted 16 of its first 18 rows with 13 of them wrong).
--     Tracked separately.
--
-- Soft on preconditions, hard on postconditions: a concurrent session that already fixed
-- this must not abort `db push` for the whole repo.

do $$
declare v_mode text; v_args jsonb;
begin
  select apply_mode, apply_args into v_mode, v_args
    from public.review_field_registry
   where entity_type = 'city' and field = 'editorial_hook';

  if v_mode is null then
    raise notice 'city.editorial_hook has no registry row — nothing to flip';
  elsif v_mode = 'text_required' then
    raise notice 'city.editorial_hook already text_required (args=%) — no-op', v_args;
  else
    raise notice 'city.editorial_hook: % (args=%) -> text_required', v_mode, v_args;
  end if;
end $$;

update public.review_field_registry
   set apply_mode = 'text_required',
       -- Remove max_len outright rather than leaving it to be read as an instruction by
       -- the next reader. The 120 survives where it belongs: as the "recommended" counter
       -- in the admin editor.
       apply_args = coalesce(apply_args, '{}'::jsonb) - 'max_len'
 where entity_type = 'city'
   and field = 'editorial_hook'
   and apply_mode is distinct from 'text_required';

do $verify$
declare
  v_mode text; v_mode2 text; v_args jsonb; v_bad int; v_udt text;
begin
  -- P1 — the reached state, asserted positively. Counting rows in a BAD state returns
  -- zero for a row that has gone missing entirely, which is the vacuous form.
  select apply_mode, apply_args into v_mode, v_args
    from public.review_field_registry
   where entity_type = 'city' and field = 'editorial_hook';
  if v_mode is distinct from 'text_required' then
    raise exception 'P1 failed: city.editorial_hook apply_mode is % (expected text_required)', v_mode;
  end if;
  if coalesce(v_args, '{}'::jsonb) ? 'max_len' then
    raise exception 'P1 failed: max_len survives in apply_args (%)', v_args;
  end if;

  -- P2 — the column must be able to hold an untruncated hook. If it were ever bounded,
  -- removing the truncation would turn a silent cut into a failing approval.
  --
  -- Asserted on character_maximum_length IS NULL, NOT on data_type = 'text'. That is the
  -- property that actually matters, and it is true for `text` AND for an unbounded
  -- `character varying` — a type-name check would abort `db push` for the whole repo on a
  -- column that is perfectly able to hold the value.
  select character_maximum_length::text, data_type into v_udt, v_mode2
    from information_schema.columns
   where table_schema = 'public' and table_name = 'cities' and column_name = 'editorial_hook';
  if v_mode2 is null then
    raise exception 'P2 failed: cities.editorial_hook not found';
  end if;
  if v_udt is not null then
    raise exception 'P2 failed: cities.editorial_hook is %(%) — bounded, so an untruncated hook would fail to apply', v_mode2, v_udt;
  end if;

  -- P3 — nobody may adopt the cutting mode. Fails loudly if a future registry row picks
  -- `text_truncated` thinking it is safe, which is why the CASE arm can be left in place.
  select count(*) into v_bad from public.review_field_registry
   where apply_mode = 'text_truncated';
  if v_bad <> 0 then
    raise exception 'P3 failed: % registry row(s) still use text_truncated', v_bad;
  end if;

  -- P4 — the mirror. `text_required` must still be carried by the OTHER fields that
  -- legitimately use it, so a mutation that renamed the mode globally is caught rather
  -- than reading as success.
  select count(*) into v_bad from public.review_field_registry
   where apply_mode = 'text_required';
  if v_bad < 2 then
    raise exception 'P4 failed: only % row(s) use text_required — expected the pre-existing ones plus this', v_bad;
  end if;

  raise notice 'OK: city.editorial_hook publishes whole; text_truncated adopted by 0 rows; text_required by %', v_bad;
end $verify$;
