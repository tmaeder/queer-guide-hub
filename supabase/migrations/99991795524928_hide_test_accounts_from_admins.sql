-- Test accounts are hidden from admins too.
--
-- Owner decision, 2026-11-24, follow-up to 99991795523574_hide_test_accounts:
-- the admin exemption put the QA accounts into the member lists every admin
-- browses (/meet members), which is where the owner kept seeing them. Only
-- test accounts see each other now. The e2e suites run AS test accounts, so
-- they are unaffected. The admin backend (/admin/users) reads through
-- admin_users_list / admin_user_detail, SECURITY DEFINER functions that do not
-- consult this helper, so test accounts stay listed there.

create or replace function api_private.viewer_sees_test_accounts()
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  select exists (select 1 from public.profiles p
                 where p.user_id = (select auth.uid()) and p.is_test_account)
$fn$;

do $verify$
declare
  v_admin uuid;
begin
  if position('has_role' in pg_get_functiondef('api_private.viewer_sees_test_accounts()'::regprocedure)) > 0 then
    raise exception 'viewer_sees_test_accounts still exempts admins';
  end if;

  -- Behaviour: a real (non-test) admin no longer sees test accounts.
  select ur.user_id into v_admin from public.user_roles ur
  join public.profiles p on p.user_id = ur.user_id
  where ur.role = 'admin' and not p.is_test_account
  limit 1;
  if v_admin is not null then
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    if exists (select 1 from public.profiles t where t.is_test_account
               and not api_private.test_account_hidden(t.user_id)) then
      raise exception 'a test account is still visible to a real admin';
    end if;
    perform set_config('request.jwt.claims', '', true);
  end if;
end
$verify$;
