\set ON_ERROR_STOP on
begin;
create schema matching_test;
create function matching_test.uid(n int) returns uuid language sql immutable as $$select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
create function matching_test.pid(n int) returns uuid language sql immutable as $$select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
create function matching_test.assert(ok boolean,label text) returns text language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end$$;
grant usage on schema matching_test to authenticated,anon;
insert into auth.users select matching_test.uid(n) from generate_series(1,4) n;
insert into public.profiles(id,user_id,display_name,date_of_birth,gender_identity,relationship_style,current_relationship_status,interests)
select matching_test.pid(n),matching_test.uid(n),'Person '||n,current_date-interval '30 years',
  case n when 1 then 'man' when 3 then 'non_binary' else 'woman' end,
  case when n=3 then 'polyamorous' else 'monogamous' end,'single','["music","walking"]'
from generate_series(1,4) n;
insert into public.intimate_profiles(id,opted_in_at,consent_18plus_at,role,into_tags,safer_sex_prefs,height_cm,body_type,age_band)
select matching_test.uid(n),now(),now(),case when n=1 then array['top','dom'] else array['bottom','sub'] end,
  array['kissing','bondage'],array['condoms_always'],175,'average','30-34' from generate_series(1,3) n;
insert into public.dating_matching_settings(user_id,dating_enabled,adult_consent_at,use_identity,use_intimate,connection_goals)
select matching_test.uid(n),true,now(),true,true,array['relationship'] from generate_series(1,4) n;
select set_config('request.jwt.claim.sub',matching_test.uid(1)::text,true);

select matching_test.assert(dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'initial mutual pair');
select matching_test.assert(dating_private.pair_ok(matching_test.uid(1),matching_test.uid(4)),'dating without intimate profile');
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(1)),'self excluded');

-- Production's existing seeking editor remains a strict, reciprocal source.
update public.intimate_profiles set dating_prefs='{"seeking":{"roles":["top"]}}' where id=matching_test.uid(1);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'existing seeking roles are strict');
update public.intimate_profiles set dating_prefs='{"seeking":{"roles":["bottom"]}}' where id=matching_test.uid(1);
select matching_test.assert(dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'existing seeking role can qualify');
update public.intimate_profiles set dating_prefs='{"seeking":{"age_min":"40-49"}}' where id=matching_test.uid(2);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'existing seeking age applies in reverse');
update public.intimate_profiles set dating_prefs='{}';

update public.profiles set privacy_settings='{"profile_visibility":"private"}' where user_id=matching_test.uid(2);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'private profile overrides discovery opt-in');
update public.profiles set privacy_settings='{"profile_visibility":"friends"}' where user_id=matching_test.uid(2);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'friends-only profile excludes strangers');
insert into public.user_relationships values(matching_test.uid(2),matching_test.uid(1),'friend','accepted');
select matching_test.assert(dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'friends-only profile allows accepted friend');
update public.profiles set privacy_settings='{"profile_visibility":"community"}' where user_id=matching_test.uid(2);
update public.dating_matching_settings set connection_goals=array['casual'] where user_id=matching_test.uid(2);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'disjoint connection availability excludes');
update public.dating_matching_settings set connection_goals=array['relationship'] where user_id=matching_test.uid(2);
update public.dating_matching_settings set rules='{"genders":{"strength":"required","values":["woman"]}}' where user_id=matching_test.uid(1);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(3)),'strict gender requirement');
update public.dating_matching_settings set rules='{"genders":{"strength":"required","values":["woman"]}}' where user_id=matching_test.uid(2);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'reverse requirement enforced');
select matching_test.assert(not exists(select 1 from public.dating_discovery() where user_id=matching_test.uid(2)),'discovery checks reverse requirement');
select matching_test.assert(not exists(select 1 from public.dating_profile(matching_test.uid(2))),'direct detail checks reverse requirement');
select matching_test.assert((public.intimate_like(matching_test.uid(2),'requirements-test')->>'ok')::boolean=false,'like RPC rejects ineligible pair');
do $$begin
  begin insert into public.intimate_likes(actor_id,target_id) values(matching_test.pid(1),matching_test.pid(2));
    raise exception 'FAIL: direct like insert accepted';
  exception when check_violation then raise notice 'PASS: direct like insert rejected'; end;
end$$;
update public.dating_matching_settings set rules='{}' where user_id=matching_test.uid(2);
update public.dating_matching_settings set use_identity=false where user_id=matching_test.uid(2);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'unshared required gender is unknown');
update public.dating_matching_settings set use_identity=true where user_id=matching_test.uid(2);
update public.profiles set gender_identity='transgender_woman' where user_id=matching_test.uid(2);
select matching_test.assert(dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'woman includes trans woman');
update public.dating_matching_settings set rules='{"genders":{"strength":"preferred","values":["woman"]}}' where user_id=matching_test.uid(1);
select matching_test.assert(dating_private.pair_ok(matching_test.uid(1),matching_test.uid(3)),'preferred mismatch does not exclude');

update public.dating_matching_settings set rules='{"activities":{"strength":"preferred","values":["bondage"]}}' where user_id=matching_test.uid(1);
update public.intimate_profiles set limits=array['bondage'] where id=matching_test.uid(2);
select matching_test.assert(dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'optional interest versus limit keeps person');
update public.dating_matching_settings set rules='{"activities":{"strength":"required","values":["bondage"]}}' where user_id=matching_test.uid(1);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'required activity versus boundary excludes');
update public.intimate_profiles set limits='{}' where id=matching_test.uid(2);
select matching_test.assert(dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'mutually available activity qualifies');
update public.dating_matching_settings set rules='{"activities":{"strength":"required","values":["bondage","leather"]}}' where user_id=matching_test.uid(1);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'all required activities must be satisfied');
update public.dating_matching_settings set rules='{"relationship_styles":{"strength":"required","values":["monogamous"]}}' where user_id=matching_test.uid(1);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(3)),'strict relationship style');
update public.dating_matching_settings set rules='{"protection":{"strength":"required","values":["condoms_always"]}}' where user_id=matching_test.uid(1);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(4)),'unknown protection cannot satisfy requirement');
update public.dating_matching_settings set rules='{"practices":{"strength":"required","values":["quiet_meetup"]}}' where user_id=matching_test.uid(1);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'unknown access practice fails closed');
update public.dating_matching_settings set offered_practices=array['quiet_meetup'] where user_id=matching_test.uid(2);
select matching_test.assert(dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'explicit offered practice satisfies');

update public.dating_matching_settings set rules='{}',height_strength='required',min_height_cm=180 where user_id=matching_test.uid(1);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'height requirement enforced');
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(4)),'unknown height fails closed');
update public.dating_matching_settings set height_strength='any',distance_strength='required',max_distance_km=30 where user_id=matching_test.uid(1);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'unknown location fails closed');
insert into public.cities values(matching_test.uid(101),47.37,8.54),(matching_test.uid(102),46.95,7.45);
insert into public.user_travel_preferences values(matching_test.uid(1),matching_test.uid(101)),(matching_test.uid(2),matching_test.uid(101));
select matching_test.assert(dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'same chosen city qualifies');
update public.user_travel_preferences set home_city_id=matching_test.uid(102) where user_id=matching_test.uid(2);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'far city fails required radius');
update public.profiles set travel_mode='{"city_id":"not-a-uuid","until":"not-a-date"}' where user_id=matching_test.uid(2);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'malformed travel state does not crash matching or widen requirements');
update public.profiles set travel_mode=null where user_id=matching_test.uid(2);
update public.dating_matching_settings set distance_strength='any' where user_id=matching_test.uid(1);
-- Checklist and legacy activity answers use the canonical tag bridge.
insert into public.kink_items values(matching_test.uid(70),'rope-play',true,'intimate-bondage',null);
insert into public.kink_ratings values(matching_test.uid(2),matching_test.uid(70),'receiving','hard_limit');
update public.dating_matching_settings set use_checklist=true where user_id=matching_test.uid(2);
update public.dating_matching_settings set rules='{"activities":{"strength":"required","values":["bondage"]}}' where user_id=matching_test.uid(1);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'checklist hard boundary overrides duplicate positive intimate tag');
update public.kink_ratings set rating='like';
select matching_test.assert(dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'canonical checklist activity qualifies');
update public.dating_matching_settings set rules='{}' where user_id=matching_test.uid(1);
insert into public.kink_ratings values(matching_test.uid(1),matching_test.uid(70),'giving','like');
do $$declare before_score int; after_score int; begin
  before_score:=dating_private.rank_pair(matching_test.uid(1),matching_test.uid(2));
  update public.dating_matching_settings set use_checklist=true where user_id=matching_test.uid(1);
  after_score:=dating_private.rank_pair(matching_test.uid(1),matching_test.uid(2));
  perform matching_test.assert(after_score>before_score,'checklist ranking needs both explicit consents');
  update public.dating_matching_settings set use_checklist=false where user_id=matching_test.uid(2);
  perform matching_test.assert(dating_private.rank_pair(matching_test.uid(1),matching_test.uid(2))=before_score,'checklist consent revocation removes boost');
end$$;
select matching_test.assert(public.compute_chemistry(matching_test.uid(1),matching_test.uid(2))=0,'legacy chemistry endpoint cannot expose private ranking');
select matching_test.assert(not exists(select 1 from public.dating_discovery('{"roles":["top"]}') where user_id=matching_test.uid(2)),'request filters evaluated server side');

update public.dating_matching_settings set dating_enabled=false where user_id=matching_test.uid(2);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'dating hidden despite active intimate profile');
update public.dating_matching_settings set dating_enabled=true,active_until=now()-interval '1 second' where user_id=matching_test.uid(2);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'discovery expiry enforced');
update public.dating_matching_settings set active_until=null where user_id=matching_test.uid(2);
update public.profiles set date_of_birth=current_date-interval '17 years' where user_id=matching_test.uid(2);
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'underage rejects even with affirmation');
update public.profiles set date_of_birth=current_date-interval '30 years' where user_id=matching_test.uid(2);
insert into public.blocks values(matching_test.uid(2),matching_test.uid(1));
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'reverse block enforced');
delete from public.blocks;
insert into public.user_discovery_safety_state values(matching_test.uid(2),'active');
select matching_test.assert(not dating_private.pair_ok(matching_test.uid(1),matching_test.uid(2)),'active travel shield enforced');
delete from public.user_discovery_safety_state;
select matching_test.assert(not exists(select 1 from public.people_discovery(matching_test.uid(2),'dating')),'viewer impersonation rejected');
select matching_test.assert((select bool_and(score=0 and shared='{"requirements_met":true}') from public.dating_discovery()),'private ranking inputs are not exposed');

-- Couple eligibility requires both members to satisfy the principal’s rules.
insert into public.couple_links values(matching_test.uid(50),matching_test.uid(2),matching_test.uid(3),'accepted',null);
insert into public.couple_link_members values(matching_test.uid(50),matching_test.uid(2),true,'both'),(matching_test.uid(50),matching_test.uid(3),true,'both');
insert into public.dating_discovery_preferences values(matching_test.uid(1),true);
select matching_test.assert(exists(select 1 from public.people_discovery_cards() where result_kind='couple'),'eligible couple appears');
update public.dating_matching_settings set rules='{"relationship_styles":{"strength":"required","values":["monogamous"]}}' where user_id=matching_test.uid(1);
select matching_test.assert(not exists(select 1 from public.people_discovery_cards() where result_kind='couple'),'one incompatible member excludes entire couple');
insert into public.wing_pairs values(matching_test.uid(60),matching_test.uid(4),matching_test.uid(1),'accepted',null);
select set_config('request.jwt.claim.sub',matching_test.uid(4)::text,true);
select matching_test.assert(not exists(select 1 from public.wing_candidate_cards(matching_test.uid(60)) where candidate_id=matching_test.uid(3)),'wing suggestions respect principal requirements');
select matching_test.assert((public.wing_recommend_candidate(matching_test.uid(60),matching_test.uid(3),null,'wing-requirement-test')->>'ok')::boolean=false,'wing write rechecks principal requirements');
select matching_test.assert((public.wing_recommend_candidate(matching_test.uid(60),matching_test.uid(2),null,'wing-valid-test')->>'ok')::boolean,'wing can recommend eligible profile');

-- RLS and grants: actual authenticated execution, not only owner calls.
select set_config('request.jwt.claim.sub',matching_test.uid(1)::text,true);
set local role authenticated;
select matching_test.assert((select count(*)=1 from public.dating_matching_settings),'settings are self-only');
select matching_test.assert((select count(*)=0 from public.intimate_profiles where id=matching_test.uid(3)),'direct intimate table cannot bypass requirements');
select matching_test.assert(not has_function_privilege('authenticated','dating_private.facts(uuid)','EXECUTE'),'private facts not callable');
select matching_test.assert(not has_function_privilege('authenticated','public.people_discovery_before_strict_matching(uuid,text,uuid,uuid,uuid,int,int)','EXECUTE'),'old discovery bypass not callable');
select matching_test.assert(not has_function_privilege('anon','public.dating_discovery(jsonb,int)','EXECUTE'),'anonymous discovery not callable');
select matching_test.assert(not exists(select 1 from public.dating_profile(matching_test.uid(3))),'authenticated direct detail fails closed');
select matching_test.assert(exists(select 1 from public.dating_discovery() where user_id=matching_test.uid(2)),'authenticated discovery works');
select matching_test.assert(not dating_private.valid_rules('{"protection":{"strength":"required","values":["tested_recently"]}}'),'health status cannot be a matching rule');
do $$begin
  begin update public.dating_matching_settings set rules='{"genders":{"strength":"required","values":[]}}';
    raise exception 'FAIL: empty required selection accepted';
  exception when check_violation then raise notice 'PASS: empty required selection rejected'; end;
end$$;
reset role;
-- Joint-only profiles never appear as solo detail/likes.
update public.couple_link_members set discovery_mode='joint_only' where user_id=matching_test.uid(2);
select matching_test.assert(not exists(select 1 from public.dating_profile(matching_test.uid(2))),'joint-only member cannot be opened as solo');
select matching_test.assert((public.intimate_like(matching_test.uid(2),'joint-only-like-test')->>'ok')::boolean=false,'joint-only member cannot be liked as solo');
update public.couple_link_members set discovery_mode='both';
-- Intimate expiry does not expose body details through romantic discovery.
update public.intimate_profiles set discovery_active_until=now()-interval '1 second' where id=matching_test.uid(2);
select matching_test.assert((select not intimate_visible from public.dating_profile(matching_test.uid(2))),'expired intimate profile hidden in detail');
select matching_test.assert((select height_cm is null and role='{}' and discovery_city_id is null from public.dating_discovery() where user_id=matching_test.uid(2)),'expired intimate answers excluded from returned cards');
set local role authenticated;
select matching_test.assert(not exists(select 1 from public.intimate_profiles where id=matching_test.uid(2)),'expired intimate direct table access denied');
reset role;
update public.intimate_profiles set discovery_active_until=null where id=matching_test.uid(2);
select set_config('request.jwt.claim.sub',matching_test.uid(4)::text,true);
select matching_test.assert((select height_cm is null and role='{}' and discovery_city_id is null and age_band is null from public.dating_discovery() where user_id=matching_test.uid(2)),'dating-only viewer cannot obtain private anatomy, inferred age or home city');
rollback;
