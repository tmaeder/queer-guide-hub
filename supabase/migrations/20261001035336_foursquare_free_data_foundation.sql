-- Foursquare free-data foundation
--
-- FSQ OS Places is the bulk source (Apache-2.0, delivered through the Places
-- Portal/Iceberg catalog). The Places API is deliberately treated as a scarce
-- Pro-field supplement: its current free tier is protected by an atomic monthly
-- allowance with a safety margin. All tables in public are service-only and have
-- RLS enabled because public is an exposed Data API schema.

create table if not exists public.foursquare_api_budget (
  month_start   date primary key,
  call_limit    integer not null default 500 check (call_limit >= 0),
  safety_margin integer not null default 50 check (safety_margin >= 0),
  calls_used    integer not null default 0 check (calls_used >= 0),
  by_purpose    jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  check (safety_margin <= call_limit),
  check (calls_used <= call_limit)
);
comment on table public.foursquare_api_budget is
  'Calendar-month Places API allowance. reserve_foursquare_api_calls atomically refuses calls beyond call_limit-safety_margin so API integrations cannot create paid usage.';
alter table public.foursquare_api_budget enable row level security;
revoke all on table public.foursquare_api_budget from public, anon, authenticated;
grant select, insert, update on table public.foursquare_api_budget to service_role;
create or replace function public.reserve_foursquare_api_calls(
  p_purpose text,
  p_calls integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_month date := date_trunc('month', current_date)::date;
  v_calls integer := greatest(coalesce(p_calls, 1), 0);
  v_purpose text := nullif(btrim(coalesce(p_purpose, '')), '');
  v_row public.foursquare_api_budget%rowtype;
begin
  if v_purpose is null then
    return jsonb_build_object('allowed', false, 'reason', 'missing_purpose');
  end if;

  insert into public.foursquare_api_budget(month_start)
  values (v_month)
  on conflict (month_start) do nothing;

  update public.foursquare_api_budget b
     set calls_used = b.calls_used + v_calls,
         by_purpose = jsonb_set(
           b.by_purpose,
           array[v_purpose],
           to_jsonb(coalesce((b.by_purpose ->> v_purpose)::integer, 0) + v_calls),
           true
         ),
         updated_at = now()
   where b.month_start = v_month
     and b.calls_used + v_calls <= greatest(b.call_limit - b.safety_margin, 0)
  returning b.* into v_row;

  if found then
    return jsonb_build_object(
      'allowed', true,
      'month_start', v_row.month_start,
      'spent', v_row.calls_used,
      'remaining', greatest(v_row.call_limit - v_row.safety_margin - v_row.calls_used, 0),
      'limit', v_row.call_limit,
      'safety_margin', v_row.safety_margin,
      'purpose', v_purpose
    );
  end if;

  select * into v_row
    from public.foursquare_api_budget
   where month_start = v_month;

  return jsonb_build_object(
    'allowed', false,
    'reason', 'free_tier_exhausted',
    'month_start', v_month,
    'spent', coalesce(v_row.calls_used, 0),
    'remaining', 0,
    'limit', coalesce(v_row.call_limit, 500),
    'safety_margin', coalesce(v_row.safety_margin, 50),
    'purpose', v_purpose
  );
end;
$function$;
revoke all on function public.reserve_foursquare_api_calls(text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_foursquare_api_calls(text, integer)
  to service_role;
create table if not exists public.foursquare_categories (
  category_id          text primary key,
  category_level       smallint check (category_level between 1 and 6),
  category_name        text,
  category_label       text,
  hierarchy            jsonb not null default '{}'::jsonb,
  venue_category       text check (venue_category is null or venue_category in (
    'bar','club','restaurant','hotel','sauna','theater','community_center',
    'organization','event-venue','gallery','other'
  )),
  accommodation_type  text check (accommodation_type is null or accommodation_type in (
    'hotel','bnb','hostel','resort','guesthouse','apartment','villa','campground'
  )),
  discovery_eligible  boolean not null default false,
  source_release_id   text,
  updated_at          timestamptz not null default now()
);
comment on table public.foursquare_categories is
  'Local mirror of the free FSQ category dataset plus explicit Queer Guide mappings. Labels are evidence for place type, never LGBTQ+ relevance.';
create index if not exists foursquare_categories_venue_category_idx
  on public.foursquare_categories(venue_category)
  where venue_category is not null;
create table if not exists public.foursquare_place_redirects (
  old_place_id       text primary key,
  new_place_id       text not null,
  action             text not null default 'merge' check (action = 'merge'),
  source_release_id  text,
  payload            jsonb not null default '{}'::jsonb,
  observed_at        timestamptz not null default now(),
  check (old_place_id <> new_place_id)
);
create index if not exists foursquare_place_redirects_new_idx
  on public.foursquare_place_redirects(new_place_id);
comment on table public.foursquare_place_redirects is
  'FSQ OS delta merge crosswalk. Old identifiers remain resolvable and are never silently discarded.';
create table if not exists public.foursquare_sync_state (
  stream_key         text primary key check (stream_key in ('categories','snapshot','delta')),
  source_release_id  text,
  cursor             jsonb not null default '{}'::jsonb,
  status             text not null default 'idle' check (status in ('idle','running','succeeded','failed','skipped')),
  stats              jsonb not null default '{}'::jsonb,
  last_started_at    timestamptz,
  last_success_at    timestamptz,
  last_error         text,
  updated_at         timestamptz not null default now()
);
comment on table public.foursquare_sync_state is
  'Resumable checkpoint and health state for FSQ OS category, snapshot, and delta streams.';
alter table public.foursquare_categories enable row level security;
alter table public.foursquare_place_redirects enable row level security;
alter table public.foursquare_sync_state enable row level security;
revoke all on table public.foursquare_categories from public, anon, authenticated;
revoke all on table public.foursquare_place_redirects from public, anon, authenticated;
revoke all on table public.foursquare_sync_state from public, anon, authenticated;
grant select, insert, update on table public.foursquare_categories to service_role;
grant select, insert, update on table public.foursquare_place_redirects to service_role;
grant select, insert, update on table public.foursquare_sync_state to service_role;
-- Keep provider identity columns in sync with canonical venue_sources. These
-- are provider-specific facts, not a consensus overwrite of editorial fields.
create or replace function public.sync_foursquare_venue_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_raw jsonb := coalesce(new.payload -> 'raw', '{}'::jsonb);
  v_norm jsonb := coalesce(new.payload -> 'normalized', '{}'::jsonb);
  v_meta jsonb := coalesce(new.payload -> 'normalized' -> 'metadata', '{}'::jsonb);
  v_fsq_id text;
  v_rating numeric;
  v_flags jsonb;
  v_should_triage boolean := false;
begin
  if new.source_slug not in ('foursquare', 'foursquare_os') then
    return new;
  end if;

  v_fsq_id := coalesce(
    nullif(new.source_entity_id, ''),
    nullif(v_meta ->> 'foursquare_id', ''),
    nullif(v_raw ->> 'fsq_place_id', ''),
    nullif(v_raw ->> 'fsq_id', '')
  );
  if v_fsq_id is null then return new; end if;

  if coalesce(v_meta ->> 'foursquare_rating', '') ~ '^[0-9]+([.][0-9]+)?$' then
    v_rating := (v_meta ->> 'foursquare_rating')::numeric;
  end if;
  v_flags := coalesce(v_raw -> 'unresolved_flags', v_meta -> 'unresolved_flags', '[]'::jsonb);

  update public.venues v
     set foursquare_id = coalesce(v.foursquare_id, v_fsq_id),
         platform_ids = coalesce(v.platform_ids, '{}'::jsonb)
           || jsonb_build_object('foursquare', v_fsq_id),
         foursquare_rating = coalesce(v_rating, v.foursquare_rating),
         foursquare_data = coalesce(v.foursquare_data, '{}'::jsonb)
           || jsonb_build_object(
                'last_source', new.source_slug,
                'observed_at', new.last_seen_at,
                'date_refreshed', coalesce(v_raw -> 'date_refreshed', v_meta -> 'date_refreshed'),
                'date_closed', coalesce(v_raw -> 'date_closed', v_meta -> 'date_closed'),
                'unresolved_flags', v_flags,
                'placemaker_url', coalesce(v_raw -> 'placemaker_url', v_meta -> 'placemaker_url')
              ),
         last_synced_at = greatest(coalesce(v.last_synced_at, '-infinity'::timestamptz), new.last_seen_at),
         updated_at = case
           when v.foursquare_id is null or v.platform_ids ->> 'foursquare' is distinct from v_fsq_id
             or (v_rating is not null and v.foursquare_rating is distinct from v_rating)
           then now() else v.updated_at end
   where v.id = new.venue_id;

  if jsonb_typeof(v_flags) = 'array' and jsonb_array_length(v_flags) > 0 then
    v_should_triage := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then
      v_should_triage := old.payload_hash is distinct from new.payload_hash;
    end if;
  end if;

  if v_should_triage then
    update public.venues set needs_attention = true where id = new.venue_id;
    insert into public.venue_consensus_audit(
      venue_id, field, winning_value, winning_source, confidence,
      conflicting_sources, action, details
    ) values (
      new.venue_id, 'foursquare_quality_flags', v_flags, new.source_slug, 0.55,
      array[new.source_slug], 'triage',
      jsonb_build_object(
        'fsq_place_id', v_fsq_id,
        'placemaker_url', coalesce(v_raw -> 'placemaker_url', v_meta -> 'placemaker_url'),
        'date_closed', coalesce(v_raw -> 'date_closed', v_meta -> 'date_closed'),
        'source_payload_hash', new.payload_hash
      )
    );
  end if;

  return new;
end;
$function$;
drop trigger if exists trg_sync_foursquare_venue_identity on public.venue_sources;
create trigger trg_sync_foursquare_venue_identity
after insert or update of payload, payload_hash, last_seen_at on public.venue_sources
for each row execute function public.sync_foursquare_venue_identity();
revoke all on function public.sync_foursquare_venue_identity() from public, anon, authenticated;
create or replace function public.foursquare_data_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'api_budget', coalesce((
      select to_jsonb(b) || jsonb_build_object(
        'remaining', greatest(b.call_limit - b.safety_margin - b.calls_used, 0)
      )
        from public.foursquare_api_budget b
       where b.month_start = date_trunc('month', current_date)::date
    ), jsonb_build_object(
      'month_start', date_trunc('month', current_date)::date,
      'call_limit', 500,
      'safety_margin', 50,
      'calls_used', 0,
      'remaining', 450,
      'by_purpose', '{}'::jsonb
    )),
    'sync_streams', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.stream_key)
        from public.foursquare_sync_state s
    ), '[]'::jsonb),
    'categories', (select count(*) from public.foursquare_categories),
    'redirects', (select count(*) from public.foursquare_place_redirects),
    'linked_venues', (
      select count(*) from public.venues v
       where v.foursquare_id is not null
          or coalesce(v.platform_ids ->> 'foursquare', '') <> ''
    ),
    'source_records', (
      select count(*) from public.venue_sources vs
       where vs.source_slug in ('foursquare', 'foursquare_os')
    ),
    'generated_at', now()
  );
$function$;
revoke all on function public.foursquare_data_health() from public, anon, authenticated;
grant execute on function public.foursquare_data_health() to service_role;
-- Revive the API source on the current host, but keep OS access a separate
-- operator-triggered source because portal/Iceberg credentials and release IDs
-- are explicit inputs to the resumable sync CLI.
update public.ingestion_sources
   set name = 'Foursquare Places API',
       edge_function = 'source-foursquare',
       is_enabled = true,
       requires_api_key = 'FOURSQUARE_API_KEY',
       rate_limit_per_day = 15,
       config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
         'api_host', 'places-api.foursquare.com',
         'api_version', '2025-06-17',
         'pricing_tier', 'pro-only',
         'premium_fields_enabled', false,
         'monthly_free_limit', 500,
         'monthly_safety_margin', 50,
         'default_mode', 'venues'
       ),
       updated_at = now()
 where slug = 'foursquare';
insert into public.ingestion_sources(
  name, slug, source_type, target_table, edge_function, config,
  schedule, is_enabled, requires_api_key, rate_limit_per_minute, rate_limit_per_day
)
values (
  'Foursquare OS Places', 'foursquare-os', 'dataset', 'venues', 'source-foursquare',
  jsonb_build_object(
    'license', 'Apache-2.0',
    'delivery', 'places-portal-iceberg',
    'operator_auth', 'portal token stays in the export environment; it is not an Edge Function secret',
    'supports', jsonb_build_array('categories','snapshot','delta')
  ),
  null, true, null, 60, 100000
)
on conflict (slug) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  target_table = excluded.target_table,
  edge_function = excluded.edge_function,
  config = excluded.config,
  is_enabled = excluded.is_enabled,
  requires_api_key = excluded.requires_api_key,
  updated_at = now();
notify pgrst, 'reload schema';
