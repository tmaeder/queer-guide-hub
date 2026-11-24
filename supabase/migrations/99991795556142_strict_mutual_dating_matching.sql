-- Approved strict mutual matching. No automatic widening and no inferred attraction.
-- The private schema is intentionally absent from the PostgREST exposed schemas.
create schema if not exists dating_private;
revoke all on schema dating_private from public, anon;
grant usage on schema dating_private to authenticated, service_role;

-- Some deployed schemas lost this field during the dating-data move. Keep the
-- existing onboarding and the canonical activity-boundary contract consistent.
alter table public.intimate_profiles add column if not exists limits text[] default '{}';


-- Live schema: intimate_profiles.id is auth.uid(); likes/passes use profiles.id.
create function dating_private.profile_id_for_uid(p_uid uuid) returns uuid language sql stable security definer set search_path=pg_catalog as $$ select id from public.profiles where user_id=p_uid $$;
create function dating_private.profile_uid_for_id(p_id uuid) returns uuid language sql stable security definer set search_path=pg_catalog as $$ select user_id from public.profiles where id=p_id $$;
create function dating_private.intimate_eligible(p_uid uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select coalesce((select opted_in_at is not null and consent_18plus_at is not null and moderation_status='approved' from public.intimate_profiles where id=p_uid),false)
$$;
create function dating_private.shielded(p_uid uuid) returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
declare result boolean:=false;
begin
  if to_regclass('public.user_discovery_safety_state') is not null then
    execute 'select exists(select 1 from public.user_discovery_safety_state where user_id=$1 and shield_status=''active'')' into result using p_uid;
    if result then return true; end if;
  end if;
  if to_regclass('public.user_presence_location') is not null then
    execute 'select exists(select 1 from public.user_presence_location where user_id=$1 and expires_at>now() and is_high_risk and (not dating_visible or visibility=''off''))' into result using p_uid;
  end if;
  return coalesce(result,false);
end $$;
create function dating_private.hidden_test_account(p_uid uuid) returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
declare result boolean:=false;
begin
  if to_regprocedure('api_private.test_account_hidden(uuid)') is not null then execute 'select api_private.test_account_hidden($1)' into result using p_uid; end if;
  return result;
end $$;

create function dating_private.valid_rules(p_rules jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare k text; r jsonb; v jsonb; allowed text[];
begin
  if jsonb_typeof(p_rules) is distinct from 'object' or pg_column_size(p_rules)>16000 then return false; end if;
  for k,r in select * from jsonb_each(p_rules) loop
    if k not in ('genders','age_bands','relationship_styles','relationship_statuses','goals','positions','dynamics','activities','protection','practices','body_types','genitalia')
      or jsonb_typeof(r) is distinct from 'object'
      or coalesce(r->>'strength','') not in ('any','preferred','required')
      or jsonb_typeof(r->'values') is distinct from 'array' then return false; end if;
    if jsonb_array_length(r->'values')>64 or (r->>'strength'<>'any' and jsonb_array_length(r->'values')=0) then return false; end if;
    allowed:=case k
      when 'genders' then array['woman','man','non_binary','genderfluid','agender','bigender','genderqueer','demigender','two_spirit','questioning','other']
      when 'age_bands' then array['18','19-20','21-24','25-29','30-34','35-39','40-49','50-59','60-69','70+']
      when 'relationship_styles' then array['monogamous','polyamorous','relationship_anarchist','open_relationship','swinging','exploring']
      when 'relationship_statuses' then array['single','taken','its_complicated','open_to_explore']
      when 'goals' then array['dates','relationship','casual','queerplatonic','friendship','chosen_family']
      when 'positions' then array['top','bottom','vers','vers-top','vers-bottom','side']
      when 'dynamics' then array['dom','sub','switch']
      when 'activities' then array['oral','anal','kissing','fisting','rimming','toys','roleplay','public','group','cuddling','massage','sensual','rough','bondage','spanking','leather','rubber','edging','tantra','tickling']
      when 'protection' then array['condoms_always']
      when 'practices' then array['ask_before_touch','text_first','slow_pace','step_free_meetup','quiet_meetup','discreet_contact','no_public_photos']
      when 'body_types' then array['slim','average','athletic','muscular','bear','chub','twink','otter']
      when 'genitalia' then array['penis','vagina','intersex'] end;
    for v in select * from jsonb_array_elements(r->'values') loop
      if jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 80
        or not ((v#>>'{}')=any(allowed)) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

create table public.dating_matching_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dating_enabled boolean not null default false,
  adult_consent_at timestamptz,
  active_until timestamptz,
  connection_goals text[] not null default '{}',
  offered_practices text[] not null default '{}',
  rules jsonb not null default '{}' check(dating_private.valid_rules(rules)),
  distance_strength text not null default 'any' check(distance_strength in('any','preferred','required')),
  max_distance_km int check(max_distance_km between 1 and 20000),
  height_strength text not null default 'any' check(height_strength in('any','preferred','required')),
  min_height_cm int check(min_height_cm between 50 and 300),
  max_height_cm int check(max_height_cm between 50 and 300),
  use_identity boolean not null default false,
  use_interests boolean not null default false,
  use_intimate boolean not null default false,
  use_checklist boolean not null default false,
  use_hanky boolean not null default false,
  use_culture boolean not null default false,
  updated_at timestamptz not null default now(),
  check(not dating_enabled or adult_consent_at is not null),
  check(distance_strength='any' or max_distance_km is not null),
  check(height_strength='any' or min_height_cm is not null or max_height_cm is not null),
  check(min_height_cm is null or max_height_cm is null or min_height_cm<=max_height_cm),
  check(connection_goals <@ array['dates','relationship','casual','queerplatonic','friendship','chosen_family']::text[]),
  check(offered_practices <@ array['ask_before_touch','text_first','slow_pace','step_free_meetup','quiet_meetup','discreet_contact','no_public_photos']::text[])
);
alter table public.dating_matching_settings enable row level security;
create policy dating_matching_self on public.dating_matching_settings for all to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.dating_matching_settings from public,anon,authenticated;
grant select,insert,update on public.dating_matching_settings to authenticated;
grant all on public.dating_matching_settings to service_role;
create index dating_matching_enabled_idx on public.dating_matching_settings(user_id) where dating_enabled;

-- All helpers accept auth user ids. Never mix profiles.id and profiles.user_id.
create function dating_private.discoverable(p_uid uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce((
    select p.moderation_status='approved'
      and (p.date_of_birth is null or p.date_of_birth<=current_date-interval '18 years')
      and not dating_private.shielded(p_uid)
      and case when ms.user_id is not null then
        ms.dating_enabled and ms.adult_consent_at is not null and (ms.active_until is null or ms.active_until>now())
      else dating_private.intimate_eligible(p_uid) and (ip.discovery_active_until is null or ip.discovery_active_until>now()) end
    from public.profiles p left join public.dating_matching_settings ms on ms.user_id=p.user_id
    left join public.intimate_profiles ip on ip.id=p.user_id where p.user_id=p_uid
  ),false)
$$;

create function dating_private.array_text(p_json jsonb)
returns text[] language sql immutable set search_path=pg_catalog as $$
  select coalesce(array_agg(distinct value),'{}') from jsonb_array_elements_text(
    case when jsonb_typeof(p_json)='array' then p_json else '[]'::jsonb end)
  where value not in('','prefer_not_to_say','not_answered')
$$;

create function dating_private.travel_city(p_travel jsonb)
returns uuid language plpgsql stable set search_path=pg_catalog as $$
begin
  if p_travel->>'until' is not null and (p_travel->>'until')::timestamptz<=now() then return null; end if;
  return (p_travel->>'city_id')::uuid;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return null;
end $$;

create function dating_private.facts(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p jsonb; ip jsonb; s public.dating_matching_settings; a int; band text; city uuid;
  activities text[]:='{}'; boundaries text[]:='{}'; checklist_yes text[]; checklist_no text[];
begin
  select to_jsonb(pr) into p from public.profiles pr where user_id=p_uid;
  select * into s from public.dating_matching_settings where user_id=p_uid;
  if s.user_id is null then s.use_intimate:=true; end if;
  select to_jsonb(i) into ip from public.intimate_profiles i where id=p_uid
    and dating_private.intimate_eligible(p_uid) and (i.discovery_active_until is null or i.discovery_active_until>now());
  if s.use_intimate then
    activities:=dating_private.array_text(ip->'into_tags');
    boundaries:=dating_private.array_text(ip->'limits');
  end if;
  if s.use_checklist then
    select array_agg(distinct coalesce(replace(ki.unified_tag_slug,'intimate-',''),ki.slug)) filter(where kr.rating in('favorite','like')),
      array_agg(distinct coalesce(replace(ki.unified_tag_slug,'intimate-',''),ki.slug)) filter(where kr.rating in('no','hard_limit'))
    into checklist_yes,checklist_no
    from public.kink_ratings kr join public.kink_items ki on ki.id=kr.item_id and ki.is_active where kr.user_id=p_uid;
    activities:=activities||coalesce(checklist_yes,'{}');
    boundaries:=boundaries||coalesce(checklist_no,'{}');
  end if;
  activities:=array(select unnest(activities) except select unnest(boundaries));
  if p->>'date_of_birth' is not null then
    a:=extract(year from age(current_date,(p->>'date_of_birth')::date));
    band:=case when a=18 then '18' when a<=20 then '19-20' when a<=24 then '21-24' when a<=29 then '25-29'
      when a<=34 then '30-34' when a<=39 then '35-39' when a<=49 then '40-49' when a<=59 then '50-59'
      when a<=69 then '60-69' else '70+' end;
  else band:=ip->>'age_band'; end if;
  -- A matching location is a voluntarily selected discovery/travel city, never GPS.
  city:=coalesce((ip->>'discovery_city_id')::uuid,
    dating_private.travel_city(p->'travel_mode'),
    (select home_city_id from public.user_travel_preferences where user_id=p_uid));
  return jsonb_build_object(
    'genders',case when s.use_identity then to_jsonb(array[case p->>'gender_identity'
      when 'transgender_man' then 'man' when 'transgender_woman' then 'woman' else nullif(p->>'gender_identity','prefer_not_to_say') end]) else '[]'::jsonb end,
    'age_bands',to_jsonb(array[band]),
    'relationship_styles',case when s.use_identity then to_jsonb(array[nullif(p->>'relationship_style','prefer_not_to_say')]) else '[]'::jsonb end,
    'relationship_statuses',case when s.use_identity then to_jsonb(array[nullif(p->>'current_relationship_status','prefer_not_to_say')]) else '[]'::jsonb end,
    'goals',to_jsonb(coalesce(nullif(s.connection_goals,'{}'),case when s.use_identity then
      array(select case value when 'dating' then 'dates' when 'friends' then 'friendship' else value end
        from unnest(dating_private.array_text(p->'looking_for')) value where value in('dating','friends','dates','relationship','casual','queerplatonic','friendship','chosen_family')) end,'{}')),
    'practices',to_jsonb(coalesce(s.offered_practices,'{}')),
    'positions',case when s.use_intimate then coalesce(ip->'role','[]') else '[]'::jsonb end,
    'dynamics',case when s.use_intimate then coalesce(ip->'role','[]') else '[]'::jsonb end,
    'activities',to_jsonb(activities),
    'limits',to_jsonb(boundaries),
    'protection',case when s.use_intimate then coalesce(ip->'safer_sex_prefs','[]') else '[]'::jsonb end,
    'body_types',case when s.use_intimate then to_jsonb(array[ip->>'body_type']) else '[]'::jsonb end,
    'genitalia',case when s.use_intimate then to_jsonb(array[nullif(ip->>'genitalia','prefer_not_to_say')]) else '[]'::jsonb end,
    'height_cm',case when s.use_intimate then ip->'height_cm' end,
    'city_id',city
  );
end $$;

create function dating_private.distance_km(p_a jsonb,p_b jsonb)
returns double precision language sql stable security definer set search_path=pg_catalog,public as $$
  select case when a.id=b.id then 0 else
    6371*2*asin(sqrt(least(1::double precision,
      power(sin(radians((b.latitude-a.latitude)::double precision)/2),2)
      +cos(radians(a.latitude::double precision))*cos(radians(b.latitude::double precision))
       *power(sin(radians((b.longitude-a.longitude)::double precision)/2),2)))) end
  from public.cities a,public.cities b where a.id=(p_a->>'city_id')::uuid and b.id=(p_b->>'city_id')::uuid
    and a.latitude is not null and a.longitude is not null and b.latitude is not null and b.longitude is not null
$$;

create function dating_private.rule_satisfied(p_key text,p_rule jsonb,p_facts jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $$
  select case when p_key in('activities','protection','practices') then
      dating_private.array_text(p_rule->'values') <@ dating_private.array_text(p_facts->p_key)
      and (p_key<>'activities' or not (dating_private.array_text(p_rule->'values') && dating_private.array_text(p_facts->'limits')))
    else dating_private.array_text(p_rule->'values') && dating_private.array_text(p_facts->p_key) end
$$;

create function dating_private.direction_ok(p_owner uuid,p_other uuid,p_self jsonb,p_facts jsonb)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.dating_matching_settings; k text; r jsonb; required_activities text[]; seeking jsonb; bands text[]:=array['18','19-20','21-24','25-29','30-34','35-39','40-49','50-59','60-69','70+']; lo int; hi int; candidate_age int;
begin
  select * into s from public.dating_matching_settings where user_id=p_owner;

  -- Saved seeking preferences already exist in production: keep them strict in
  -- both directions, even when a caller clears temporary discovery filters.
  select coalesce(nullif(ip.dating_prefs->'seeking','null'::jsonb),'{}'::jsonb) into seeking from public.intimate_profiles ip where id=p_owner;
  seeking:=coalesce(seeking,'{}'::jsonb);
  foreach k in array array['roles','body_types','genitalia'] loop
    if cardinality(dating_private.array_text(seeking->k))>0 then
      if not dating_private.rule_satisfied(case k when 'roles' then 'positions' else k end,
        jsonb_build_object('values',seeking->k),p_facts) then return false; end if;
    end if;
  end loop;
  if seeking->>'age_min' is not null or seeking->>'age_max' is not null then
    lo:=case when seeking->>'age_min' is null then 1 else array_position(bands,seeking->>'age_min') end;
    hi:=case when seeking->>'age_max' is null then cardinality(bands) else array_position(bands,seeking->>'age_max') end;
    candidate_age:=array_position(bands,p_facts->'age_bands'->>0);
    if lo is null or hi is null or candidate_age is null or candidate_age<lo or candidate_age>hi then return false; end if;
  end if;
  if jsonb_typeof(seeking->'hanky')='object' and seeking->'hanky'<>'{}'::jsonb then
    if not dating_private.intimate_eligible(p_owner) or not dating_private.intimate_eligible(p_other)
      or not exists(select 1 from jsonb_each_text(seeking->'hanky') want
        join public.user_hanky_signals h on h.variant_id::text=want.key and h.user_id=p_other and h.revoked_at is null
        where h.visibility in('members_adult','public_adult') and (h.side=want.value or h.side='both' or want.value='both')) then return false; end if;
  end if;

  for k,r in select * from jsonb_each(coalesce(s.rules,'{}')) loop
    if r->>'strength'='required' and not dating_private.rule_satisfied(k,r,p_facts) then return false; end if;
  end loop;
  if s.distance_strength='required' and coalesce(dating_private.distance_km(p_self,p_facts)<=s.max_distance_km,false)=false then return false; end if;
  if s.height_strength='required' and (
    p_facts->>'height_cm' is null
    or (s.min_height_cm is not null and (p_facts->>'height_cm')::int<s.min_height_cm)
    or (s.max_height_cm is not null and (p_facts->>'height_cm')::int>s.max_height_cm)) then return false; end if;
  -- A person's own boundary overrides even their contradictory required activity.
  required_activities:=case when s.rules->'activities'->>'strength'='required'
    then dating_private.array_text(s.rules->'activities'->'values') else '{}'::text[] end;
  if required_activities && dating_private.array_text(p_self->'limits') then return false; end if;
  if s.use_checklist and exists(select 1 from public.dating_matching_settings where user_id=p_other and use_checklist) then
    if exists(select 1 from public.kink_ratings kr join public.kink_items ki on ki.id=kr.item_id
      where kr.user_id in(p_owner,p_other) and kr.rating in('no','hard_limit')
        and coalesce(replace(ki.unified_tag_slug,'intimate-',''),ki.slug)=any(required_activities)) then return false; end if;
  end if;
  return true;
end $$;

create function dating_private.pair_ok(p_a uuid,p_b uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare a jsonb; b jsonb;
begin
  if p_a is null or p_b is null or p_a=p_b or not dating_private.discoverable(p_a)
    or not dating_private.discoverable(p_b) or public.is_blocked(p_a,p_b) or dating_private.hidden_test_account(p_a) or dating_private.hidden_test_account(p_b) then return false; end if;
  -- Overall profile visibility remains authoritative in both directions.
  if exists(select 1 from public.profiles p where p.user_id in(p_a,p_b)
    and not (coalesce(p.privacy_settings->>'profile_visibility','public') in('public','community')
      or (p.privacy_settings->>'profile_visibility'='friends' and exists(
        select 1 from public.user_relationships r where r.relationship_type='friend' and r.status='accepted'
          and ((r.user_id=p_a and r.target_user_id=p_b) or(r.user_id=p_b and r.target_user_id=p_a)))))) then return false; end if;
  a:=dating_private.facts(p_a); b:=dating_private.facts(p_b);
  if cardinality(dating_private.array_text(a->'goals'))>0 and cardinality(dating_private.array_text(b->'goals'))>0
    and not (dating_private.array_text(a->'goals')&&dating_private.array_text(b->'goals')) then return false; end if;
  return dating_private.direction_ok(p_a,p_b,a,b) and dating_private.direction_ok(p_b,p_a,b,a);
end $$;

create function public.dating_pair_eligible(p_candidate uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select auth.uid() is not null and dating_private.pair_ok(auth.uid(),p_candidate)
$$;

create function dating_private.intimate_visible(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select dating_private.intimate_eligible(p_a) and dating_private.intimate_eligible(p_b)
    and exists(select 1 from public.intimate_profiles ip where ip.id=p_a and (ip.discovery_active_until is null or ip.discovery_active_until>now()))
    and exists(select 1 from public.intimate_profiles ip where ip.id=p_b and (ip.discovery_active_until is null or ip.discovery_active_until>now()))
$$;

create function dating_private.solo_ok(p_a uuid,p_b uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
declare joint_only boolean:=false;
begin
  if not dating_private.pair_ok(p_a,p_b) then return false; end if;
  if to_regclass('public.couple_link_members') is not null and to_regclass('public.couple_links') is not null then
    execute 'select exists(select 1 from public.couple_link_members m join public.couple_links l on l.id=m.couple_link_id where m.user_id in($1,$2) and m.discovery_mode=''joint_only'' and m.joint_discovery_enabled and l.status=''accepted'' and l.revoked_at is null)' into joint_only using p_a,p_b;
  end if;
  return not joint_only;
end $$;

create or replace function public.dating_pair_eligible(p_candidate uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select auth.uid() is not null and dating_private.solo_ok(auth.uid(),p_candidate)
$$;

create function public.dating_intimate_pair_eligible(p_candidate uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select auth.uid() is not null and dating_private.solo_ok(auth.uid(),p_candidate)
    and dating_private.intimate_visible(auth.uid(),p_candidate)
$$;

create function dating_private.rank_pair(p_a uuid,p_b uuid)
returns int language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare sa public.dating_matching_settings; sb public.dating_matching_settings; a jsonb; b jsonb;
  n int:=0; k text; r jsonb;
begin
  a:=dating_private.facts(p_a); b:=dating_private.facts(p_b);
  select * into sa from public.dating_matching_settings where user_id=p_a;
  select * into sb from public.dating_matching_settings where user_id=p_b;
  for k,r in select * from jsonb_each(coalesce(sa.rules,'{}')) loop
    if r->>'strength'='preferred' and dating_private.rule_satisfied(k,r,b) then n:=n+4; end if;
  end loop;
  for k,r in select * from jsonb_each(coalesce(sb.rules,'{}')) loop
    if r->>'strength'='preferred' and dating_private.rule_satisfied(k,r,a) then n:=n+4; end if;
  end loop;
  if dating_private.array_text(a->'goals') && dating_private.array_text(b->'goals') then n:=n+20; end if;
  if sa.distance_strength='preferred' and dating_private.distance_km(a,b)<=sa.max_distance_km then n:=n+4; end if;
  if sb.distance_strength='preferred' and dating_private.distance_km(a,b)<=sb.max_distance_km then n:=n+4; end if;
  if sa.height_strength='preferred' and b->>'height_cm' is not null and (sa.min_height_cm is null or (b->>'height_cm')::int>=sa.min_height_cm) and (sa.max_height_cm is null or (b->>'height_cm')::int<=sa.max_height_cm) then n:=n+4; end if;
  if sb.height_strength='preferred' and a->>'height_cm' is not null and (sb.min_height_cm is null or (a->>'height_cm')::int>=sb.min_height_cm) and (sb.max_height_cm is null or (a->>'height_cm')::int<=sb.max_height_cm) then n:=n+4; end if;
  -- Shared general interests are a small contextual signal, never identity sameness.
  if sa.use_interests and sb.use_interests then
    select n+least(cardinality(array(select unnest(dating_private.array_text(pa.interests)||coalesce(pa.hobbies,'{}')) intersect select unnest(dating_private.array_text(pb.interests)||coalesce(pb.hobbies,'{}'))))*2,10)
      into n from public.profiles pa,public.profiles pb where pa.user_id=p_a and pb.user_id=p_b;
  end if;
  if sa.use_intimate and sb.use_intimate then
    if exists(select 1 from unnest(dating_private.array_text(a->'positions')) x,unnest(dating_private.array_text(b->'positions')) y
      where (x in('top','vers-top') and y in('bottom','vers-bottom','vers')) or (y in('top','vers-top') and x in('bottom','vers-bottom','vers')) or (x='vers' and y in('top','bottom','vers','vers-top','vers-bottom')) or (x='side' and y='side')) then n:=n+4; end if;
    if exists(select 1 from unnest(dating_private.array_text(a->'dynamics')) x,unnest(dating_private.array_text(b->'dynamics')) y
      where (x='dom' and y in('sub','switch')) or (x='sub' and y in('dom','switch')) or (x='switch' and y in('dom','sub','switch'))) then n:=n+4; end if;
    n:=n+least(cardinality(array(select unnest(dating_private.array_text(a->'activities')) intersect select unnest(dating_private.array_text(b->'activities')) except select unnest(dating_private.array_text(a->'limits')||dating_private.array_text(b->'limits'))))*2,8);
  end if;
  if sa.use_checklist and sb.use_checklist then
    -- Visibility tiers do NOT imply matching consent. Score only explicitly enabled inputs.
    select n+least(count(distinct ka.item_id)::int*2,8) into n
    from public.kink_ratings ka join public.kink_ratings kb on kb.item_id=ka.item_id
    join public.kink_items ki on ki.id=ka.item_id and ki.is_active
    where ka.user_id=p_a and kb.user_id=p_b and ka.rating in('favorite','like') and kb.rating in('favorite','like')
      and not exists(select 1 from public.kink_ratings veto where veto.user_id in(p_a,p_b) and veto.item_id=ka.item_id and veto.rating in('no','hard_limit'))
      and ((ka.side='general' and kb.side='general') or (ka.side='giving' and kb.side='receiving') or (ka.side='receiving' and kb.side='giving')
        or (ka.side='dominant' and kb.side='submissive') or (ka.side='submissive' and kb.side='dominant') or (ka.side='self' and kb.side='partner') or (ka.side='partner' and kb.side='self'));
  end if;
  if sa.use_hanky and sb.use_hanky and exists(
    select 1 from public.user_hanky_signals ha join public.user_hanky_signals hb on hb.variant_id=ha.variant_id
    join public.cultural_variants cv on cv.id=ha.variant_id and cv.status='published'
    where ha.user_id=p_a and hb.user_id=p_b and ha.revoked_at is null and hb.revoked_at is null
      and (ha.side='both' or hb.side='both' or ha.side<>hb.side)) then n:=n+2; end if;
  if sa.use_culture and sb.use_culture and exists(
    select 1 from public.user_cultural_preferences ca,public.user_cultural_preferences cb
    where ca.user_id=p_a and cb.user_id=p_b and (ca.line_node_ids&&cb.line_node_ids or ca.followed_node_ids&&cb.followed_node_ids)) then n:=n+2; end if;
  if sa.use_culture and sb.use_culture and exists(select 1 from public.profiles pa,public.profiles pb
    where pa.user_id=p_a and pb.user_id=p_b and pa.identity_flags&&pb.identity_flags) then n:=n+1; end if;
  return coalesce(n,0);
end $$;

-- A single result set owns eligibility, request filters, ordering and pagination.
create function public.dating_discovery(p_filters jsonb default '{}',p_limit int default 200)
returns table(user_id uuid,display_name text,avatar_url text,discovery_city_id uuid,role text[],into_tags text[],body_type text,age_band text,height_cm smallint,last_active_at timestamptz,score int,shared jsonb)
language sql stable security definer set search_path=pg_catalog,public as $$
  select p.user_id,p.display_name,p.avatar_url,
    case when dating_private.intimate_visible(auth.uid(),p.user_id) then ip.discovery_city_id end,
    case when dating_private.intimate_visible(auth.uid(),p.user_id) then ip.role else '{}' end,
    case when dating_private.intimate_visible(auth.uid(),p.user_id) then ip.into_tags else '{}' end,
    case when dating_private.intimate_visible(auth.uid(),p.user_id) then ip.body_type end,
    case when dating_private.intimate_visible(auth.uid(),p.user_id) then ip.age_band else p.age_range end,
    case when dating_private.intimate_visible(auth.uid(),p.user_id) then ip.height_cm end,
    p.last_active_at,0,jsonb_build_object('requirements_met',true)
  from public.profiles p left join public.intimate_profiles ip on ip.id=p.user_id
  left join public.dating_matching_settings ms on ms.user_id=p.user_id
  cross join lateral (select dating_private.facts(p.user_id) data) f
  where auth.uid() is not null and dating_private.solo_ok(auth.uid(),p.user_id)
    and not exists(select 1 from public.intimate_passes passes where passes.actor_id=dating_private.profile_id_for_uid(auth.uid()) and passes.target_id=p.id)
    and (p_filters->>'cityId' is null or f.data->>'city_id'=p_filters->>'cityId')
    and (coalesce(jsonb_array_length(p_filters->'roles'),0)=0 or dating_private.array_text(p_filters->'roles')&&dating_private.array_text(f.data->'positions'))
    and (coalesce(jsonb_array_length(p_filters->'intoTags'),0)=0 or dating_private.array_text(p_filters->'intoTags')<@dating_private.array_text(f.data->'activities'))
    and (coalesce(jsonb_array_length(p_filters->'ageBands'),0)=0 or dating_private.array_text(p_filters->'ageBands')&&dating_private.array_text(f.data->'age_bands'))
    and (coalesce(jsonb_array_length(p_filters->'bodyTypes'),0)=0 or dating_private.array_text(p_filters->'bodyTypes')&&dating_private.array_text(f.data->'body_types'))

    and (coalesce(jsonb_array_length(p_filters->'genitalia'),0)=0 or dating_private.array_text(p_filters->'genitalia')&&dating_private.array_text(f.data->'genitalia'))
    and (coalesce(jsonb_array_length(p_filters->'kinkItemSlugs'),0)=0 or exists(
      select 1 from public.kink_ratings kr join public.kink_items ki on ki.id=kr.item_id and ki.is_active
      join public.kink_category_visibility kv on kv.user_id=kr.user_id and kv.category_id=ki.category_id
      where kr.user_id=p.user_id and ki.slug=any(dating_private.array_text(p_filters->'kinkItemSlugs'))
        and kr.rating in('favorite','like','curious','maybe') and kv.tier in('members','matches')
        and (ms.user_id is null or ms.use_checklist)
        and not exists(select 1 from public.kink_ratings veto where veto.user_id=kr.user_id and veto.item_id=kr.item_id and veto.rating in('no','hard_limit'))))
    and (coalesce(p_filters->'hanky','{}'::jsonb)='{}'::jsonb or exists(
      select 1 from jsonb_each_text(p_filters->'hanky') want join public.user_hanky_signals h on h.variant_id::text=want.key
      where h.user_id=p.user_id and h.revoked_at is null and h.visibility in('members_adult','public_adult')
        and dating_private.intimate_visible(auth.uid(),p.user_id)
        and (h.side=want.value or h.side='both' or want.value='both')))

  order by dating_private.rank_pair(auth.uid(),p.user_id) desc,p.last_active_at desc nulls last,p.user_id
  limit greatest(1,least(coalesce(p_limit,200),200))
$$;

-- Keep non-dating modes intact, but make dating use the authoritative query.
alter function public.people_discovery(uuid,text,uuid,uuid,uuid,int,int) rename to people_discovery_before_strict_matching;
revoke all on function public.people_discovery_before_strict_matching(uuid,text,uuid,uuid,uuid,int,int) from public,anon,authenticated;
create function public.people_discovery(p_viewer uuid,p_mode text,p_city_id uuid default null,p_event_id uuid default null,p_trip_id uuid default null,p_limit int default 60,p_radius_m int default 5000)
returns table(user_id uuid,score int,shared jsonb) language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null or p_viewer is distinct from auth.uid() then return; end if;
  if p_mode='dating' then
    return query select d.user_id,d.score,d.shared from public.dating_discovery(jsonb_strip_nulls(jsonb_build_object('cityId',p_city_id)),p_limit) d;
  else
    return query select d.user_id,d.score,d.shared from public.people_discovery_before_strict_matching(p_viewer,p_mode,p_city_id,p_event_id,p_trip_id,p_limit,p_radius_m) d;
  end if;
end $$;

create function public.dating_profile(p_candidate uuid)
returns table(user_id uuid,display_name text,avatar_url text,age_band text,intimate_visible boolean)
language sql stable security definer set search_path=pg_catalog,public as $$
  select p.user_id,p.display_name,p.avatar_url,p.age_range,
    dating_private.intimate_visible(auth.uid(),p_candidate)
  from public.profiles p where p.user_id=p_candidate and auth.uid() is not null and (dating_private.solo_ok(auth.uid(),p_candidate) or (p_candidate=auth.uid() and (exists(select 1 from public.dating_matching_settings ms where ms.user_id=auth.uid() and ms.dating_enabled) or exists(select 1 from public.intimate_profiles ip where ip.id=auth.uid() and ip.opted_in_at is not null))))
$$;

-- The raw view and direct detail table cannot bypass the same requirements.
create or replace view public.intimate_discovery_v with(security_invoker=on) as
select p.user_id,p.display_name,p.avatar_url,ip.discovery_city_id,ip.role,ip.into_tags,ip.body_type,ip.age_band,ip.height_cm,ip.last_active_at
from public.intimate_profiles ip join public.profiles p on p.user_id=ip.id
where ip.opted_in_at is not null and ip.moderation_status='approved'
  and (ip.discovery_active_until is null or ip.discovery_active_until>now())
  and public.dating_intimate_pair_eligible(p.user_id);

-- Restrictive policy applies alongside ALL existing permissive read policies.
create policy intimate_mutual_requirements on public.intimate_profiles as restrictive for select to authenticated
  using(id=(select auth.uid()) or
    ((discovery_active_until is null or discovery_active_until>now()) and consent_18plus_at is not null
      and public.dating_intimate_pair_eligible(id)));

create or replace function public.intimate_like(p_target_user_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=dating_private.profile_id_for_uid(auth.uid()); target uuid:=dating_private.profile_id_for_uid(p_target_user_id);
begin
  if auth.uid() is null or not dating_private.solo_ok(auth.uid(),p_target_user_id) then return jsonb_build_object('ok',false,'error',jsonb_build_object('code','REQUIREMENTS_NOT_MET','message','This profile is no longer available under your mutual requirements.')); end if;
  -- The unique pair makes repeated likes idempotent. Lock both directions in
  -- one order so simultaneous reciprocal likes cannot miss the match trigger.
  perform pg_advisory_xact_lock(hashtextextended(least(auth.uid(),p_target_user_id)::text||greatest(auth.uid(),p_target_user_id)::text,0));
  delete from public.intimate_passes where actor_id=actor and target_id=target;
  insert into public.intimate_likes(actor_id,target_id) values(actor,target) on conflict do nothing;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('target_user_id',p_target_user_id));
end $$;

create function public.dating_my_likes() returns table(target_user_id uuid) language sql stable security definer set search_path=pg_catalog as $$
  select dating_private.profile_uid_for_id(target_id) from public.intimate_likes where actor_id=dating_private.profile_id_for_uid(auth.uid())
$$;
create function public.dating_my_passes() returns table(target_user_id uuid) language sql stable security definer set search_path=pg_catalog as $$
  select dating_private.profile_uid_for_id(target_id) from public.intimate_passes where actor_id=dating_private.profile_id_for_uid(auth.uid())
$$;
create function public.dating_pass(p_target_user_id uuid) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=dating_private.profile_id_for_uid(auth.uid()); target uuid:=dating_private.profile_id_for_uid(p_target_user_id);
begin
  if actor is null or target is null or actor=target then raise exception 'Candidate unavailable'; end if;
  delete from public.intimate_likes where actor_id=actor and target_id=target;
  insert into public.intimate_passes(actor_id,target_id) values(actor,target) on conflict do nothing;
end $$;

-- Correct the read-side bridge without widening access to other users' likes.
do $policies$ declare item record; begin
  for item in select policyname from pg_policies where schemaname='public' and tablename='intimate_likes' and cmd='SELECT' loop
    execute format('drop policy %I on public.intimate_likes',item.policyname);
  end loop;
end $policies$;
alter table public.intimate_likes enable row level security;
create policy intimate_likes_matching_self_read on public.intimate_likes for select to authenticated using(
  actor_id=(select id from public.profiles where user_id=(select auth.uid())) or target_id=(select id from public.profiles where user_id=(select auth.uid())));

create function dating_private.enforce_like_requirements()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not dating_private.solo_ok(dating_private.profile_uid_for_id(new.actor_id),dating_private.profile_uid_for_id(new.target_id)) then
    raise exception 'Mutual dating requirements are not met' using errcode='23514'; end if;
  return new;
end $$;
create trigger intimate_likes_requirements before insert or update on public.intimate_likes
for each row execute function dating_private.enforce_like_requirements();

-- Existing conversations remain readable, but stale mutual likes aren't new matches.
create or replace view public.intimate_matches with(security_invoker=on) as
select dating_private.profile_uid_for_id(a.actor_id) viewer_id,dating_private.profile_uid_for_id(a.target_id) other_id,
  greatest(a.created_at,b.created_at) matched_at
from public.intimate_likes a join public.intimate_likes b on b.actor_id=a.target_id and b.target_id=a.actor_id
where a.actor_id=dating_private.profile_id_for_uid(auth.uid()) and public.dating_pair_eligible(dating_private.profile_uid_for_id(a.target_id));

do $optional_matching$ begin
if to_regclass('public.couple_links') is not null and to_regclass('public.wing_pairs') is not null then
execute $optional_ddl$create or replace function public.people_discovery_cards(p_limit int default 60)
returns table(result_kind text,user_id uuid,partner_user_id uuid,score int,shared jsonb)
language sql stable security definer set search_path=pg_catalog,public as $$
  with viewer_members as(
    select auth.uid() uid
    union
    select other.user_id from public.couple_link_members self
    join public.couple_links link on link.id=self.couple_link_id and link.status='accepted' and link.revoked_at is null
    join public.couple_link_members other on other.couple_link_id=self.couple_link_id and other.user_id<>self.user_id
      and other.joint_discovery_enabled and other.discovery_mode in('joint_only','both')
    where self.user_id=auth.uid() and self.discovery_mode='joint_only' and self.joint_discovery_enabled
  ), singles as(
    select 'person'::text result_kind,d.user_id,null::uuid partner_user_id,0 score,d.shared,row_number() over() ordering
    from public.dating_discovery('{}',p_limit) d
  ), pairs as(
    select 'couple'::text,l.user_a_id,l.user_b_id,0,
      jsonb_build_object('requirements_met',true,'consent_verified',true),1000::bigint
    from public.couple_links l
    join public.couple_link_members ma on ma.couple_link_id=l.id and ma.user_id=l.user_a_id and ma.joint_discovery_enabled and ma.discovery_mode in('joint_only','both')
    join public.couple_link_members mb on mb.couple_link_id=l.id and mb.user_id=l.user_b_id and mb.joint_discovery_enabled and mb.discovery_mode in('joint_only','both')
    where public.social_feature_enabled('couple_links') and l.status='accepted' and l.revoked_at is null
      and exists(select 1 from public.dating_discovery_preferences pref where pref.user_id=auth.uid() and pref.accept_couple_profiles)
      and dating_private.pair_ok(auth.uid(),l.user_a_id) and dating_private.pair_ok(auth.uid(),l.user_b_id)
      and not exists(select 1 from viewer_members vm where not dating_private.pair_ok(vm.uid,l.user_a_id) or not dating_private.pair_ok(vm.uid,l.user_b_id)
        or not exists(select 1 from public.dating_discovery_preferences pref where pref.user_id=vm.uid and pref.accept_couple_profiles))
      and ((select count(*) from viewer_members)=1 or not exists(
        select 1 from unnest(array[l.user_a_id,l.user_b_id]) uid where not exists(
          select 1 from public.dating_discovery_preferences pref where pref.user_id=uid and pref.accept_couple_profiles)))
      and not public.is_blocked(l.user_a_id,l.user_b_id)
  ) select c.result_kind,c.user_id,c.partner_user_id,c.score,c.shared from(select * from singles union all select * from pairs) c
    order by c.ordering,c.user_id limit greatest(1,least(coalesce(p_limit,60),200))
$$;$optional_ddl$;
execute $optional_ddl$-- Delegates can suggest only people the principal can actually match with.
create or replace function public.wing_candidate_cards(p_pair_id uuid,p_limit int default 40)
returns table(candidate_id uuid,display_name text,avatar_url text,age_range text)
language sql stable security definer set search_path=pg_catalog,public as $$
  select p.user_id,p.display_name,p.avatar_url,p.age_range
  from public.wing_pairs w cross join public.profiles p
  where w.id=p_pair_id and w.wing_id=auth.uid() and w.status='accepted' and w.revoked_at is null
    and p.user_id<>w.wing_id and not public.is_blocked(w.wing_id,p.user_id) and dating_private.solo_ok(w.principal_id,p.user_id)
  order by p.last_active_at desc nulls last,p.user_id limit greatest(1,least(coalesce(p_limit,40),100))
$$;$optional_ddl$;
execute $optional_ddl$create or replace function public.wing_recommend_candidate(p_pair_id uuid,p_candidate_id uuid,p_note text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_uid uuid:=auth.uid(); v_pair public.wing_pairs; v_rec public.wing_recommendations; v_cached jsonb;
begin
  if not public.social_feature_enabled('wing_queer') then return public.social_result_error('FEATURE_DISABLED','Wing-Queer is unavailable'); end if;
  select * into v_pair from public.wing_pairs where id=p_pair_id and status='accepted' and revoked_at is null;
  if v_uid is null or not found or v_pair.wing_id<>v_uid then return public.social_result_error('CONSENT_REQUIRED','Accepted wing delegation required'); end if;
  if public.is_blocked(v_uid,p_candidate_id) or not dating_private.solo_ok(v_pair.principal_id,p_candidate_id) then return public.social_result_error('REQUIREMENTS_NOT_MET','Candidate is unavailable under mutual requirements'); end if;
  v_cached:=public.social_receipt_get('wing_recommend_candidate',p_idempotency_key); if v_cached is not null then return v_cached; end if;
  insert into public.wing_recommendations(wing_pair_id,wing_id,principal_id,candidate_id,note)
    values(p_pair_id,v_uid,v_pair.principal_id,p_candidate_id,nullif(btrim(p_note),'')) returning * into v_rec;
  return public.social_receipt_put('wing_recommend_candidate',p_idempotency_key,public.social_result_ok(to_jsonb(v_rec)));
exception when unique_violation then return public.social_result_error('STALE_VERSION','Candidate already recommended');
end $$;$optional_ddl$;
execute $optional_ddl$create function dating_private.enforce_wing_requirements()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not dating_private.solo_ok(new.principal_id,new.candidate_id) then
    raise exception 'Mutual dating requirements are not met' using errcode='23514'; end if;
  return new;
end $$;
create trigger wing_recommendations_requirements before insert or update of candidate_id,principal_id on public.wing_recommendations
for each row execute function dating_private.enforce_wing_requirements();$optional_ddl$;
end if;
end $optional_matching$;

-- Retire the old public chemistry side channel. Ranking now stays private.
create or replace function public.compute_chemistry(p_viewer uuid,p_candidate uuid)
returns int language sql stable set search_path=pg_catalog as $$select 0$$;

-- Do not expose helpers or private facts as callable RPCs.
revoke all on all functions in schema dating_private from public,anon,authenticated;
grant execute on function dating_private.valid_rules(jsonb) to authenticated,service_role;
revoke all on function public.dating_pair_eligible(uuid),public.dating_intimate_pair_eligible(uuid),public.dating_discovery(jsonb,int),public.dating_profile(uuid),public.people_discovery(uuid,text,uuid,uuid,uuid,int,int),public.intimate_like(uuid,text),public.compute_chemistry(uuid,uuid) from public,anon;
grant execute on function public.dating_pair_eligible(uuid),public.dating_intimate_pair_eligible(uuid),public.dating_discovery(jsonb,int),public.dating_profile(uuid),public.people_discovery(uuid,text,uuid,uuid,uuid,int,int),public.intimate_like(uuid,text),public.compute_chemistry(uuid,uuid) to authenticated,service_role;
comment on table public.dating_matching_settings is 'Private, explicit mutual matching preferences. Required conditions never relax automatically. No identity, health or coming-out inference.';

do $grants$ declare fn text; begin foreach fn in array array['people_discovery_cards(int)','wing_candidate_cards(uuid,int)','wing_recommend_candidate(uuid,uuid,text,text)'] loop if to_regprocedure('public.'||fn) is not null then execute 'revoke all on function public.'||fn||' from public,anon'; execute 'grant execute on function public.'||fn||' to authenticated,service_role'; end if; end loop; end $grants$;

revoke all on function public.dating_my_likes(),public.dating_my_passes(),public.dating_pass(uuid) from public,anon;
grant execute on function public.dating_my_likes(),public.dating_my_passes(),public.dating_pass(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
