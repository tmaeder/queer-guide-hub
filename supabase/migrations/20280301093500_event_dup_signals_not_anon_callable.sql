-- event_dup_signals() is callable by anon on prod right now. Close it.
--
-- Caught by `Critical data-quality gates` at 16:25 on 2026-09-05, roughly twenty
-- minutes after 20270822093816 applied:
--
--   ✗ 1 write-capable SECURITY DEFINER function(s) reachable by anon:
--       public.event_dup_signals()
--
-- 20270822093816 DID try to lock it down, and the attempt looks right:
--
--     REVOKE ALL ON FUNCTION public.event_dup_signals() FROM public;
--     GRANT EXECUTE ON FUNCTION public.event_dup_signals() TO authenticated, service_role;
--
-- It is not enough, for the reason `scripts/check-anon-function-grants.mjs`
-- documents in its own header. This project carries
--
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, ...
--
-- so anon receives its OWN grant at CREATE time. `REVOKE ... FROM public` removes
-- the PUBLIC pseudo-role entry and leaves anon's explicit entry standing. The
-- same header records the trap that makes this hard to see by inspection: after a
-- partial revoke, `proacl` can read as though anon is gone while
-- `has_function_privilege('anon', ...)` is still TRUE. **Check the privilege, not
-- the ACL.**
--
-- WHY IT MATTERS EVEN THOUGH ANON CANNOT MERGE ANYTHING. The function passes
-- 'dry_run', so an anonymous caller cannot make it write entity rows. It is still
-- worth closing on three counts: it is SECURITY DEFINER, so it runs as owner and
-- RLS does not apply to what it reads; it surfaces `dedup_review_queue` and
-- merge-audit contents, which are moderation-internal; and it runs a full
-- `run_dedup_truth_sweep('event', ...)` per call on a disk-constrained instance,
-- which is a cheap denial-of-service for anyone holding the publishable anon key.
--
-- `authenticated` is deliberately LEFT IN PLACE. The admin surface calls this and
-- admin routes are authenticated; narrowing further needs the call sites checked
-- and is a separate decision. This is a security patch, not a redesign. The gate
-- objects to anon, and only to anon.

revoke execute on function public.event_dup_signals() from public, anon;

-- Assert the EFFECTIVE privilege, which is the whole lesson above: an ACL that no
-- longer lists anon is not evidence that anon cannot execute.
do $verify$
begin
  if has_function_privilege('anon', 'public.event_dup_signals()', 'EXECUTE') then
    raise exception
      'event_dup_signals() is still anon-callable after the revoke — a further grant path exists';
  end if;

  -- Positive control. Without it the check above also "passes" if the function
  -- were dropped, renamed, or had never existed, which would make this a silent
  -- no-op patch that reads as a fix.
  if not has_function_privilege('service_role', 'public.event_dup_signals()', 'EXECUTE') then
    raise exception
      'event_dup_signals() is not callable by service_role — the revoke was too wide';
  end if;

  raise notice 'event_dup_signals(): anon revoked, service_role retained';
end
$verify$;
