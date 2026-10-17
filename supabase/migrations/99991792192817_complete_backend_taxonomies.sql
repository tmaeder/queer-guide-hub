-- Managed classifications complement the existing domain-specific vocabularies.
begin;
create table public.taxonomy_terms (
  id uuid primary key default gen_random_uuid(),
  taxonomy text not null,
  value text not null check (length(btrim(value)) > 0),
  name text not null check (length(btrim(name)) > 0),
  description text,
  parent_id uuid references public.taxonomy_terms(id) on delete restrict,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (taxonomy, value)
);
create index taxonomy_terms_parent_idx on public.taxonomy_terms(parent_id);
create index taxonomy_terms_order_idx on public.taxonomy_terms(taxonomy,sort_order,value);
alter table public.taxonomy_terms enable row level security;
grant select on public.taxonomy_terms to anon, authenticated;
grant insert, update on public.taxonomy_terms to authenticated;
grant all on public.taxonomy_terms to service_role;
create policy taxonomy_terms_read on public.taxonomy_terms for select to anon, authenticated using (true);

-- Preserve the exact values already stored by public and CMS forms.
insert into public.taxonomy_terms(taxonomy,value,name,sort_order) values
('hotel_type','hotel','Hotel',0),
('hotel_type','bnb','B&B',1),
('hotel_type','hostel','Hostel',2),
('hotel_type','guesthouse','Guesthouse',3),
('hotel_type','apartment','Apartment',4),
('hotel_type','resort','Resort',5),
('hotel_type','other','Other',6),
('milestone_category','uprising-movement','Uprising / Movement',0),
('milestone_category','law-equality','Law / Equality',1),
('milestone_category','law-decriminalization','Law / Decriminalization',2),
('milestone_category','law-criminalization','Law / Criminalization',3),
('milestone_category','depathologization','Depathologization',4),
('milestone_category','persecution-destruction','Persecution / Destruction',5),
('milestone_category','other','Other',6),
('milestone_category','culture-media','Culture / Media',7),
('milestone_category','politics-representation','Politics / Representation',8),
('milestone_category','health-aids','Health / AIDS',9),
('milestone_category','community-institution','Community / Institution',10),
('personality_cause_of_death','natural','Natural causes',0),
('personality_cause_of_death','illness','Illness',1),
('personality_cause_of_death','hiv_aids','HIV/AIDS',2),
('personality_cause_of_death','suicide','Suicide',3),
('personality_cause_of_death','homicide','Homicide / violent death',4),
('personality_cause_of_death','accident','Accident',5),
('personality_cause_of_death','overdose','Overdose',6),
('personality_cause_of_death','execution','Execution',7),
('personality_cause_of_death','unknown','Unknown',8),
('personality_cause_of_death','other','Other',9),
('venue_category','bar','Bar',0),
('venue_category','club','Club',1),
('venue_category','cafe','Café',2),
('venue_category','restaurant','Restaurant',3),
('venue_category','hotel','Hotel',4),
('venue_category','sauna','Sauna',5),
('venue_category','cruising','Cruising',6),
('venue_category','outdoor','Outdoor',7),
('venue_category','shop','Shop',8),
('venue_category','community_center','Community',9),
('venue_category','event-venue','Event Venue',10),
('venue_category','theater','Theater',11),
('venue_category','gallery','Gallery',12),
('venue_category','salon','Salon',13),
('venue_category','gym','Gym',14),
('venue_category','toilet','Restroom',15),
('venue_category','other','Other',16),
('service_category','general','General',0),
('service_category','beauty','Beauty',1),
('service_category','business','Business',2),
('service_category','dining','Dining',3),
('service_category','entertainment','Entertainment',4),
('service_category','events','Events',5),
('service_category','fitness','Fitness',6),
('service_category','professional','Professional',7),
('service_category','retail','Retail',8),
('service_category','wellness','Wellness',9),
('accessibility_category','general','General',0),
('accessibility_category','mobility','Mobility',1),
('accessibility_category','visual','Visual',2),
('accessibility_category','hearing','Hearing',3),
('accessibility_category','sensory','Sensory',4),
('gender','woman','Woman',0),
('gender','man','Man',1),
('gender','non_binary','Non-binary',2),
('gender','genderfluid','Genderfluid',3),
('gender','agender','Agender',4),
('gender','bigender','Bigender',5),
('gender','genderqueer','Genderqueer',6),
('gender','demigender','Demigender',7),
('gender','transgender_woman','Transgender woman',8),
('gender','transgender_man','Transgender man',9),
('gender','two_spirit','Two-Spirit',10),
('gender','questioning','Questioning',11),
('gender','prefer_not_to_say','Prefer not to say',12),
('gender','other','Other',13),
('orientation','straight','Straight',0),
('orientation','gay','Gay',1),
('orientation','lesbian','Lesbian',2),
('orientation','bisexual','Bisexual',3),
('orientation','pansexual','Pansexual',4),
('orientation','asexual','Asexual',5),
('orientation','demisexual','Demisexual',6),
('orientation','queer','Queer',7),
('orientation','questioning','Questioning',8),
('orientation','prefer_not_to_say','Prefer not to say',9),
('orientation','other','Other',10),
('chosen_family','involved','Involved in chosen family',0),
('chosen_family','building','Building chosen family',1),
('chosen_family','seeking','Seeking chosen family',2),
('chosen_family','not_applicable','Not applicable',3),
('chosen_family','prefer_not_to_say','Prefer not to say',4),
('coming_out','out','Out',0),
('coming_out','partially_out','Partially out',1),
('coming_out','not_out','Not out',2),
('coming_out','not_applicable','Not applicable',3),
('romantic_orientation','heteroromantic','Heteroromantic',0),
('romantic_orientation','homoromantic','Homoromantic',1),
('romantic_orientation','biromantic','Biromantic',2),
('romantic_orientation','panromantic','Panromantic',3),
('romantic_orientation','aromantic','Aromantic',4),
('romantic_orientation','demiromantic','Demiromantic',5),
('romantic_orientation','greyromantic','Greyromantic',6),
('romantic_orientation','queerplatonic','Queerplatonic',7),
('romantic_orientation','questioning','Questioning',8),
('romantic_orientation','prefer_not_to_say','Prefer not to say',9),
('romantic_orientation','other','Other',10),
('relationship_status','single','Single',0),
('relationship_status','taken','Taken',1),
('relationship_status','its_complicated','It''s complicated',2),
('relationship_status','open_to_explore','Open to explore',3),
('relationship_status','prefer_not_to_say','Prefer not to say',4),
('relationship_style','monogamous','Monogamous',0),
('relationship_style','polyamorous','Polyamorous',1),
('relationship_style','relationship_anarchist','Relationship anarchist',2),
('relationship_style','open_relationship','Open relationship',3),
('relationship_style','swinging','Swinging',4),
('relationship_style','exploring','Exploring',5),
('relationship_style','prefer_not_to_say','Prefer not to say',6),
('pronouns','she/her','she/her',0),
('pronouns','he/him','he/him',1),
('pronouns','they/them','they/them',2),
('pronouns','ze/zir','ze/zir',3),
('pronouns','ze/hir','ze/hir',4),
('pronouns','xe/xem','xe/xem',5),
('pronouns','it/its','it/its',6),
('pronouns','fae/faer','fae/faer',7),
('pronouns','any pronouns','any pronouns',8),
('pronouns','ask me','ask me',9);

-- Legacy values remain selectable on their existing records. In particular,
-- old imports must not fail unrelated edits after the vocabulary is introduced.
do $$
declare spec text[]; t text; c text; k text;
begin
  foreach spec slice 1 in array array[
    ['venues','category','venue_category'],
    ['venues','accommodation_type','hotel_type'], ['hotels','hotel_type','hotel_type'], ['milestones','category','milestone_category'],
    ['personalities','cause_of_death','personality_cause_of_death'],
    ['profiles','chosen_family_status','chosen_family'], ['profiles','current_relationship_status','relationship_status'], ['profiles','relationship_style','relationship_style'],
    ['venue_services','category','service_category'], ['event_services','category','service_category'],
    ['event_amenities','category','service_category'], ['accessibility_attributes','category','accessibility_category']
  ] loop
    t := spec[1]; c := spec[2]; k := spec[3];
    execute format('insert into public.taxonomy_terms(taxonomy,value,name,is_active)
      select %L, %I, initcap(replace(%I,''_'','' '')), false from public.%I
      where %I is not null and btrim(%I) <> '''' group by %I on conflict do nothing', k,c,c,t,c,c,c);
  end loop;
end $$;

-- The CMS uses optimistic concurrency; these older vocabularies lacked its stamp.
alter table public.event_categories add column if not exists sort_order integer not null default 0;
alter table public.event_categories add column if not exists is_active boolean not null default true;
alter table public.event_categories add column if not exists updated_at timestamptz not null default now();
alter table public.tag_categories add column if not exists is_active boolean not null default true;
alter table public.kink_categories add column if not exists updated_at timestamptz not null default now();
alter table public.kink_items add column if not exists updated_at timestamptz not null default now();

-- Canonical event vocabulary now governs events.event_type as well as the editor.
alter table public.event_types add column if not exists slug text;
update public.event_types set slug = lower(regexp_replace(btrim(name), '[^a-zA-Z0-9]+', '-', 'g')) where slug is null;
create unique index if not exists event_types_slug_key on public.event_types(slug);
insert into public.event_types(slug,name,sort_order) values
('party','Party',0),
('festival','Festival',1),
('cruise','Cruise',2),
('pride','Pride',3),
('meetup','Meetup',4),
('workshop','Workshop',5),
('concert','Concert',6),
('comedy','Comedy',7),
('conference','Conference',8),
('film','Film',9),
('drag','Drag',10),
('sports','Sports',11),
('art','Art',12),
('exhibition','Exhibition',13),
('theater','Theater',14),
('fundraiser','Fundraiser',15),
('protest','Protest',16),
('social','Social',17),
('community','Community',18),
('fair','Fair',19),
('fetish','Fetish',20),
('other','Other',21) on conflict (slug) do nothing;

-- Stable keys preserve text references and URLs. Deactivation replaces deletion.
create or replace function public.guard_managed_taxonomy() returns trigger
language plpgsql set search_path = '' as $$
declare parent_key text; parent_uuid uuid; cycle_found boolean; parent_taxonomy text;
begin
  -- Also protects writes reached through privileged CMS/revert RPCs.
  if auth.uid() is not null then
    if not public.has_any_role_jwt(array['admin','moderator']::public.app_role[]) then
      raise exception 'Taxonomy management requires a moderator.' using errcode='42501';
    end if;
    if TG_TABLE_NAME in ('kink_categories','kink_items') and not public.is_intimate_eligible(auth.uid()) then
      raise exception 'Intimate-profile eligibility is required.' using errcode='42501';
    end if;
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'Deactivate this term instead of deleting it; existing references must be preserved.' using errcode='23514';
  end if;
  if TG_OP = 'UPDATE' and TG_ARGV[0] <> '' and coalesce(to_jsonb(old)->>TG_ARGV[0],'') <> '' and (to_jsonb(new)->TG_ARGV[0]) is distinct from (to_jsonb(old)->TG_ARGV[0]) then
    raise exception 'The stable identifier cannot change. Edit the label or deactivate the term.' using errcode='23514';
  end if;
  if TG_TABLE_NAME = 'taxonomy_terms' and TG_OP = 'UPDATE' and (to_jsonb(new)->>'taxonomy') is distinct from (to_jsonb(old)->>'taxonomy') then
    raise exception 'A term cannot move to another taxonomy.' using errcode='23514';
  end if;
  if TG_NARGS > 1 and TG_ARGV[1] <> '' then
    parent_key := TG_ARGV[1]; parent_uuid := (to_jsonb(new)->>parent_key)::uuid;
    perform pg_advisory_xact_lock(hashtextextended(TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,0));
    if parent_uuid is not null then
      execute format('with recursive ancestors as (
        select id,%1$I from public.%2$I where id=$1
        union select p.id,p.%1$I from public.%2$I p join ancestors a on p.id=a.%1$I
      ) select exists(select 1 from ancestors where id=$2)', parent_key,TG_TABLE_NAME)
      into cycle_found using parent_uuid,new.id;
      if cycle_found or parent_uuid = new.id then
        raise exception 'A category cannot be its own ancestor.' using errcode='23514';
      end if;
      if TG_TABLE_NAME = 'taxonomy_terms' then
        select taxonomy into parent_taxonomy from public.taxonomy_terms where id=parent_uuid;
        if parent_taxonomy is distinct from (to_jsonb(new)->>'taxonomy') then
          raise exception 'Parent must belong to the same taxonomy.' using errcode='23514';
        end if;
      end if;
    end if;
  end if;
  if TG_TABLE_NAME = 'tag_categories' then
    if new.parent_id is null then new.level := 0;
    else
      if exists(select 1 from public.tag_categories where id=new.parent_id and parent_id is not null)
        or exists(select 1 from public.tag_categories where parent_id=new.id) then
        raise exception 'Tag categories support a root and one child level.' using errcode='23514';
      end if;
      new.level := 1;
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.guard_managed_taxonomy() from public;

-- Give moderators the same taxonomy management capabilities the routes promise.
-- Intimate vocabularies retain their adult eligibility boundary, including staff.
do $$
declare t text; access_rule text; key_column text; parent_column text;
begin
  foreach t in array array['taxonomy_terms','amenities','event_categories','tag_categories','news_categories',
    'marketplace_categories','venue_services','event_types','event_amenities','event_services',
    'accessibility_attributes','target_groups','professions','kink_categories','kink_items'] loop
    access_rule := '(auth.uid() is not null and public.has_any_role_jwt(array[''admin'',''moderator'']::public.app_role[]))';
    if t in ('kink_categories','kink_items') then
      access_rule := '('||access_rule||' and public.is_intimate_eligible(auth.uid()))';
    end if;
    execute format('alter table public.%I enable row level security',t);
    execute format('grant select,insert,update on public.%I to authenticated',t);
    execute format('create policy taxonomy_staff_read on public.%I for select to authenticated using (%s)',t,access_rule);
    execute format('create policy taxonomy_staff_insert on public.%I for insert to authenticated with check (%s)',t,access_rule);
    execute format('create policy taxonomy_staff_update on public.%I for update to authenticated using (%s) with check (%s)',t,access_rule,access_rule);
    -- A restrictive policy also constrains any older, broader admin write policies.
    execute format('create policy taxonomy_write_floor on public.%I as restrictive for all to authenticated using (true) with check (%s)',t,access_rule);
    key_column := case when t='taxonomy_terms' then 'value' when t in ('amenities','tag_categories','news_categories','marketplace_categories','professions','venue_services','event_types','target_groups','kink_categories','kink_items') then 'slug' else '' end;
    parent_column := case when t in ('taxonomy_terms','tag_categories','marketplace_categories') then 'parent_id' when t='news_categories' then 'parent_category_id' else '' end;
    execute format('create trigger guard_managed_taxonomy before insert or update or delete on public.%I for each row execute function public.guard_managed_taxonomy(%L,%L)',t,key_column,parent_column);
  end loop;
end $$;

-- Only changed values need to be active; inactive terms stay on existing rows.
create or replace function public.validate_managed_classification() returns trigger
language plpgsql set search_path = '' as $$
declare current_value text; old_value text;
begin
  current_value := to_jsonb(new)->>TG_ARGV[0];
  if TG_OP = 'UPDATE' then old_value := to_jsonb(old)->>TG_ARGV[0]; end if;
  if TG_OP = 'UPDATE' and current_value is not distinct from old_value then return new; end if;
  if current_value is null or current_value = '' then return new; end if;
  if TG_ARGV[1] = 'event_type' then
    if exists(select 1 from public.event_types where slug=current_value and is_active) then return new; end if;
    raise exception 'Choose an active event type: %',current_value using errcode='23514';
  end if;
  if not exists(select 1 from public.taxonomy_terms where taxonomy=TG_ARGV[1] and value=current_value and is_active) then
    raise exception 'Choose an active % term: %',TG_ARGV[1],current_value using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_managed_classification() from public;

alter table public.venues drop constraint if exists venues_category_check;
alter table public.events drop constraint if exists events_event_type_check;
alter table public.hotels drop constraint if exists hotels_hotel_type_check;
alter table public.milestones drop constraint if exists milestones_category_check;
alter table public.personalities drop constraint if exists personalities_cause_of_death_check;
alter table public.profiles drop constraint if exists profiles_chosen_family_status_check;
alter table public.profiles drop constraint if exists profiles_current_relationship_status_check;
alter table public.profiles drop constraint if exists profiles_relationship_style_check;

do $$
declare spec text[];
begin
  foreach spec slice 1 in array array[
    ['venues','category','venue_category'],
    ['venues','accommodation_type','hotel_type'], ['hotels','hotel_type','hotel_type'], ['milestones','category','milestone_category'],
    ['personalities','cause_of_death','personality_cause_of_death'],
    ['profiles','chosen_family_status','chosen_family'], ['profiles','current_relationship_status','relationship_status'], ['profiles','relationship_style','relationship_style'],
    ['venue_services','category','service_category'], ['event_services','category','service_category'],
    ['event_amenities','category','service_category'], ['accessibility_attributes','category','accessibility_category']
  ] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.validate_managed_classification(%L,%L)','validate_managed_'||spec[2],spec[1],spec[2],spec[3]);
  end loop;
end $$;
create trigger validate_managed_event_type before insert or update on public.events for each row execute function public.validate_managed_classification('event_type','event_type');
-- Ingestion must preserve a newly managed place category as well as the CMS.
create or replace function public.normalize_venue_category(c text) returns text
language sql stable set search_path = '' as $$
  select coalesce(
    (select value from public.taxonomy_terms where taxonomy='venue_category' and value=lower(btrim(c)) and is_active),
    case lower(btrim(coalesce(c,'')))
      when 'bar / club' then 'bar' when 'bar/club' then 'bar'
      when 'café' then 'cafe' when 'community center' then 'community_center'
      when 'event venue' then 'event-venue' when 'theatre' then 'theater'
      when 'museum' then 'gallery' when 'store' then 'shop'
      when 'sexclub' then 'club' when 'cinema' then 'theater'
      else 'other'
    end
  )
$$;

-- Include newly exposed vocabularies in the existing server-owned revision trail.
insert into public.content_versioned_tables(registry_key,table_name,enabled)
select t,t,true from unnest(array['taxonomy_terms','amenities','event_categories','tag_categories','news_categories','marketplace_categories','kink_categories','kink_items']) as t
on conflict (table_name) do nothing;
do $$
declare t text;
begin
  foreach t in array array['taxonomy_terms','amenities','event_categories','tag_categories','news_categories','marketplace_categories','kink_categories','kink_items'] loop
    execute format('drop trigger if exists trg_content_revision on public.%I',t);
    execute format('create trigger trg_content_revision after insert or update or delete on public.%I for each row execute function public.log_content_revision()',t);
  end loop;
end $$;
-- Central history must not become a bypass of intimate vocabulary eligibility.
create policy taxonomy_intimate_revision_read on public.content_revisions as restrictive
for select to authenticated using (
  source_table not in ('kink_categories','kink_items') or public.is_intimate_eligible(auth.uid())
);
notify pgrst, 'reload schema';
commit;
