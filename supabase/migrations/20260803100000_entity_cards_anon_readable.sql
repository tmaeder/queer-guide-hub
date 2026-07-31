-- Fix: v_entity_cards was unusable by exactly the readers it exists for.
--
-- 20260802100000 created v_entity_cards with `security_invoker = true`, so the
-- view executes with the CALLER's privileges. But `anon` has no SELECT grant on
-- the underlying public.search_documents, so every signed-out read of the view
-- failed with "permission denied for table search_documents" — while signed-in
-- readers worked. That is the exact inverse of what a public CMS page needs.
--
-- It also corrects the premise recorded in that migration. The comment there
-- claimed a direct PostgREST read of search_documents would expose gated rows.
-- It would not have: `anon` was never granted SELECT on the table, so the
-- permissive `using (true)` policy was unreachable for signed-out callers.
-- `authenticated` could read gated rows directly, but that is precisely what
-- the safety model allows — gated entities ARE visible to signed-in users.
--
-- The fix enforces the gate at the TABLE rather than only inside a view, which
-- is the stronger posture: every future reader of search_documents inherits it,
-- not just those who remember to go through v_entity_cards.
--
-- Deliberately NOT the security-definer-function indirection used for
-- donor_wall (20260714120000): wrapping a 90k-row table in a set-returning
-- function stops the planner pushing predicates down, so every block query
-- would materialize the whole table before filtering.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Enforce the safety gate on the base table
-- ────────────────────────────────────────────────────────────────────────────
--
-- Mirrors public.location_is_high_risk semantics already denormalized into
-- search_documents.safety_gated by the entity sync triggers.
--
-- Blast radius is limited by design:
--   * service_role and every SECURITY DEFINER search RPC bypass RLS  → unchanged
--   * authenticated: auth.uid() is not null                          → unchanged
--   * anon: previously could read nothing (no grant)                 → gains
--     ungated rows only
-- No application code reads this table through PostgREST today; the search
-- path goes through search_hybrid / search_facets / search_autocomplete, all
-- SECURITY DEFINER.

drop policy if exists search_documents_public_read on public.search_documents;

create policy search_documents_public_read
  on public.search_documents
  for select
  using ((not safety_gated) or (select auth.uid()) is not null);

comment on policy search_documents_public_read on public.search_documents is
  'Safety gate: entities in criminalizing / death-penalty countries are readable
   only by signed-in users. SECURITY DEFINER search RPCs and service_role bypass
   RLS and are unaffected. Wrapped in (select auth.uid()) per the
   auth_rls_initplan lint pattern.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Let signed-out readers reach the gated rows
-- ────────────────────────────────────────────────────────────────────────────
--
-- Safe only because of step 1: without the policy above this grant would expose
-- gated entities. The two must never be separated.

grant select on public.search_documents to anon;

-- v_entity_cards itself needs no change: with the base-table grant in place its
-- security_invoker semantics now resolve correctly for anon, and its own WHERE
-- clause remains a second, service-key-proof gate.
