-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127080326 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- General event identity: shared by ingest and the existing audited nightly sweep.
-- No festival-specific names. Existing duplicate titles provide durable aliases.
create or replace function api_private.event_identity_conflicts(a jsonb,b jsonb)
returns boolean language plpgsql immutable set search_path = public,extensions,pg_temp as $$
declare sa timestamptz:=(a->>'start_date')::timestamptz; sb timestamptz:=(b->>'start_date')::timestamptz;
  ea timestamptz:=(a->>'end_date')::timestamptz; eb timestamptz:=(b->>'end_date')::timestamptz;
  ya text[];yb text[];
begin
  if nullif(a->>'city_id','') is not null and nullif(b->>'city_id','') is not null and a->>'city_id'<>b->>'city_id' then return true; end if;
  if not coalesce(nullif(a->>'city_id','')=nullif(b->>'city_id',''),false)
    and nullif(a->>'city','') is not null and nullif(b->>'city','') is not null
    and public.normalize_name(a->>'city')<>public.normalize_name(b->>'city') then return true; end if;
  if nullif(a->>'country_id','') is not null and nullif(b->>'country_id','') is not null and a->>'country_id'<>b->>'country_id' then return true; end if;
  if nullif(a->>'country','') is not null and nullif(b->>'country','') is not null
    and public.normalize_name(a->>'country')<>public.normalize_name(b->>'country') then return true; end if;
  if nullif(a->>'edition','') is not null and nullif(b->>'edition','') is not null
    and public.normalize_name(a->>'edition')<>public.normalize_name(b->>'edition') then return true; end if;
  select array_agg(x[1] order by x[1]) into ya from regexp_matches(a->>'title','\m((19|20)[0-9]{2})\M','g') x;
  select array_agg(x[1] order by x[1]) into yb from regexp_matches(b->>'title','\m((19|20)[0-9]{2})\M','g') x;
  if ya is not null and yb is not null and ya<>yb then return true; end if;
  if coalesce(ea-sa between interval '20 hours' and interval '31 days'
    and eb-sb between interval '20 hours' and interval '31 days',false) then
    return sa>=eb or sb>=ea;
  end if;
  -- Separate dated performances must not be rescued by the legacy 48h venue arm.
  if sa<>sb and ((sa at time zone 'UTC')::date<>(sb at time zone 'UTC')::date
    or ((sa at time zone 'UTC')::time<>time '00:00:00' and (sb at time zone 'UTC')::time<>time '00:00:00')) then return true; end if;
  return false;
end $$;

create or replace function api_private.event_name_tokens(p_title text, p_city text, p_multiday boolean)
returns text[] language sql immutable parallel safe
set search_path = public, extensions, pg_temp as $$
  select coalesce(array_agg(distinct token order by token), '{}'::text[])
  from unnest(string_to_array(public.normalize_name(p_title), ' ')) token
  where length(token) > 1
    and token !~ '^(19|20)[0-9]{2}$'
    and token <> all(string_to_array(public.normalize_name(coalesce(p_city,'')), ' '))
    and token <> all(array['the','and','of','edition','event','festival','fest','festivals'])
    and (not p_multiday or token <> all(array[
      'fetish','fetisch','gay','lgbt','lgbtq','queer','weekend','week',
      'after','parties','party','official']))
$$;

create or replace function api_private.event_identity_reason(a jsonb, b jsonb)
returns text language plpgsql immutable
set search_path = public, extensions, pg_temp as $$
declare
  sa timestamptz := (a->>'start_date')::timestamptz;
  sb timestamptz := (b->>'start_date')::timestamptz;
  ea timestamptz := (a->>'end_date')::timestamptz;
  eb timestamptz := (b->>'end_date')::timestamptz;
  multi boolean; same_place boolean; exact_name boolean := false; subset_name boolean := false;
  ta text; tb text; ka text[]; kb text[]; ya text[]; yb text[]; ca text[]; cb text[];
  subtypes text[] := array['black','trans','transgender','lesbian','dyke','bear','leather','youth','winter','summer','village'];
  full_range boolean; contained boolean; overlap_ratio numeric;
begin
  if sa is null or sb is null then return null; end if;
  -- Programme structure and conflicting editions are explicit vetoes.
  if nullif(a->>'parent_event_id','') is not null or nullif(b->>'parent_event_id','') is not null then return null; end if;
  if nullif(a->>'edition','') is not null and nullif(b->>'edition','') is not null
     and public.normalize_name(a->>'edition') <> public.normalize_name(b->>'edition') then return null; end if;
  select array_agg(x[1] order by x[1]) into ya from regexp_matches(a->>'title', '\m((19|20)[0-9]{2})\M','g') x;
  select array_agg(x[1] order by x[1]) into yb from regexp_matches(b->>'title', '\m((19|20)[0-9]{2})\M','g') x;
  if ya is not null and yb is not null and ya <> yb then return null; end if;
  if nullif(a->>'country_id','') is not null and nullif(b->>'country_id','') is not null
     and a->>'country_id' <> b->>'country_id' then return null; end if;
  if nullif(a->>'country','') is not null and nullif(b->>'country','') is not null
     and public.normalize_name(a->>'country') <> public.normalize_name(b->>'country') then return null; end if;
  if nullif(a->>'city_id','') is not null and nullif(b->>'city_id','') is not null then
    same_place := a->>'city_id' = b->>'city_id';
  else
    same_place := nullif(public.normalize_name(a->>'city'),'') is not null
      and public.normalize_name(a->>'city') = public.normalize_name(b->>'city')
      and ((nullif(a->>'country_id','') is not null and a->>'country_id' = b->>'country_id')
        or (nullif(a->>'country','') is not null and lower(a->>'country') = lower(b->>'country')));
  end if;
  if not coalesce(same_place,false) then return null; end if;
  multi := coalesce(ea-sa between interval '20 hours' and interval '31 days'
    and eb-sb between interval '20 hours' and interval '31 days', false);
  -- Never discard pre-party/show/session names to manufacture a festival identity.
  if multi and (public.normalize_name(a->>'title') ~ '\m(pre|opening|closing|workshop|social|session|concert|show|presents|supports|hosted|dj|at)\M'
    or public.normalize_name(b->>'title') ~ '\m(pre|opening|closing|workshop|social|session|concert|show|presents|supports|hosted|dj|at)\M'
    or a->>'title' like '%@%' or b->>'title' like '%@%') then return null; end if;
  if multi then
    if sa >= eb or sb >= ea then return null; end if;
  elsif sa <> sb then return null;
  end if;
  ca := api_private.event_name_tokens(a->>'title',a->>'city',multi);
  cb := api_private.event_name_tokens(b->>'title',b->>'city',multi);
  for ta in select a->>'title' union select jsonb_array_elements_text(coalesce(a->'aliases','[]')) loop
    for tb in select b->>'title' union select jsonb_array_elements_text(coalesce(b->'aliases','[]')) loop
      ka := api_private.event_name_tokens(ta,a->>'city',multi);
      kb := api_private.event_name_tokens(tb,b->>'city',multi);
      if cardinality(ka)=0 or cardinality(kb)=0 then continue; end if;
      -- Earlier merges can contain mistakes. An alias may abbreviate a canonical
      -- title, but may never introduce a separately named party into its identity.
      if not (ca @> ka) or not (cb @> kb) then continue; end if;
      if exists(select 1 from unnest(ca) t where t=any(subtypes) and not t=any(ka))
        or exists(select 1 from unnest(cb) t where t=any(subtypes) and not t=any(kb)) then continue; end if;
      if ka=kb then exact_name := true; end if;
      if (ka @> kb or kb @> ka) and exists (
        select 1 from unnest(ka) t where t=any(kb) and length(t)>=5
          and t <> all(array['pride','leather','carnival','music','dance','film','easter','festival','weekend'])
      ) then subset_name := true; end if;
    end loop;
  end loop;
  if not exact_name and not subset_name then return null; end if;
  if multi then
    full_range := (sa at time zone 'UTC')::date = (sb at time zone 'UTC')::date
      and (ea at time zone 'UTC')::date = (eb at time zone 'UTC')::date;
    contained := (sa <= sb and ea >= eb) or (sb <= sa and eb >= ea);
    overlap_ratio := extract(epoch from least(ea,eb)-greatest(sa,sb)) / greatest(extract(epoch from ea-sa),extract(epoch from eb-sb));
    if exact_name and ((contained and overlap_ratio>=0.5) or full_range) then
      return 'festival_identity_range';
    end if;
    return 'festival_identity_review';
  end if;
  if not exact_name then return null; end if;
  if nullif(a->>'venue_id','') is not null and nullif(b->>'venue_id','') is not null
     and a->>'venue_id' <> b->>'venue_id' then return 'event_identity_review'; end if;
  if nullif(public.normalize_name(a->>'venue_name'),'') is not null and nullif(public.normalize_name(b->>'venue_name'),'') is not null
     and public.normalize_name(a->>'venue_name') <> public.normalize_name(b->>'venue_name') then return 'event_identity_review'; end if;
  if (sa at time zone 'UTC')::time <> time '00:00:00'
     or (nullif(a->>'venue_id','') is not null and a->>'venue_id'=b->>'venue_id') then return 'event_identity_instant'; end if;
  return 'event_identity_review';
end $$;

create or replace function api_private.event_identity_document(p_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('title',e.title,'city',e.city,'city_id',e.city_id,
    'country',e.country,'country_id',e.country_id,'start_date',e.start_date,'end_date',e.end_date,
    'venue_id',e.venue_id,'venue_name',e.venue_name,'edition',e.edition,'parent_event_id',e.parent_event_id,
    'aliases',coalesce((
    select jsonb_agg(d.title) from public.events d where d.duplicate_of_id=e.id
      and d.city_id is not distinct from e.city_id
      and d.start_date between e.start_date - interval '31 days' and coalesce(e.end_date,e.start_date) + interval '1 day'
  ),'[]'::jsonb)) from public.events e where e.id=p_id
$$;

-- Rich ingest entry point. Keep the old RPC signature available to other callers.
create or replace function public.find_event_identity_candidates(
  p_title text, p_start_date timestamptz, p_venue_id uuid default null,
  p_city text default null, p_lat numeric default null, p_lng numeric default null,
  p_edition text default null, p_limit integer default 20, p_end_date timestamptz default null,
  p_city_id uuid default null, p_country text default null, p_country_id uuid default null,
  p_venue_name text default null)
returns table(event_id uuid, match_type text, score numeric, distance_m double precision, time_diff_hours double precision)
language sql stable set search_path = public, extensions, pg_temp as $$
  with input as (select jsonb_build_object('title',p_title,'start_date',p_start_date,'end_date',p_end_date,
    'venue_id',p_venue_id,'venue_name',p_venue_name,'city',p_city,'city_id',p_city_id,
    'country',p_country,'country_id',p_country_id,'edition',p_edition) doc),
  identity as materialized (
    select e.id, api_private.event_identity_reason(i.doc,api_private.event_identity_document(e.id)) reason,
      public.haversine_m(p_lat,p_lng,e.latitude,e.longitude) dm,
      (extract(epoch from e.start_date-p_start_date)/3600)::double precision th
    from public.events e cross join input i
    where e.duplicate_of_id is null and coalesce(e.status,'') <> 'archived'
      and ((p_city_id is not null and e.city_id=p_city_id)
        or (p_city is not null and public.normalize_name(e.city)=public.normalize_name(p_city)))
      and e.start_date <= coalesce(p_end_date,p_start_date)
      and coalesce(e.end_date,e.start_date) >= p_start_date
      and e.start_date >= p_start_date-interval '31 days'
  ), candidates as (
    select id,reason,case when reason in ('festival_identity_range','event_identity_instant') then 0.96 else 0.84 end::numeric sc,dm,th
    from identity where reason is not null
    union all
    select c.event_id,c.match_type,c.score,c.distance_m,c.time_diff_hours
    from public.find_event_duplicate_candidates(p_title,p_start_date,p_venue_id,p_city,p_lat,p_lng,p_edition,p_limit) c
    cross join input i
    where not api_private.event_identity_conflicts(i.doc,api_private.event_identity_document(c.event_id))
      and not exists(select 1 from identity d where d.id=c.event_id and d.reason is not null)
  ), best as (
    select distinct on (id) * from candidates order by id,sc desc
  ) select b.id,b.reason,b.sc,b.dm,b.th from best b join public.events e on e.id=b.id
    order by b.sc desc, (coalesce(e.end_date,e.start_date)-e.start_date) desc,
      e.quality_score desc nulls last,abs(b.th),b.id limit greatest(0,least(p_limit,100))
$$;

create or replace function api_private.event_identity_pairs()
returns table(a_id uuid,b_id uuid,a_title text,b_title text,is_auto boolean,conf numeric,
  reason text,dm double precision,aq numeric,af boolean,ac timestamptz,bq numeric,bf boolean,bc timestamptz)
language sql stable set search_path = public, extensions, pg_temp as $$
  with live as materialized (
    select e.id,e.title,e.start_date,e.end_date,e.city_id,e.quality_score,e.is_featured,e.created_at,
      public.normalize_name(e.city) city_key,public.normalize_name(e.country) country_key,
      api_private.event_name_tokens(e.title,e.city,coalesce(e.end_date-e.start_date between interval '20 hours' and interval '31 days',false)) tokens
    from public.events e where e.duplicate_of_id is null and coalesce(e.status,'')<>'archived'
      and e.parent_event_id is null
  ), pairs as materialized (
    select a.*, b.id bid,b.title btitle,b.quality_score bquality,b.is_featured bfeatured,b.created_at bcreated,
      b.start_date bstart,b.end_date bend,
      api_private.event_identity_reason(api_private.event_identity_document(a.id),api_private.event_identity_document(b.id)) identity_reason
    from live a join live b on a.id<b.id
      and (a.city_id=b.city_id or ((a.city_id is null or b.city_id is null)
        and a.city_key<>'' and a.country_key<>'' and a.city_key=b.city_key and a.country_key=b.country_key))
      and b.start_date between a.start_date-interval '31 days' and coalesce(a.end_date,a.start_date)
      and coalesce(b.end_date,b.start_date)>=a.start_date
      and (a.start_date=b.start_date or (a.end_date-a.start_date between interval '20 hours' and interval '31 days'
        and b.end_date-b.start_date between interval '20 hours' and interval '31 days'))
      and a.tokens && b.tokens
  ) select id,bid,title,btitle,identity_reason in ('festival_identity_range','event_identity_instant'),
    case when identity_reason in ('festival_identity_range','event_identity_instant') then 0.96 else 0.84 end::numeric,
    identity_reason,null::double precision,
    -- A full umbrella wins over a shorter overview, followed by existing quality ranking.
    coalesce(quality_score,0) + least(31,greatest(0,extract(epoch from end_date-start_date)/86400))*1000,
    is_featured,created_at,
    coalesce(bquality,0) + least(31,greatest(0,extract(epoch from bend-bstart)/86400))*1000,
    bfeatured,bcreated
  from pairs where identity_reason is not null
$$;

-- Patch only the event candidate query, preserving all other entity rules and
-- the sweep's rejection history, merge cap, queue handling, and audited merge path.
do $patch$
declare target regprocedure; def text; start_at integer; end_at integer; old_query text; new_query text;
begin
  target := coalesce(to_regprocedure('api_private.run_dedup_truth_sweep(text,text,integer)'),
                     to_regprocedure('public.run_dedup_truth_sweep(text,text,integer)'));
  def := pg_get_functiondef(target);
  start_at := strpos(def,'when ''event'' then $q$')+length('when ''event'' then $q$');
  if start_at<=length('when ''event'' then $q$') then raise exception 'event sweep branch missing'; end if;
  end_at := strpos(substr(def,start_at),'$q$')+start_at-1;
  old_query := substr(def,start_at,end_at-start_at);
  if strpos(old_query,'api_private.event_identity_pairs()')>0 then return; end if;
  old_query := regexp_replace(old_query,'order by is_auto desc, conf desc limit 1200\s*$','','i');
  new_query := ' with identity_pairs as materialized (select * from api_private.event_identity_pairs()) '
    || ' select legacy.* from (' || old_query || ') legacy where not exists ('
    || 'select 1 from identity_pairs p where p.a_id=least(legacy.a_id,legacy.b_id) and p.b_id=greatest(legacy.a_id,legacy.b_id)) '
    || 'union all select * from identity_pairs order by is_auto desc,conf desc limit 1200 ';
  def := substr(def,1,start_at-1)||new_query||substr(def,end_at);
  -- Three or more copies generate stale pairs after the first successful merge.
  -- Classify those by state, as the existing venue path does, rather than reporting
  -- a successful chain collapse as an operational error.
  def := replace(def,
    'elsif v_first_error is null then',
    'elsif p_type = ''event'' and exists (select 1 from public.events where id in (v_keep,v_drop) and duplicate_of_id is not null) then
          v_chained := v_chained + 1;
        elsif v_first_error is null then');
  execute def;
end $patch$;

revoke all on function api_private.event_identity_conflicts(jsonb,jsonb) from public,anon,authenticated;
revoke all on function api_private.event_name_tokens(text,text,boolean) from public,anon,authenticated;
revoke all on function api_private.event_identity_reason(jsonb,jsonb) from public,anon,authenticated;
revoke all on function api_private.event_identity_document(uuid) from public,anon,authenticated;
revoke all on function api_private.event_identity_pairs() from public,anon,authenticated;
revoke all on function public.find_event_identity_candidates(text,timestamptz,uuid,text,numeric,numeric,text,integer,timestamptz,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function api_private.event_name_tokens(text,text,boolean), api_private.event_identity_reason(jsonb,jsonb),
  api_private.event_identity_document(uuid),api_private.event_identity_pairs(),api_private.event_identity_conflicts(jsonb,jsonb) to service_role;
grant execute on function public.find_event_identity_candidates(text,timestamptz,uuid,text,numeric,numeric,text,integer,timestamptz,uuid,text,uuid,text) to service_role;
notify pgrst,'reload schema';
;
