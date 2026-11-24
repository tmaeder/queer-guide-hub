-- Disposable PostgreSQL harness for the migration's existing integration seams.
-- This is not a full Supabase reset. Never run against a hosted database.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table public.geo_places(id uuid primary key, name text, place_type text, country_id uuid);
create table public.geo_country_profiles(place_id uuid primary key, lgbti_criminalization jsonb);
create table public.profiles(id uuid primary key default gen_random_uuid(), user_id uuid unique references auth.users(id), display_name text, avatar_url text);
create table public.trips(id uuid primary key, owner_id uuid references auth.users(id), status text, primary_city_id uuid, primary_country_id uuid, start_date date, end_date date, is_public boolean default false);
create table public.trip_places(id uuid primary key, trip_id uuid references public.trips(id), country_id uuid, city_id uuid);
create table public.events(id uuid primary key, title text, slug text, city_id uuid, status text, is_public boolean not null default true, safety_gated boolean default false, start_date timestamptz, end_date timestamptz);
create table public.conversations(id uuid primary key default gen_random_uuid(), conversation_type text, participants_count integer, title text);
create table public.conversation_participants(conversation_id uuid references public.conversations(id), user_id uuid references auth.users(id), joined_at timestamptz, is_admin boolean);
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, content text, action_url text, related_id uuid, read boolean);
create table public.user_relationships(user_id uuid, target_user_id uuid, relationship_type text);
create function public.is_blocked(a uuid,b uuid) returns boolean language sql stable as $$ select exists(select 1 from public.user_relationships where relationship_type = 'block' and ((user_id=a and target_user_id=b) or (user_id=b and target_user_id=a))) $$;
-- Real existing conversation helper and safety predicates are installed by runner.
