-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127094620 with no repo file — the signature of
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
-- Distinguish festival umbrellas from long-running ordinary event listings.
create or replace function api_private.event_identity_document(p_id uuid)
returns jsonb language sql stable set search_path = public,pg_temp as $$
  select jsonb_build_object('title',e.title,'city',e.city,'city_id',e.city_id,
    'country',e.country,'country_id',e.country_id,'start_date',e.start_date,'end_date',e.end_date,
    'event_type',e.event_type,'festival_id',e.festival_id,'venue_id',e.venue_id,'venue_name',e.venue_name,'edition',e.edition,'parent_event_id',e.parent_event_id,
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
  festival_like boolean; venue_conflict boolean;
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
    festival_like := coalesce(a->>'event_type' in ('pride','festival') or b->>'event_type' in ('pride','festival')
      or nullif(a->>'festival_id','') is not null or nullif(b->>'festival_id','') is not null
      or public.normalize_name(a->>'title') ~ '\m(festival|pride|carnival)\M|mardi gras'
      or public.normalize_name(b->>'title') ~ '\m(festival|pride|carnival)\M|mardi gras',false);
    venue_conflict := coalesce((nullif(a->>'venue_id','') is not null and nullif(b->>'venue_id','') is not null and a->>'venue_id'<>b->>'venue_id')
      or (nullif(public.normalize_name(a->>'venue_name'),'') is not null and nullif(public.normalize_name(b->>'venue_name'),'') is not null
          and public.normalize_name(a->>'venue_name')<>public.normalize_name(b->>'venue_name')),false);
    -- Recurring classes and venue offers can span weeks in imported calendars.
    -- Their date containment is not evidence of a shared festival identity.
    if not festival_like then return 'event_identity_review'; end if;
    if venue_conflict and not (a->>'event_type' in ('pride','festival') or b->>'event_type' in ('pride','festival'))
      and nullif(a->>'festival_id','') is null and nullif(b->>'festival_id','') is null then
      return 'event_identity_review';
    end if;
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


;
