-- Land the 452 personality biographies stranded in twenty_inbound_review before
-- the Twenty CRM integration is retired.
--
-- WHAT IS IN THE QUEUE. twenty_inbound_review holds 806 rows, every one written
-- in a single hour on 2026-07-16 and untouched since — 270 already applied,
-- 536 still `pending`. The pending half is TWO different things:
--
--   452 personality/description  — a biography for a person who has none. All
--                                  452 targets still have an empty description
--                                  today, 0 already carry the proposed text and
--                                  0 carry different text. Nothing to overwrite.
--   84  organization/website     — measured, and they are NOT conflicts: all 84
--                                  differ from the stored value by a TRAILING
--                                  SLASH and nothing else ("http://www.acrc.org"
--                                  vs "http://www.acrc.org/"). Twenty normalises
--                                  the slash away, this platform keeps it. Zero
--                                  of the 84 differ once rtrim(…, '/') is applied,
--                                  so there is nothing to apply and nothing to
--                                  review. They are dropped with the table.
--
-- WHY THE FILL IS SAFE. `coalesce(description,'') = ''` is the whole guard: this
-- can only ever fill an empty column, never replace prose. Re-running it is a
-- no-op, so the migration verifies itself.
--
-- Measured on prod in a rolled-back transaction: 452 rows, 98 ms, and exactly
-- 452 rows enqueued into search_reindex_queue. Far under any batch cap — the
-- personality write path enqueues rather than reindexing inline since the
-- pipeline overhaul, so no chunking is needed here.
update public.personalities p
   set description = s.neu
  from (
    select r.entity_id, r.changes->'description'->>'to' as neu
    from public.twenty_inbound_review r
    where r.status = 'pending'
      and r.entity_type = 'personality'
      and r.changes ? 'description'
      and coalesce(r.changes->'description'->>'to', '') <> ''
  ) s
 where p.id = s.entity_id
   and coalesce(p.description, '') = '';

do $$
declare v_rest int;
begin
  select count(*) into v_rest
  from public.twenty_inbound_review r
  join public.personalities p on p.id = r.entity_id
  where r.status = 'pending' and r.entity_type = 'personality'
    and r.changes ? 'description'
    and coalesce(r.changes->'description'->>'to','') <> ''
    and coalesce(p.description,'') = '';
  if v_rest > 0 then
    raise exception 'twenty inbound fill left % personality descriptions empty', v_rest;
  end if;
end $$;
