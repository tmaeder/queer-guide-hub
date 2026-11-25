-- Extra existing schema seams for the disposable travel integration harness.
alter table public.profiles add column is_test_account boolean default false;
create table public.user_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id),
  event_type text not null, entity_type text, entity_id text, metadata jsonb,
  created_at timestamptz not null default now(),
  constraint user_events_event_type_known check(event_type in ('page_view')),
  constraint user_events_entity_type_known check(entity_type is null)
);
create type public.app_role as enum ('admin','user');
create function public.has_role_jwt(public.app_role) returns boolean language sql stable as
  $$ select coalesce(current_setting('test.is_admin', true), '') = 'true' $$;
create table public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid references public.conversations(id),
  sender_id uuid references auth.users(id), created_at timestamptz default now(),
  deleted_at timestamptz, message_type text default 'text'
);
