-- Rollback-only verification using existing is_test_account profiles.
BEGIN;
SET LOCAL statement_timeout='30s';
do $verify$
declare ids uuid[]; a uuid; b uuid; ok boolean;
begin
  select array_agg(user_id) into ids from(select user_id from public.profiles where is_test_account order by user_id limit 2) p;
  if cardinality(ids)<2 then raise exception 'Two existing test accounts required'; end if;
  a:=ids[1];b:=ids[2];
  perform set_config('request.jwt.claim.sub',a::text,true);
  update public.profiles set moderation_status='approved',date_of_birth=current_date-interval '30 years',privacy_settings=jsonb_build_object('profile_visibility','community'),gender_identity=case when user_id=a then 'man' else 'woman' end where user_id in(a,b) and is_test_account;
  insert into public.intimate_profiles(id,opted_in_at,consent_18plus_at,moderation_status,dating_prefs) values(a,now(),now(),'approved','{}'),(b,now(),now(),'approved','{}')
    on conflict(id) do update set opted_in_at=excluded.opted_in_at,consent_18plus_at=excluded.consent_18plus_at,moderation_status='approved',dating_prefs='{}',discovery_active_until=null;
  insert into public.dating_matching_settings(user_id,dating_enabled,adult_consent_at,use_identity,use_intimate,rules) values(a,true,now(),true,true,'{}'),(b,true,now(),true,true,'{}')
    on conflict(user_id) do update set dating_enabled=true,adult_consent_at=now(),active_until=null,use_identity=true,use_intimate=true,rules='{}';
  if not dating_private.pair_ok(a,b) then raise exception 'Preflight eligible pair failed'; end if;
  update public.dating_matching_settings set rules='{"genders":{"strength":"required","values":["man"]}}' where user_id=a;
  if dating_private.pair_ok(a,b) then raise exception 'Preflight strict requirement failed'; end if;
  if exists(select 1 from public.dating_discovery('{}',200) where user_id=b) then raise exception 'Discovery bypasses requirement'; end if;
  if exists(select 1 from public.dating_profile(b)) then raise exception 'Detail bypasses requirement'; end if;
  if (public.intimate_like(b,'preflight-requirements')->>'ok')::boolean then raise exception 'Like bypasses requirement'; end if;
  update public.dating_matching_settings set rules='{}' where user_id=a;
  update public.dating_matching_settings set rules='{"genders":{"strength":"required","values":["woman"]}}' where user_id=b;
  if dating_private.pair_ok(a,b) then raise exception 'Preflight reverse requirement failed'; end if;
  update public.dating_matching_settings set rules='{}' where user_id=b;
  update public.intimate_profiles set dating_prefs='{"seeking":{"age_min":"50-59"}}' where id=b;
  if dating_private.pair_ok(a,b) then raise exception 'Saved seeking reverse requirement failed'; end if;
end $verify$;
select 'Strict eligibility, reciprocal requirements, saved seeking, discovery, detail and like guards passed on existing test accounts; transaction will roll back' as verification;

ROLLBACK;
