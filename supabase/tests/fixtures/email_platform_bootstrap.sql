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

-- Existing privacy entry points, reduced to their boundary contracts. The
-- suite verifies the email wrappers preserve authorization and atomicity;
-- full application table erasure remains covered by the product's own suite.
create table public.profiles(user_id uuid primary key references auth.users(id),display_name text);
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
