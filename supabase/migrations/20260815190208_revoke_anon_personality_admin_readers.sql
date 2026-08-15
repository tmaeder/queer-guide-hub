-- ============================================================================
-- Four SECURITY DEFINER READERS were anon-executable
--
-- Measured live with the project anon key before this migration — all four
-- returned 200 with real data to an anonymous caller:
--
--   personalities_due_for_refresh          -> draft personality names + slugs
--   personalities_promotable               -> draft rows + lgbti_connection
--   personalities_adult_consent_candidates -> THE ADULT CONSENT QUEUE
--   get_admin_quality_index                -> whole admin quality dashboard
--
-- The consent queue is the serious one: it is the list of people flagged as
-- adult performers awaiting a human consent decision. Anonymous read of that
-- is the outing exposure the personality safety layer exists to prevent.
--
-- WHY THE CI GATE MISSED IT: `anon_function_exposure()` (20260824100000)
-- filters `p.provolatile = 'v'` — write-capable functions only. A STABLE
-- SECURITY DEFINER reader bypasses RLS just as completely; it simply leaks
-- instead of writing. 140 such readers are anon-executable in this database.
-- Same blind spot that hid personalities_due_for_adult_links (20260815154840).
--
-- SCOPE IS DELIBERATELY NARROW — revoke `anon`, and `authenticated` only where
-- provably unused:
--   * due_for_refresh / get_admin_quality_index have NO caller anywhere. Grep
--     of src/, supabase/functions/, workers/, scripts/, extension/, e2e/ and
--     functions/ finds only the generated types.ts. Both roles revoked.
--   * promotable / adult_consent_candidates ARE called from the browser by
--     src/hooks/usePersonalityQualitySummary.ts on the admin quality page, so
--     `authenticated` MUST stay or that page breaks. They therefore remain
--     readable by any signed-in user, which is still wrong — the real fix is
--     an internal has_any_role_jwt() gate, and that is a separate change.
--
-- Verified after: anon -> 401 on all four; authenticated admin -> 200 on the
-- two the admin page needs.
--
-- Version note: applied live via MCP `apply_migration`, which stamps the
-- version from its own call timestamp; the filename matches that stamp so
-- `db push` matches by version and skips it.
-- ============================================================================

revoke execute on function public.personalities_due_for_refresh(int) from anon, authenticated;
revoke execute on function public.get_admin_quality_index() from anon, authenticated;
revoke execute on function public.personalities_promotable(int) from anon;
revoke execute on function public.personalities_adult_consent_candidates(int) from anon;

grant execute on function public.personalities_due_for_refresh(int) to service_role;
grant execute on function public.get_admin_quality_index() to service_role;
