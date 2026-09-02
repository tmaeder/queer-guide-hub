-- `city_safety_gate_drift` costs 6.4 s of an 8.9 s RPC, against an 8 s timeout.
-- The fix is to delete one `SET` clause from a three-line wrapper.
--
-- THE PROBLEM, MEASURED ------------------------------------------------------
-- `release_gate_checks()` runs 8,916 ms. `authenticator` carries
-- `statement_timeout = 8s` and `service_role` sets no override, so PostgREST
-- inherits it: the RPC is OVER its ceiling and fails whenever prod is a shade
-- slower. It is not flaky infrastructure — it passes only on the good days, and
-- it takes unrelated PRs red with it (`Critical data-quality gates` is a
-- required check; #3261 hit it, and a re-run of the same commit passed).
--
-- 6,452 ms of the 8,916 is ONE arm: the `venues` branch of
-- `city_safety_gate_drift`, which calls `venue_is_safety_gated()` once per row
-- across 26,863 venues. The events arm, on nearly twice the rows, costs 106 ms
-- using set membership.
--
-- WHAT IS NOT THE FIX --------------------------------------------------------
-- Inlining the predicate into the gate (`... in (select country_id from hr) or
-- category = 'cruising'`) is 95x faster and WRONG. `20261112100000` pointed
-- that branch at `venue_is_safety_gated` precisely to delete such a copy, whose
-- header says it plainly: "A copy is exactly what cannot survive a deliberate
-- divergence." That copy had just taken the gate red with 96 false positives.
-- Proving the two predicates agree TODAY is what a copy always does; what
-- breaks a copy is tomorrow. Evaluating the predicate once per distinct
-- (country_id, city_id, category) keeps one predicate and measures WORSE —
-- 22,701 ms, because the planner re-evaluates it inside a nested loop.
--
-- THE ACTUAL CAUSE, AND TWO WRONG GUESSES BEFORE IT ---------------------------
-- Measured in a scratch schema on prod, the way `20261112100000` did it. The
-- first two diagnoses were both wrong, which is why all four numbers are here:
--
--   current  (SET, and calls a second SET function)      6,452 ms   not inlined
--   CTE removed from location_is_high_risk              4,972 ms   not inlined
--   wrapper WITHOUT `SET`, real inner fn untouched         801 ms   INLINED
--   one flattened fn that KEEPS `SET`                      818 ms   not inlined
--
-- So it is neither the CTE (guess 1) nor the `SET` per se (guess 2): a single
-- SET-carrying call layer is already fast at 818 ms. The cost is the SECOND
-- nested call layer. Removing `SET` from the outer wrapper lets Postgres inline
-- it — a function carrying a `SET` clause can never be inlined, because the GUC
-- has to be established at call time — which collapses two layers into one.
--
-- WHY THIS WRAPPER IS SAFE TO MAKE INLINABLE ----------------------------------
-- The body references NO tables. It is one schema-qualified call plus a literal
-- comparison, so there is nothing a mutable search_path can redirect. The
-- function is SECURITY INVOKER, not DEFINER, so a caller's search_path buys no
-- privilege. `public.location_is_high_risk` — the function that actually reads
-- `geo_country_profiles` and `geo_places` — KEEPS its own `SET` and is not
-- touched by this migration. There is no RLS policy on `venue_is_safety_gated`;
-- its three callers are `release_gate_checks`, `set_venue_safety_gated` (the
-- per-row BEFORE trigger on venues) and `recompute_safety_gated_for_country`,
-- and the latter two get the same speedup for free.
--
-- The cost is one Supabase advisor WARN: `function_search_path_mutable` goes
-- 74 -> 75. That is the honest trade and it is stated here rather than hidden.
--
-- EQUIVALENCE ----------------------------------------------------------------
-- The body is byte-identical apart from the removed clause, and it was compared
-- against the live function over every row of `venues` before shipping:
-- 37,925 rows, 0 disagreements, both true on exactly the same 1,338.
--
-- Expected effect: the venues arm 6,452 -> ~800 ms, taking the whole RPC from
-- 8,916 ms to roughly 3,300 ms — comfortably inside the 8 s ceiling.

create or replace function public.venue_is_safety_gated(
  p_country_id uuid,
  p_city_id    uuid,
  p_category   text
)
returns boolean
language sql
stable
-- NO `set search_path` — deliberate, and load-bearing. See the header: it is
-- what makes this wrapper inlinable, and the body is table-free so the clause
-- protects nothing. Re-adding it silently returns the gate to 6.4 s and puts
-- `release_gate_checks()` back over its statement timeout.
as $$
  -- coalesce is load-bearing: category is nullable, and `false or NULL` is NULL,
  -- which would violate the NOT NULL on venues.safety_gated.
  select public.location_is_high_risk(p_country_id, p_city_id)
      or coalesce(p_category = 'cruising', false);
$$;

comment on function public.venue_is_safety_gated(uuid, uuid, text) is
  'Venue gating predicate: geographic risk OR the cruising category. Deliberately carries NO `SET search_path` so Postgres can inline it — see 20261117110000. The body touches no tables; public.location_is_high_risk keeps its own SET.';
