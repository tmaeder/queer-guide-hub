-- Minimal surrounding schema for isolated execution of the taxonomy migration.
-- The test uses real PostgreSQL constraints, triggers and RLS, without live data.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create type public.app_role as enum ('admin','moderator','editor','viewer');
create function public.has_any_role_jwt(required_roles public.app_role[]) returns boolean language sql stable as $$
  select coalesce(current_setting('test.staff_role',true) = any(required_roles::text[]),false)
$$;
create function public.is_intimate_eligible(user_id uuid) returns boolean language sql stable as $$
  select coalesce(current_setting('test.intimate_eligible',true)='true',false)
$$;
grant usage on schema auth to authenticated,anon;
grant execute on all functions in schema auth to authenticated,anon;
create table public.venues (id uuid primary key default gen_random_uuid(),category text, accommodation_type text);
create table public.events (id uuid primary key default gen_random_uuid(),event_type text);
create table public.hotels (id uuid primary key default gen_random_uuid(),hotel_type text);
create table public.milestones (id uuid primary key default gen_random_uuid(),category text);
create table public.personalities (id uuid primary key default gen_random_uuid(),cause_of_death text);
create table public.profiles (id uuid primary key default gen_random_uuid(),chosen_family_status text,current_relationship_status text,relationship_style text);
create table public.venue_services (id uuid primary key default gen_random_uuid(),name text,slug text,category text,updated_at timestamptz default now(),is_active boolean default true);
create table public.event_services (like public.venue_services including all);
create table public.event_amenities (like public.venue_services including all);
create table public.accessibility_attributes (like public.venue_services including all);
create table public.event_types (id uuid primary key default gen_random_uuid(),name text,sort_order integer default 0,updated_at timestamptz default now(),is_active boolean default true);
create table public.target_groups (like public.event_types including all);
create table public.professions (id uuid primary key default gen_random_uuid(),name text,slug text,updated_at timestamptz default now(),is_active boolean default true);
create table public.amenities (like public.professions including all);
create table public.event_categories (id uuid primary key default gen_random_uuid(),name text);
create table public.tag_categories (id uuid primary key default gen_random_uuid(),name text,slug text,parent_id uuid references public.tag_categories(id),level int default 0,sort_order int default 0,updated_at timestamptz default now());
create table public.marketplace_categories (id uuid primary key default gen_random_uuid(),name text,slug text,parent_id uuid references public.marketplace_categories(id),sort_order int default 0,updated_at timestamptz default now(),is_active boolean default true);
create table public.news_categories (id uuid primary key default gen_random_uuid(),name text,slug text,parent_category_id uuid references public.news_categories(id),sort_order int default 0,updated_at timestamptz default now(),is_active boolean default true);
create table public.kink_categories (id uuid primary key default gen_random_uuid(),label text,slug text,axis text,sort_order int default 0,is_active boolean default true);
create table public.kink_items (id uuid primary key default gen_random_uuid(),label text,slug text,category_id uuid references public.kink_categories(id),sort_order int default 0,is_active boolean default true);


alter table public.profiles add column identity_flags text[] default '{}';
create table public.competitions(id uuid primary key default gen_random_uuid(), category text, updated_at timestamptz default now());
create table public.marketplace_listings(id uuid primary key default gen_random_uuid(),category_id uuid,subcategory_group text,subcategory_fine text);
-- Existing classifier algorithm is unchanged; this seam supplies its classified group.
create function public.marketplace_subcategory_group(p_subcategory text,p_title text) returns text language sql immutable as $$ select p_subcategory $$;

alter table public.marketplace_listings add column department text;
alter table public.marketplace_listings add column subcategory text;
alter table public.marketplace_listings add column title text;
alter table public.marketplace_listings add column source_type text;
alter table public.marketplace_listings add column attributes jsonb;
alter table public.marketplace_listings add column taxonomy_v3_at timestamptz;
alter table public.marketplace_listings add column taxonomy_version int;
alter table public.marketplace_listings add column taxonomy_classifier_version text;
create function public.marketplace_resolve_taxonomy_group(text,text,text,jsonb) returns text language sql as $$ select $2 $$;
create function public.marketplace_subcategory_group_v3(text,text) returns text language sql as $$ select $1 $$;
create function public.marketplace_subcategory_fine(text,text) returns text language sql as $$ select null::text $$;

-- Existing legacy profile constraints are migrated as vocabularies.
alter table public.profiles add column bdsm_role text;
alter table public.profiles add constraint profiles_bdsm_role_check check (bdsm_role in ('dominant','submissive','switch','top','bottom','versatile','not_interested','prefer_not_to_say'));
alter table public.profiles add column communication_about_sex text;
alter table public.profiles add constraint profiles_communication_about_sex_check check (communication_about_sex in ('very_open','open_with_partners','private','uncomfortable','prefer_not_to_say'));
alter table public.profiles add column disability_status text;
alter table public.profiles add constraint profiles_disability_status_check check (disability_status in ('yes','no','prefer_not_to_say'));
alter table public.profiles add column family_acceptance_level text;
alter table public.profiles add constraint profiles_family_acceptance_level_check check (family_acceptance_level in ('very_supportive','supportive','neutral','unsupportive','very_unsupportive','no_contact','prefer_not_to_say'));
alter table public.profiles add column financial_situation text;
alter table public.profiles add constraint profiles_financial_situation_check check (financial_situation in ('financially_stable','getting_by','struggling','in_crisis','prefer_not_to_say'));
alter table public.profiles add column housing_situation text;
alter table public.profiles add constraint profiles_housing_situation_check check (housing_situation in ('stable_housing','temporary_housing','looking_for_housing','housing_insecure','prefer_not_to_say'));
alter table public.profiles add column immigration_status text;
alter table public.profiles add constraint profiles_immigration_status_check check (immigration_status in ('citizen','permanent_resident','temporary_resident','undocumented','prefer_not_to_say'));
alter table public.profiles add column jealousy_comfort_level text;
alter table public.profiles add constraint profiles_jealousy_comfort_level_check check (jealousy_comfort_level in ('very_comfortable','somewhat_comfortable','gets_jealous','very_jealous','depends','prefer_not_to_say'));
alter table public.profiles add column kink_experience_level text;
alter table public.profiles add constraint profiles_kink_experience_level_check check (kink_experience_level in ('none','curious','beginner','intermediate','advanced','expert','prefer_not_to_say'));
alter table public.profiles add column mental_health_openness text;
alter table public.profiles add constraint profiles_mental_health_openness_check check (mental_health_openness in ('very_open','somewhat_open','private','prefer_not_to_discuss'));
alter table public.profiles add column neurodivergent_status text;
alter table public.profiles add constraint profiles_neurodivergent_status_check check (neurodivergent_status in ('yes','no','self_diagnosed','questioning','prefer_not_to_say'));
alter table public.profiles add column physical_affection_preference text;
alter table public.profiles add constraint profiles_physical_affection_preference_check check (physical_affection_preference in ('very_affectionate','moderately_affectionate','minimal_affection','touch_averse','depends_on_relationship','prefer_not_to_say'));
alter table public.profiles add column romance_style text;
alter table public.profiles add constraint profiles_romance_style_check check (romance_style in ('very_romantic','somewhat_romantic','practical','anti_romantic','depends_on_partner','prefer_not_to_say'));
alter table public.profiles add column sexual_exploration_openness text;
alter table public.profiles add constraint profiles_sexual_exploration_openness_check check (sexual_exploration_openness in ('very_open','somewhat_open','selective','not_interested','prefer_not_to_say'));
alter table public.profiles add column sexual_frequency_preference text;
alter table public.profiles add constraint profiles_sexual_frequency_preference_check check (sexual_frequency_preference in ('multiple_times_daily','daily','few_times_week','weekly','few_times_month','monthly','rarely','asexual','depends','prefer_not_to_say'));
alter table public.profiles add column sexual_health_status text;
alter table public.profiles add constraint profiles_sexual_health_status_check check (sexual_health_status in ('recently_tested_clean','regularly_tested','prefer_not_to_discuss','will_discuss_privately'));
alter table public.profiles add column workplace_safety text;
alter table public.profiles add constraint profiles_workplace_safety_check check (workplace_safety in ('completely_out','partially_out','not_out','unsafe_to_be_out','not_applicable','prefer_not_to_say'));

create table public.organizations(id uuid primary key default gen_random_uuid(),roles text[] not null default '{}');
