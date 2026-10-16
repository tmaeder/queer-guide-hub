-- Minimal PostgreSQL 17 harness for event_gap_automation.sql. A production-schema
-- smoke test is also required: this fixture cannot model all existing triggers.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.events (
 id uuid primary key default gen_random_uuid(),title text,slug text,description text,
 website text,ticket_url text,status text default 'active',start_date timestamptz,end_date timestamptz,
 duplicate_of_id uuid,venue_name text,address text,accessibility_attributes text[],target_groups text[],
 age_restriction text,images text[],enrichment_status jsonb,field_provenance jsonb,updated_at timestamptz default now(),
 is_recurring boolean default false,data_source text,needs_attention boolean default false
);
create table public.event_sources(event_id uuid,source_url text,source_slug text,payload jsonb,
 payload_hash text,is_primary boolean,last_seen_at timestamptz);
create table public.event_quality_issues(event_id uuid,status text,issue_code text,evidence jsonb);
create table public.event_quality_current(event_id uuid primary key,rubric_version integer,event_scope text,
 completeness_score integer,validity_score integer,linkage_score integer,provenance_score integer,
 media_score integer,freshness_score integer,overall_score integer,quality_tier text,input_updated_at timestamptz);
create table public.event_quality_signals(event_id uuid,signal_type text,value numeric(5,4),source text,
 details jsonb,created_at timestamptz default now());
create table public.llm_budget(caller_key text primary key,daily_cap int,spent_today int,window_start date,updated_at timestamptz);
create function public.event_quality_url_is_safe(text) returns boolean language sql immutable
as $$ select $1 ~ '^https://[^/]+/' and $1 !~ '(127[.]0[.]0[.]1|localhost)' $$;
