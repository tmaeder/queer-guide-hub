begin;
do $$
declare department_id uuid; group_id uuid; other_id uuid; listing_id uuid; flag_id uuid;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000111',true);
  perform set_config('test.staff_role','moderator',true);
  select id into other_id from public.taxonomy_terms where taxonomy='marketplace_browse' and value='department:other';
  insert into public.taxonomy_terms(taxonomy,value,name) values ('marketplace_browse','department:test_department','Test department') returning id into department_id;
  insert into public.taxonomy_terms(taxonomy,value,name,parent_id) values ('marketplace_browse','group:test_group','Test group',department_id) returning id into group_id;
  if public.marketplace_department_for_group('test_group') <> 'test_department' then raise exception 'managed hierarchy was ignored by SQL'; end if;
  insert into public.marketplace_listings(subcategory_group,department,taxonomy_v3_at) values ('test_group','test_department',now()) returning id into listing_id;
  if (select taxonomy_classifier_version from public.marketplace_listings where id=listing_id) <> 'manual' then raise exception 'the automatic classifier discarded an explicit assignment'; end if;
  update public.taxonomy_terms set parent_id=other_id where id=group_id;
  if (select department from public.marketplace_listings where id=listing_id) <> 'other' then raise exception 'stored listing departments did not follow the moved group'; end if;
  begin
    insert into public.taxonomy_terms(taxonomy,value,name,parent_id) values ('marketplace_browse','fine:test_invalid_parent','Wrong parent',department_id);
    raise exception 'fine type accepted a department parent';
  exception when check_violation then null; end;
  begin
    insert into public.taxonomy_terms(taxonomy,value,name,metadata) values ('pride_flag','invalid_flag','Invalid','{"stripes":[{"hex":"not a color"}]}');
    raise exception 'malformed reference data accepted';
  exception when check_violation then null; end;
  insert into public.taxonomy_terms(taxonomy,value,name,metadata) values ('pride_flag','test_flag','Test flag','{"stripes":[{"hex":"#123456"}]}') returning id into flag_id;
  insert into public.profiles(identity_flags) values (array['test_flag']);
  update public.taxonomy_terms set is_active=false where id=flag_id;
  update public.profiles set identity_flags=identity_flags;
  begin
    insert into public.profiles(identity_flags) values (array['test_flag']);
    raise exception 'inactive flag accepted for a new profile selection';
  exception when check_violation then null; end;
  insert into public.taxonomy_terms(taxonomy,value,name) values ('competition_category','test_competition','Test category');
  insert into public.competitions(category) values ('test_competition');
  insert into public.taxonomy_terms(taxonomy,value,name) values ('organization_role','test_new_role','New organisation role');
  insert into public.organizations(roles) values (array['test_new_role']);
  update public.taxonomy_terms set is_active=false where taxonomy='organization_role' and value='test_new_role';
  update public.organizations set roles=roles;
  begin
    insert into public.organizations(roles) values (array['test_new_role']);
    raise exception 'inactive organisation role accepted for a new assignment';
  exception when check_violation then null; end;

  if not exists(select 1 from public.taxonomy_terms where taxonomy='profile_disability_status' and value='yes') then raise exception 'legacy profile vocabulary was not seeded from the existing constraint'; end if;
  insert into public.taxonomy_terms(taxonomy,value,name) values ('profile_disability_status','test_new_status','New status');
  insert into public.profiles(disability_status) values ('test_new_status');
  begin
    insert into public.profiles(disability_status) values ('unregistered_profile_value');
    raise exception 'an unregistered profile choice was accepted';
  exception when check_violation then null; end;

end $$;
set local role authenticated;
update public.taxonomy_terms set parent_id=(select id from public.taxonomy_terms where taxonomy='marketplace_browse' and value='department:test_department')
  where taxonomy='marketplace_browse' and value='group:test_group';
reset role;
do $$ begin
  if (select department from public.marketplace_listings where subcategory_group='test_group' limit 1) <> 'test_department' then
    raise exception 'moderator hierarchy updates did not synchronize privileged listing data';
  end if;
  if has_function_privilege('authenticated','taxonomy_private.sync_managed_marketplace_department()','execute') then
    raise exception 'privileged synchronization is directly executable by API callers';
  end if;
end $$;
rollback;
