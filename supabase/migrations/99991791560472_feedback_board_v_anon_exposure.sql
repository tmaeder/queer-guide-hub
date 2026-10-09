-- public.feedback_board_v handed EVERY user's feedback to ANONYMOUS visitors,
-- bypassing the RLS policy that restricts it to the author plus admins.
--
-- Measured on prod 2026-10-09 with the real publishable key:
--
--   anon GET /rest/v1/feedback_board_v?select=id   -> HTTP 206, content-range 0-0/140
--   anon GET /rest/v1/community_submissions?select=id -> HTTP 401   (the control)
--
-- The control is the point: the BASE TABLE is correctly closed to anon, so the
-- view was the only door, and it was open.
--
-- The RLS policy it bypassed is narrower than "signed in":
--
--   "Community submissions read" SELECT TO authenticated
--     USING (submitted_by = auth.uid() OR has_any_role_jwt(ARRAY['admin','moderator']))
--
-- i.e. an ordinary member may read ONLY THEIR OWN submissions. The view carries
-- no `security_invoker`, so it runs as its owner and that predicate never ran —
-- every row of every user, to everyone, logged in or not. 140 rows today.
--
-- WHAT IS EXPOSED IS NOT CURATED. The view projects title/description/category
-- out of `data` (so `ip_address`, `user_agent`, `submitted_by` and
-- `submitter_metadata` were NOT reachable — that part of its design is sound),
-- but it filters only on `content_type='feedback'`, not-spam and not-duplicate.
-- It does NOT filter on status, so untriaged internal QA notes are public:
-- read as anon, the newest rows are German bug reports and internal product
-- discussion ("Müssen wir das wirklich auf der Seite anzeigen?",
-- "Wir reden dann mal drüber :)").
--
-- NOTHING READS IT, which is what makes the revoke free rather than a trade.
-- Checked three ways before touching it:
--   * `grep -rn feedback_board_v src/ functions/ workers/` -> no match
--   * `git log -S feedback_board_v --all`                  -> no match, EVER
--   * the real public board, `FeedbackBoard.tsx` at /feedback, goes through
--     `fetchFeedbackBoardItems()` which selects from `community_submissions`
--     DIRECTLY and therefore already obeys the policy above.
-- So this is an off-path object: present on prod, absent from every migration
-- in the repo, with an anon grant and no consumer.
--
-- THE REVOKE ALONE WOULD NOT SEAL IT. A later `grant select ... to anon`, or a
-- `create or replace view` that re-runs an old grant block, re-opens the same
-- hole silently — and `create or replace view` is already recorded in this repo
-- as stripping a view's reloptions. So `security_invoker` is set as well: with
-- it, the policy runs as the CALLER, and a future accidental grant yields zero
-- rows to anon instead of 140. Defence in depth, both one-liners.
--
-- The view DEFINITION is deliberately not restated. `create or replace view`
-- here would both re-strip the option this migration is setting and risk
-- changing a projection nothing in the repo can be diffed against. `alter view`
-- changes exactly the two things that are wrong.
--
-- Admin/moderator access is UNAFFECTED: they satisfy `has_any_role_jwt`, so
-- under `security_invoker` they still read every row. service_role keeps its
-- own grant and bypasses RLS as before.
--
-- If a genuinely public feedback board is wanted later, it needs a deliberate
-- status filter (only triaged/published items) and its own review. Leaving
-- untriaged internal notes world-readable is not that feature.

-- THE EXISTING GATE COULD NOT SEE THIS, AND THAT IS THE REUSABLE PART.
-- `scripts/check-definer-view-grants.mjs` has guarded this exact class since
-- 20260806180000 and passed cleanly on it, because both its arms are narrower
-- than the defect:
--   arm 1  `definer_view_api_write_grants()` filters
--          `privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')` — SELECT
--          is not in the list, so a READ bypass is invisible to it. Its own
--          header explains why it was built for writes: Supabase's stock
--          ALTER DEFAULT PRIVILEGES grants the API roles write on every new
--          view. A hand-written `grant select` is a different door.
--   arm 2  `security_invoker_view_regressions()` only checks views REGISTERED
--          in `security_invoker_required_views`. This view was never in any
--          migration, so it was never registered, so arm 2 had nothing to say.
--
-- So the gate was asking "did a registered view lose its flag?" and "can anon
-- WRITE?", and the answer to both was correctly no while anon was reading 140
-- rows. `definer_view_api_read_grants()` below is arm 3: the same shape as
-- arm 1 with the privilege set inverted, so it needs no registration and
-- catches the next one by construction rather than by someone remembering.
begin;

-- 1. Make the view honour the caller's RLS instead of running as its owner.
alter view public.feedback_board_v set (security_invoker = true);

-- 2. Withdraw the grants. `authenticated` goes too: a definer-style grant to
--    `authenticated` is a grant to EVERY member, and no code path needs it.
revoke select on public.feedback_board_v from anon;
revoke select on public.feedback_board_v from authenticated;

-- 3. Arm 3 of the gate: a definer view READABLE by an API role bypasses the base
--    table's RLS exactly as a writable one bypasses it for writes. Deliberately
--    mirrors `definer_view_api_write_grants()` statement for statement, with
--    only the privilege set changed, so the two cannot drift in shape.
--
--    PUBLIC is included in the grantee test: revoking from `anon` does not
--    remove a grant made to PUBLIC, and such a view is world-readable through
--    every role at once — the one shape a check written only against `anon`
--    would report as clean.
create or replace function public.definer_view_api_read_grants()
returns table(view_name text, grantee text, privileges text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.relname::text,
         a.grantee::regrole::text,
         string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where n.nspname = 'public'
    and c.relkind = 'v'
    and a.grantee::regrole::text in ('anon', 'authenticated', 'public', 'PUBLIC')
    and a.privilege_type = 'SELECT'
    -- security_invoker views are safe: the read runs as the caller, so
    -- base-table RLS applies and a public projection is an explicit choice.
    and coalesce(
          (select option_value from pg_options_to_table(c.reloptions)
           where option_name = 'security_invoker'),
          'false') in ('false', 'off')
  group by 1, 2
$function$;

-- Same exposure discipline as its sibling: the gate runs as service_role, and a
-- definer function granted to `authenticated` is granted to every member.
revoke all on function public.definer_view_api_read_grants() from public;
revoke all on function public.definer_view_api_read_grants() from anon;
revoke all on function public.definer_view_api_read_grants() from authenticated;
grant execute on function public.definer_view_api_read_grants() to service_role;

comment on function public.definer_view_api_read_grants() is
  'Arm 3 of check-definer-view-grants.mjs. Views without security_invoker that '
  'grant SELECT to anon/authenticated/PUBLIC — these bypass base-table RLS for '
  'reads. Added 2026-10-09 after feedback_board_v served every users feedback '
  'to anonymous visitors (140 rows) while the base table correctly returned 401.';

do $verify$
declare
  v_invoker text;
  v_grantees text;
  v_leaks int;
  v_definer_views int;
begin
  -- P1: the option is actually set. `alter view` is silent on a typo'd option
  -- name, so assert the stored value rather than trusting the statement.
  select option_value into v_invoker
  from pg_class c, pg_options_to_table(c.reloptions)
  where c.oid = 'public.feedback_board_v'::regclass
    and option_name = 'security_invoker';

  if coalesce(v_invoker, '') not in ('true', 'on') then
    raise exception 'P1 failed: feedback_board_v still runs as its owner (security_invoker=%)',
      coalesce(v_invoker, 'unset');
  end if;

  -- P2: no anon/authenticated/PUBLIC SELECT survives. Read the ACL rather than
  -- assuming the revoke matched — a grant made to PUBLIC is not removed by
  -- revoking from `anon`, and would still leave the view world-readable.
  select string_agg(distinct a.grantee::regrole::text, ', ')
    into v_grantees
  from pg_class c
  cross join aclexplode(coalesce(c.relacl, '{}')) a
  where c.oid = 'public.feedback_board_v'::regclass
    and a.privilege_type = 'SELECT'
    and a.grantee::regrole::text in ('anon', 'authenticated', 'public', 'PUBLIC');

  if v_grantees is not null then
    raise exception 'P2 failed: feedback_board_v is still SELECT-able by %', v_grantees;
  end if;

  -- P3: the base table's own protection is intact and was not "fixed" by
  -- loosening it. The whole finding rests on this table being closed to anon,
  -- so a pass here that came from opening the table would be worthless.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_submissions'
      and cmd = 'SELECT' and 'anon' = any (roles)
  ) then
    raise exception 'P3 failed: community_submissions now has an anon SELECT policy';
  end if;

  -- P4: the policy this view was bypassing still exists and is still
  -- author-or-admin. If someone widens it later, the exposure returns through
  -- the front door and this migration would read as protection it no longer is.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_submissions'
      and cmd = 'SELECT' and qual like '%has_any_role_jwt%' and qual like '%submitted_by%'
  ) then
    raise exception 'P4 failed: the author-or-admin SELECT policy on community_submissions is gone';
  end if;

  -- P5: arm 3 now reports a clean corpus. Asserted through the FUNCTION rather
  -- than by repeating its query, so a typo in the function body fails here
  -- instead of shipping a gate that reports zero because it matches nothing.
  select count(*) into v_leaks from public.definer_view_api_read_grants();
  if v_leaks <> 0 then
    raise exception 'P5 failed: % definer view(s) still readable by an API role', v_leaks;
  end if;

  -- P6: the DENOMINATOR. Zero leaks from a probe that cannot see any view is
  -- not a clean corpus — it is a dead query. There are definer views in this
  -- schema (16 measured today); assert the probe can still see them, so P5's
  -- zero means "none is anon-readable" and never "none was examined".
  select count(*) into v_definer_views
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'false') in ('false', 'off');

  if v_definer_views < 1 then
    raise exception 'P6 failed: no definer views found at all — arm 3 is measuring nothing';
  end if;

  raise notice 'feedback_board_v: security_invoker=%, no anon/authenticated SELECT, base policy intact; arm 3 clean over % definer view(s)',
    v_invoker, v_definer_views;
end
$verify$;

commit;
