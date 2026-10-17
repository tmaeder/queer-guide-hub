begin;
do $$
declare a uuid; b uuid; c uuid;
begin
  insert into public.taxonomy_terms(taxonomy,value,name) values ('venue_category','test-new-category','New category') returning id into a;
  if public.normalize_venue_category('test-new-category') <> 'test-new-category' then
    raise exception 'ingestion discarded a managed category';
  end if;
  insert into public.venues(category) values ('test-new-category') returning id into c;
  update public.taxonomy_terms set name='New label',sort_order=9,is_active=false where id=a;
  if not exists(select 1 from public.content_revisions where source_table='taxonomy_terms' and source_id=a and after->>'name'='New label' and not ('updated_at'=any(changed_fields))) then
    raise exception 'taxonomy label edit was not recorded by the revision trail';
  end if;
  -- Existing references can still be saved, but a new selection must be active.
  update public.venues set category=category where id=c;
  begin
    insert into public.venues(category) values ('test-new-category');
    raise exception 'inactive term accepted for a new selection';
  exception when check_violation then null; end;
  begin
    update public.taxonomy_terms set value='changed' where id=a;
    raise exception 'stable identifier changed';
  exception when check_violation then null; end;
  begin
    delete from public.taxonomy_terms where id=a;
    raise exception 'referenced term deleted';
  exception when check_violation then null; end;
  insert into public.taxonomy_terms(taxonomy,value,name,parent_id) values ('venue_category','test-child','Child',a) returning id into b;
  begin
    update public.taxonomy_terms set parent_id=b where id=a;
    raise exception 'category cycle accepted';
  exception when check_violation then null; end;
  begin
    insert into public.taxonomy_terms(taxonomy,value,name,parent_id) values ('hotel_type','test-wrong-parent','Wrong parent',a);
    raise exception 'parent from different vocabulary accepted';
  exception when check_violation then null; end;
  insert into public.tag_categories(name,slug) values ('Test root','test-root') returning id into a;
  insert into public.tag_categories(name,slug,parent_id) values ('Test child','test-child',a) returning id into b;
  begin
    update public.tag_categories set parent_id=b where id=a;
    raise exception 'tag category cycle accepted';
  exception when check_violation then null; end;
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000111';
set local test.staff_role = 'editor';
do $$ begin
  begin
    insert into public.taxonomy_terms(taxonomy,value,name) values ('venue_category','test-editor','Denied');
    raise exception 'editor mutated vocabulary';
  exception when insufficient_privilege then null; end;
end $$;
set local test.staff_role = 'moderator';
insert into public.taxonomy_terms(taxonomy,value,name) values ('venue_category','test-moderator','Allowed');
update public.taxonomy_terms set name='Renamed' where value='test-moderator';
set local test.intimate_eligible = 'false';
do $$ begin
  begin
    insert into public.kink_categories(label,slug,axis) values ('Test','test-ineligible','general');
    raise exception 'ineligible staff accessed intimate vocabulary';
  exception when insufficient_privilege then null; end;
end $$;
set local test.intimate_eligible = 'true';
insert into public.kink_categories(label,slug,axis) values ('Test','test-eligible','general');
set local test.intimate_eligible = 'false';
do $$ begin
  if exists(select 1 from public.content_revisions where source_table='kink_categories') then
    raise exception 'central revision history bypassed intimate eligibility';
  end if;
end $$;
rollback;
