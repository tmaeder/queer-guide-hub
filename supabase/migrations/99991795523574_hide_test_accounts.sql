-- Test accounts are invisible to real members.
--
-- Owner decision, 2026-11-24: the QA accounts (claude-test, claude-e2e-2026,
-- claude-test-2) must not show up for real users anywhere. They still see
-- each other, and admins see them, so the e2e suites keep working.
--
-- 'private' visibility is not enough: since 99991795467849_member_basic_cards a
-- private member still gets a basic card in the directory. So this adds a
-- flag the user cannot set (no column grant), a RESTRICTIVE select policy for
-- everything that reads profiles under RLS (directory, invoker views such as
-- intimate_discovery_v / public_profiles), and a filter in every SECURITY
-- DEFINER function that lists or counts other members, since those bypass RLS.
--
-- profiles.id and profiles.user_id differ on every row; intimate_* tables key
-- on profiles.id, everything else on user_id. test_account_hidden() accepts
-- either.

alter table public.profiles
  add column if not exists is_test_account boolean not null default false;

comment on column public.profiles.is_test_account is
  'QA account. Hidden from real members (RLS + member-listing functions); visible to itself, other test accounts and admins. Not writable by users.';

select set_config('app.actor', 'migration:99991795523574_hide_test_accounts', true);
update public.profiles set is_test_account = true
where user_id in (
  'dfec8c70-5b7d-4e31-bf0e-1fc1521a0720',  -- claude-test@queer.guide (admin)
  '172c70e5-3b66-4601-8826-550a3da2f291',  -- claude-e2e-2026@queer.guide
  'e2e00002-0000-4000-8000-000000000002'   -- claude-test-2@queer.guide
) and not is_test_account;

-- Can the current caller see test accounts? Admins and test accounts can.
create or replace function api_private.viewer_sees_test_accounts()
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  select api_private.has_role_jwt('admin'::public.app_role)
      or exists (select 1 from public.profiles p
                 where p.user_id = (select auth.uid()) and p.is_test_account)
$fn$;

-- Is this member (by user_id or profiles.id) a test account the caller must not see?
create or replace function api_private.test_account_hidden(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  select exists (select 1 from public.profiles p
                 where (p.user_id = p_id or p.id = p_id) and p.is_test_account)
     and not api_private.viewer_sees_test_accounts()
$fn$;

revoke all on function api_private.viewer_sees_test_accounts() from public;
revoke all on function api_private.test_account_hidden(uuid) from public;
grant execute on function api_private.viewer_sees_test_accounts() to anon, authenticated, service_role;
grant execute on function api_private.test_account_hidden(uuid) to anon, authenticated, service_role;

drop policy if exists profiles_hide_test_accounts on public.profiles;
create policy profiles_hide_test_accounts on public.profiles
  as restrictive
  for select
  to public
  using (
    not is_test_account
    or user_id = (select auth.uid())
    or (select api_private.viewer_sees_test_accounts())
  );

-- Patch the live definer functions (exactly-count anchors, never restated).
do $patch$
declare
  r record;
  v_src text;
  v_n int;
begin
  for r in
    select * from (values
      ('api_private.member_cards(text,integer)',
       $a$  where (select auth.uid()) is not null$a$,
       $b$  where (select auth.uid()) is not null
    and not api_private.test_account_hidden(p.user_id)$b$, 1),
      ('api_private.people_discovery(uuid,text,uuid,uuid,uuid,integer,integer)',
       $a$where dv.user_id <> p_viewer$a$,
       $b$where dv.user_id <> p_viewer and not api_private.test_account_hidden(dv.user_id)$b$, 1),
      ('api_private.people_discovery(uuid,text,uuid,uuid,uuid,integer,integer)',
       $a$where p.user_id <> p_viewer$a$,
       $b$where p.user_id <> p_viewer and not api_private.test_account_hidden(p.user_id)$b$, 3),
      ('api_private.people_discovery(uuid,text,uuid,uuid,uuid,integer,integer)',
       $a$where upl.user_id <> p_viewer$a$,
       $b$where upl.user_id <> p_viewer and not api_private.test_account_hidden(upl.user_id)$b$, 1),
      ('api_private.intimate_discover(uuid,text[],text[],text[],text[],integer)',
       $a$  where ip.id <> v_viewer$a$,
       $b$  where ip.id <> v_viewer
    and not api_private.test_account_hidden(ip.id)$b$, 1),
      ('api_private.suggest_message_recipients(uuid,integer)',
       $a$  WHERE NOT public.is_blocked(p_user, m.user_id)$a$,
       $b$  WHERE NOT public.is_blocked(p_user, m.user_id)
    AND NOT api_private.test_account_hidden(m.user_id)$b$, 1),
      ('api_private.cruising_presence_areas()',
       $a$    and not public.intimate_is_blocked(v_uid, p.user_id)$a$,
       $b$    and not public.intimate_is_blocked(v_uid, p.user_id)
    and not api_private.test_account_hidden(p.user_id)$b$, 1),
      ('api_private.meet_member_count_for_location(uuid,uuid)',
       $a$where coalesce(p.privacy_settings ->> 'profile_visibility', '') in ('public', 'community')$a$,
       $b$where coalesce(p.privacy_settings ->> 'profile_visibility', '') in ('public', 'community')
        and not api_private.test_account_hidden(p.user_id)$b$, 2),
      ('api_private.get_public_profile_safe(uuid)',
       $a$  is_admin := public.has_role_jwt('admin'::public.app_role);$a$,
       $b$  is_admin := public.has_role_jwt('admin'::public.app_role);

  IF profile_record.is_test_account AND NOT is_owner
     AND NOT api_private.viewer_sees_test_accounts() THEN
    RETURN NULL;
  END IF;$b$, 1)
    ) as t(fn, v_from, v_to, expected)
  loop
    v_src := pg_get_functiondef(r.fn::regprocedure);
    if position(r.v_to in v_src) > 0 then
      raise notice '% already patched; skipping', r.fn;
      continue;
    end if;
    v_n := (length(v_src) - length(replace(v_src, r.v_from, ''))) / length(r.v_from);
    if v_n <> r.expected then
      raise exception '%: expected % anchor(s), found %', r.fn, r.expected, v_n;
    end if;
    execute replace(v_src, r.v_from, r.v_to);
  end loop;
end
$patch$;

-- Postconditions.
do $verify$
declare
  v_fn text;
  v_real uuid;
begin
  if (select count(*) from public.profiles where is_test_account) < 1 then
    raise exception 'no profile is flagged as a test account';
  end if;
  if not exists (select 1 from pg_policy
                 where polrelid = 'public.profiles'::regclass
                   and polname = 'profiles_hide_test_accounts'
                   and not polpermissive and polcmd = 'r') then
    raise exception 'restrictive select policy profiles_hide_test_accounts missing';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'is_test_account', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'is_test_account', 'INSERT') then
    raise exception 'authenticated must not be able to write is_test_account';
  end if;
  foreach v_fn in array array[
    'api_private.member_cards(text,integer)',
    'api_private.people_discovery(uuid,text,uuid,uuid,uuid,integer,integer)',
    'api_private.intimate_discover(uuid,text[],text[],text[],text[],integer)',
    'api_private.suggest_message_recipients(uuid,integer)',
    'api_private.cruising_presence_areas()',
    'api_private.meet_member_count_for_location(uuid,uuid)',
    'api_private.get_public_profile_safe(uuid)'
  ] loop
    if position('test_account' in pg_get_functiondef(v_fn::regprocedure)) = 0 then
      raise exception '% does not filter test accounts', v_fn;
    end if;
  end loop;

  -- Behaviour: as a real non-admin member, the helper hides a test account.
  select p.user_id into v_real from public.profiles p
  where not p.is_test_account
    and not exists (select 1 from public.user_roles ur where ur.user_id = p.user_id and ur.role = 'admin')
  limit 1;
  if v_real is not null then
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_real, 'role', 'authenticated')::text, true);
    if exists (select 1 from public.profiles t where t.is_test_account
               and not api_private.test_account_hidden(t.user_id)) then
      raise exception 'a test account is visible to a real member';
    end if;
    if exists (select 1 from api_private.member_cards(null, 200) c
               join public.profiles t on t.user_id = c.user_id where t.is_test_account) then
      raise exception 'member_cards lists a test account to a real member';
    end if;
    perform set_config('request.jwt.claims', '', true);
  end if;
end
$verify$;
