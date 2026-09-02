-- Queue venues whose NAME asserts cruising but whose category does not.
--
-- WHY ------------------------------------------------------------------------
-- 20261110100000 gates `category='cruising'` from anonymous visitors. The gate
-- keys on the CATEGORY, so a cruising venue filed as bar/club/sauna is still
-- publicly indexed. Measured on prod after that gate shipped: "Glory Hole Bar"
-- (Tokyo, bar), "Sling Cruising Bar" (Vienna, bar), "XXL Cruising-Club"
-- (Berlin, bar), three "Sex Club"s, "Cruising Point" (Mannheim, bar) — all
-- public.
--
-- This does NOT reclassify them. CLAUDE.md: cruising/sauna are never
-- bulk-accepted, and infer_venue_category deliberately scores cruising at 0.21
-- against an 0.85 auto-apply bar because there is no independent ground truth.
-- A human decides each row; this only puts them in front of one.
--
-- THE CANDIDATE SET ----------------------------------------------------------
-- Deliberately narrow, and the narrowing is the point:
--   * NAME only, never description. 129 venues have "cruising"/"darkroom" in
--     their DESCRIPTION while filed as `sauna` — and a gay sauna with a darkroom
--     is a sauna. Matching description would flood the queue with correct rows,
--     which is how a queue teaches reviewers to rubber-stamp.
--   * 'cruising', not bare 'cruise'. "Cruise" alone is boat tourism — the public
--     sitemap carries Amsterdam canal cruises, a Douro river cruise and a
--     Willamette dinner cruise, all correctly public.
--   * boat/tour/party words excluded for the same reason.
-- Yields 17 rows, every one hand-read: 10 filed bar/club/other, 7 sauna.
--
-- CONFIDENCE IS SPLIT, because the two groups are not equally wrong:
--   bar/club/other -> 0.75  ("Glory Hole Bar" filed as a bar is likely wrong)
--   sauna          -> 0.45  ("Cruising Sauna" filed as a sauna is plausibly
--                            RIGHT — it is a sauna that also has cruising)
-- A flat number would misrepresent the sauna half as settled when it is the
-- genuinely contested half.

-- ---------------------------------------------------------------------------
-- 1. Register the field. approve_entity_review() is registry-driven and RAISES
--    'unsupported review field' when a row is missing, so queuing without this
--    would create rows that a human can approve and that then error — the
--    "human approval did nothing" failure this schema already suffered once.
-- ---------------------------------------------------------------------------
insert into public.review_field_registry
  (entity_type, field, label, target_table, target_column, value_key,
   apply_mode, apply_args, batchable, risk_gate, active)
values
  ('venue', 'category', 'Venue category', 'venues', 'category', 'value',
   -- text_required: venues.category is NOT NULL and constrained by
   -- venues_category_check, so an invalid value raises rather than lands.
   'text_required', '{}'::jsonb,
   -- batchable=false encodes "cruising/sauna are never bulk-accepted" in the
   -- schema itself, so no batch-approve path can sweep these.
   false,
   -- Approving a cruising categorisation in a criminalizing country demands
   -- explicit confirmation. _review_risk_blocked already handles 'venue'.
   'criminalizing_destination',
   true)
on conflict (entity_type, field) do update
   set batchable = excluded.batchable,
       risk_gate = excluded.risk_gate,
       active    = excluded.active;

-- ---------------------------------------------------------------------------
-- 2. Queue the candidates.
--    Computed by predicate rather than a frozen id list so a row merged or
--    deleted between authoring and apply is simply not queued. Idempotent via
--    uq_erq_open (entity_type, entity_id, field) WHERE status='open'.
-- ---------------------------------------------------------------------------
with cand as (
  select id, name, category, city, country
    from public.venues
   where duplicate_of_id is null
     and category is distinct from 'cruising'
     and name ~* '\m(cruising|cruise club|gloryhole|glory hole|sexclub|sex club)\M'
     and name !~* '\m(boat|canal|river|dinner|sail|yacht|ferry|tour|island|harbou?r|party)\M'
)
insert into public.entity_review_queue
  (entity_type, entity_id, field, proposed_value, citations, confidence, model, status)
select
  'venue', c.id, 'category',
  jsonb_build_object('value', 'cruising'),
  jsonb_build_object(
    'reason',           'venue name asserts cruising; current category does not',
    'name',             c.name,
    'current_category', c.category,
    'location',         concat_ws(', ', c.city, c.country),
    'signal',           'name-match (not description)',
    'source',           'migration 20261204100000'),
  case when c.category = 'sauna' then 0.45 else 0.75 end,
  'name-signal',
  'open'
  from cand c
on conflict do nothing;

-- Flag them so the venue surfaces that read needs_attention show the work.
update public.venues v
   set needs_attention = true
  from public.entity_review_queue q
 where q.entity_type = 'venue' and q.field = 'category' and q.status = 'open'
   and v.id = q.entity_id
   and v.needs_attention is distinct from true;

-- ---------------------------------------------------------------------------
-- 3. Post-conditions
-- ---------------------------------------------------------------------------
do $$
declare v_open int; v_reg int;
begin
  select count(*) into v_reg from public.review_field_registry
   where entity_type='venue' and field='category' and active;
  if v_reg <> 1 then
    raise exception 'venue.category is not registered; approvals would raise unsupported review field';
  end if;

  select count(*) into v_open from public.entity_review_queue
   where entity_type='venue' and field='category' and status='open';

  -- Fail loudly on a predicate blow-up rather than dumping hundreds of rows
  -- into a human queue. 17 measured at authoring time.
  if v_open = 0 or v_open > 40 then
    raise exception 'unexpected cruising-category queue size: % (expected ~17)', v_open;
  end if;
  raise notice 'cruising category review queued: % venues', v_open;
end;
$$;
