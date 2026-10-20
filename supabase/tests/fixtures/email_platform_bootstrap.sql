-- Standalone Postgres prerequisites for the email migration contract suite.
-- This is deliberately not a replacement for the application's baseline.
do $$ begin
 if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key);
create table public.email_templates(
 template_key text primary key,name text not null,subject text not null,
 html_content text not null,text_content text,variables jsonb default '[]',is_active boolean default true
);
grant usage on schema public,auth to service_role;
grant select on auth.users,public.email_templates to service_role;
