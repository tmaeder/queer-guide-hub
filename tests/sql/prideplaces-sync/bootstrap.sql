-- Isolated dependencies only; run the real source migration against these contracts.
create role anon; create role authenticated; create role service_role;
create table public.ingestion_staging(id uuid default gen_random_uuid() not null primary key,
job_id uuid,
source_type text not null,
target_table text not null,
raw_data jsonb not null,
normalized_data jsonb,
ai_validation_status text default 'pending'::text not null,
ai_confidence_score numeric,
ai_validation_result jsonb default '{}'::jsonb,
ai_validated_at timestamp with time zone,
dedup_status text default 'pending'::text not null,
dedup_match_id uuid,
dedup_match_table text,
dedup_match_score numeric,
dedup_details jsonb default '{}'::jsonb,
enrichment_status text default 'pending'::text not null,
enriched_data jsonb,
review_status text default 'auto'::text not null,
reviewed_by uuid,
reviewed_at timestamp with time zone,
review_notes text,
disposition text default 'pending'::text not null,
target_record_id uuid,
error_message text,
created_at timestamp with time zone default now() not null,
updated_at timestamp with time zone default now() not null,
processed_at timestamp with time zone,
classification_result jsonb,
pipeline_run_id uuid,
node_id text,
entity_type text,
source_name text,
source_entity_id text,
payload_hash text,
idempotency_key text);
create unique index staging_idempotency_test on public.ingestion_staging((coalesce(source_name,source_type)),idempotency_key) where idempotency_key is not null and disposition<>'rejected';
create table public.pipeline_definitions(id uuid primary key default gen_random_uuid(),name text unique,display_name text,description text,nodes jsonb,edges jsonb,default_context jsonb,max_concurrency integer,timeout_seconds integer,schedule text,is_enabled boolean);
create table public.pipeline_runs(id uuid primary key default gen_random_uuid(),pipeline_id uuid,pipeline_name text,status text,started_at timestamptz,completed_at timestamptz,triggered_by text,context jsonb default '{}',items_total integer,items_processed integer,items_succeeded integer,items_failed integer,duration_ms integer,error_message text);
create table public.pipeline_node_types(slug text unique,category text,display_name text,description text,icon text,color text,edge_function text,config_schema jsonb);
create table public.ingestion_sources(name text,slug text unique,source_type text,target_table text,edge_function text,config jsonb,schedule text,is_enabled boolean,last_run_at timestamptz,last_success_at timestamptz,last_error text,total_items_fetched integer);
create table public.admin_automations(slug text unique,name text,description text,managed_by text,enabled boolean,trigger jsonb,action jsonb,schedule text);
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
