-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127081626 with no repo file — the signature of
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
-- Compute name keys on content changes, rather than normalizing the entire
-- directory on every nightly sweep. Cache writes follow existing event permissions.
create table api_private.event_identity_keys (
  event_id uuid primary key references public.events(id) on delete cascade,
  short_tokens text[] not null,
  multi_tokens text[] not null,
  city_key text not null,
  country_key text not null
);
alter table api_private.event_identity_keys enable row level security;
revoke all on api_private.event_identity_keys from public,anon,authenticated;
grant select on api_private.event_identity_keys to service_role;

create function api_private.refresh_event_identity_keys() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into api_private.event_identity_keys(event_id,short_tokens,multi_tokens,city_key,country_key)
  values(new.id,api_private.event_name_tokens(new.title,new.city,false),
    api_private.event_name_tokens(new.title,new.city,true),public.normalize_name(new.city),public.normalize_name(new.country))
  on conflict(event_id) do update set short_tokens=excluded.short_tokens,multi_tokens=excluded.multi_tokens,
    city_key=excluded.city_key,country_key=excluded.country_key;
  return new;
end $$;
revoke all on function api_private.refresh_event_identity_keys() from public,anon,authenticated;
create trigger refresh_event_identity_keys after insert or update of title,city,country on public.events
for each row execute function api_private.refresh_event_identity_keys();

insert into api_private.event_identity_keys
select id,api_private.event_name_tokens(title,city,false),api_private.event_name_tokens(title,city,true),
  public.normalize_name(city),public.normalize_name(country) from public.events;

create or replace function api_private.event_identity_document(p_id uuid)
returns jsonb language sql stable set search_path = public,pg_temp as $$
  select jsonb_build_object('title',e.title,'city',e.city,'city_id',e.city_id,
    'country',e.country,'country_id',e.country_id,'start_date',e.start_date,'end_date',e.end_date,
    'venue_id',e.venue_id,'venue_name',e.venue_name,'edition',e.edition,'parent_event_id',e.parent_event_id,
    'tokens_short',k.short_tokens,'tokens_multi',k.multi_tokens,
    'identity_keys_short',jsonb_build_array(to_jsonb(k.short_tokens)) || coalesce(aliases.ks,'[]'::jsonb),
    'identity_keys_multi',jsonb_build_array(to_jsonb(k.multi_tokens)) || coalesce(aliases.km,'[]'::jsonb))
  from public.events e join api_private.event_identity_keys k on k.event_id=e.id
  left join lateral (
    select jsonb_agg(distinct to_jsonb(dk.short_tokens)) ks,jsonb_agg(distinct to_jsonb(dk.multi_tokens)) km
    from public.events d join api_private.event_identity_keys dk on dk.event_id=d.id
    where d.duplicate_of_id=e.id and d.city_id is not distinct from e.city_id
      and d.start_date between e.start_date-interval '31 days' and coalesce(e.end_date,e.start_date)+interval '1 day'
  ) aliases on true
  where e.id=p_id
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
  keys_a jsonb; keys_b jsonb; ka text[]; kb text[]; ya text[]; yb text[]; ca text[]; cb text[];
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
  ca := case when a ? 'tokens_short' then array(select jsonb_array_elements_text(a->case when multi then 'tokens_multi' else 'tokens_short' end))
    else api_private.event_name_tokens(a->>'title',a->>'city',multi) end;
  cb := case when b ? 'tokens_short' then array(select jsonb_array_elements_text(b->case when multi then 'tokens_multi' else 'tokens_short' end))
    else api_private.event_name_tokens(b->>'title',b->>'city',multi) end;
  keys_a := a->case when multi then 'identity_keys_multi' else 'identity_keys_short' end;
  keys_b := b->case when multi then 'identity_keys_multi' else 'identity_keys_short' end;
  if keys_a is null then
    select jsonb_agg(to_jsonb(api_private.event_name_tokens(t,a->>'city',multi))) into keys_a
      from (select a->>'title' t union select jsonb_array_elements_text(coalesce(a->'aliases','[]'))) titles;
  end if;
  if keys_b is null then
    select jsonb_agg(to_jsonb(api_private.event_name_tokens(t,b->>'city',multi))) into keys_b
      from (select b->>'title' t union select jsonb_array_elements_text(coalesce(b->'aliases','[]'))) titles;
  end if;
  for ka in select array(select jsonb_array_elements_text(k)) from jsonb_array_elements(keys_a) k loop
    for kb in select array(select jsonb_array_elements_text(k)) from jsonb_array_elements(keys_b) k loop
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


-- Bound the nightly comparison to actual shared calendar days and places.
create or replace function api_private.event_identity_pairs()
returns table(a_id uuid,b_id uuid,a_title text,b_title text,is_auto boolean,conf numeric,
  reason text,dm double precision,aq numeric,af boolean,ac timestamptz,bq numeric,bf boolean,bc timestamptz)
language sql stable set search_path = public, extensions, pg_temp as $$
  with live as materialized (
    select e.id,e.title,e.start_date,e.end_date,e.city_id,e.quality_score,e.is_featured,e.created_at,
      k.city_key,k.country_key,
      case when e.end_date-e.start_date between interval '20 hours' and interval '31 days' then k.multi_tokens else k.short_tokens end tokens
    from public.events e join api_private.event_identity_keys k on k.event_id=e.id where e.duplicate_of_id is null and coalesce(e.status,'')<>'archived'
      and e.parent_event_id is null
  ), blocks as materialized (
    -- Hashable place+calendar-day blocks avoid a global interval/OR self join.
    select l.id,place.key,((l.start_date at time zone 'UTC')::date+n) occurrence_day
    from live l
    cross join lateral (values
      ('id:'||l.city_id::text),
      (case when l.city_key<>'' and l.country_key<>'' then 'text:'||l.country_key||':'||l.city_key end)
    ) place(key)
    cross join generate_series(0,31) n
    where place.key is not null and n <= case
      when l.end_date-l.start_date between interval '20 hours' and interval '31 days'
      then (l.end_date at time zone 'UTC')::date-(l.start_date at time zone 'UTC')::date
      else 0 end
  ), pair_ids as materialized (
    select distinct a.id aid,b.id bid from blocks a join blocks b
      on a.key=b.key and a.occurrence_day=b.occurrence_day and a.id<b.id
  ), lefts as materialized (
    -- Keep the join to ids ahead of the expensive interval/token filters.
    select a.*,p.bid right_id from pair_ids p join live a on a.id=p.aid
  ), pairs as materialized (
    select a.*, b.id bid,b.title btitle,b.quality_score bquality,b.is_featured bfeatured,b.created_at bcreated,
      b.start_date bstart,b.end_date bend,
      api_private.event_identity_reason(api_private.event_identity_document(a.id),api_private.event_identity_document(b.id)) identity_reason
    from lefts a join live b on b.id=a.right_id
    where true
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


analyze api_private.event_identity_keys;
;
