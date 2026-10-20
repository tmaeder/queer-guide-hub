-- Standalone Postgres prerequisites for the email migration contract suite.
-- This is deliberately not a replacement for the application's baseline.
do $$ begin
 if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key,email text);
create table public.email_templates(
 template_key text primary key,name text not null,subject text not null,
 html_content text not null,text_content text,variables jsonb default '[]',is_active boolean default true
);
grant usage on schema public,auth to service_role;
grant select on auth.users,public.email_templates to service_role;
-- Test-only emulation of the Auth provider changing an account's primary
-- address. Application migrations do not grant this privilege.
grant update(email) on auth.users to service_role;

-- Existing privacy entry points, reduced to their boundary contracts. The
-- suite verifies the email wrappers preserve authorization and atomicity;
-- full application table erasure remains covered by the product's own suite.
create table public.profiles(user_id uuid primary key references auth.users(id),display_name text,username text);
create table public.event_attendees(id uuid primary key default gen_random_uuid(),event_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,status text);
create table public.group_memberships(id uuid primary key default gen_random_uuid(),group_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,role text not null default 'member');
create table public.trip_members(id uuid primary key default gen_random_uuid(),trip_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,role text not null default 'editor',accepted_at timestamptz);
grant all on public.event_attendees,public.group_memberships,public.trip_members,public.profiles to service_role;
create function public._delete_user_data_core(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from public.profiles where user_id=p_user_id;
 return jsonb_build_object('profile_deleted',true);
end $$;
revoke all on function public._delete_user_data_core(uuid) from public,anon,authenticated;
grant execute on function public._delete_user_data_core(uuid) to service_role;
create function public.admin_anonymize_user(p_user_id uuid,p_reason text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if current_setting('request.jwt.claim.sub',true) is distinct from 'aaaaaaaa-0000-4000-8000-000000000001' then
  raise exception 'forbidden' using errcode='42501';
 end if;
 update public.profiles set display_name='Deleted user' where user_id=p_user_id;
 return jsonb_build_object('anonymized',true);
end $$;

create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,type text,read boolean not null default false,related_id uuid,created_at timestamptz not null default now());
create table public.conversations(id uuid primary key default gen_random_uuid());
create table public.conversation_participants(id uuid primary key default gen_random_uuid(),conversation_id uuid references public.conversations(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,is_muted boolean default false,last_read_at timestamptz);
create table public.push_sent(user_id uuid references auth.users(id) on delete cascade,kind text,day_bucket date);
grant all on public.notifications,public.conversations,public.conversation_participants,public.push_sent to service_role;
