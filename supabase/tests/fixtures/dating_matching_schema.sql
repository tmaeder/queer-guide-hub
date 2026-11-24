-- Minimal isolated PostgreSQL contract fixture. No production data or secrets.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
create table public.profiles(id uuid primary key,user_id uuid unique references auth.users,display_name text,avatar_url text,
  date_of_birth date,moderation_status text default 'approved',gender_identity text,relationship_style text,current_relationship_status text,
  looking_for text[] default '{}',interests jsonb default '[]',hobbies text[] default '{}',identity_flags text[] default '{}',travel_mode jsonb,privacy_settings jsonb default '{"profile_visibility":"community"}',
  age_range text,last_active_at timestamptz default now());
create table public.intimate_profiles(id uuid primary key references public.profiles(user_id),opted_in_at timestamptz,consent_18plus_at timestamptz,
  dating_prefs jsonb default '{}',moderation_status text default 'approved',discovery_active_until timestamptz,discovery_city_id uuid,role text[] default '{}',
  into_tags text[] default '{}',limits text[] default '{}',safer_sex_prefs text[] default '{}',height_cm smallint,body_type text,genitalia text,age_band text,last_active_at timestamptz default now());
alter table public.intimate_profiles enable row level security;
create table public.user_discovery_safety_state(user_id uuid,shield_status text);
create table public.user_travel_preferences(user_id uuid primary key,home_city_id uuid);
create table public.cities(id uuid primary key,latitude numeric,longitude numeric);
create table public.blocks(a uuid,b uuid);
create table public.user_relationships(user_id uuid,target_user_id uuid,relationship_type text,status text);
create table public.intimate_likes(actor_id uuid,target_id uuid,created_at timestamptz default now(),primary key(actor_id,target_id));
create table public.intimate_passes(actor_id uuid,target_id uuid,primary key(actor_id,target_id));
create table public.kink_items(id uuid primary key,slug text,is_active boolean default true,unified_tag_slug text,category_id uuid);
create table public.kink_ratings(user_id uuid,item_id uuid,side text,rating text);
create table public.user_hanky_signals(user_id uuid,variant_id uuid,side text,revoked_at timestamptz,visibility text default 'members_adult');
create table public.cultural_variants(id uuid primary key,status text);
create table public.user_cultural_preferences(user_id uuid,line_node_ids uuid[],followed_node_ids uuid[]);
create table public.couple_links(id uuid primary key,user_a_id uuid,user_b_id uuid,status text,revoked_at timestamptz);
create table public.couple_link_members(couple_link_id uuid,user_id uuid,joint_discovery_enabled boolean,discovery_mode text);
create table public.dating_discovery_preferences(user_id uuid,accept_couple_profiles boolean);
create table public.wing_pairs(id uuid primary key,wing_id uuid,principal_id uuid,status text,revoked_at timestamptz);
create table public.wing_recommendations(wing_pair_id uuid,wing_id uuid,principal_id uuid,candidate_id uuid,note text);
create function public.profile_id_for_uid(uuid) returns uuid language sql stable security definer as $$select id from public.profiles where user_id=$1$$;
create function public.profile_uid_for_id(uuid) returns uuid language sql stable security definer as $$select user_id from public.profiles where id=$1$$;
create function public.is_intimate_eligible_uid(uuid) returns boolean language sql stable security definer as $$select coalesce((select opted_in_at is not null and consent_18plus_at is not null and moderation_status='approved' from public.intimate_profiles where id=$1),false)$$;
create function public.is_blocked(uuid,uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.blocks where (a=$1 and b=$2) or(a=$2 and b=$1))$$;
create function public.social_feature_enabled(text) returns boolean language sql stable as $$select true$$;
create function public.social_result_error(text,text) returns jsonb language sql as $$select jsonb_build_object('ok',false,'error',jsonb_build_object('code',$1,'message',$2))$$;
create function public.social_result_ok(jsonb) returns jsonb language sql as $$select jsonb_build_object('ok',true,'data',$1)$$;
create function public.social_receipt_get(text,text) returns jsonb language sql as $$select null::jsonb$$;
create function public.social_receipt_put(text,text,jsonb) returns jsonb language sql as $$select $3$$;
create function public.people_discovery(uuid,text,uuid default null,uuid default null,uuid default null,int default 60,int default 5000)
returns table(user_id uuid,score int,shared jsonb) language sql as $$select null::uuid,42,'{}'::jsonb where false$$;
create policy fixture_existing_optin_read on public.intimate_profiles for select to authenticated using(
  id=auth.uid() or (opted_in_at is not null and moderation_status='approved' and public.is_intimate_eligible_uid(auth.uid())));
grant select on public.profiles,public.intimate_profiles to authenticated;

create table public.kink_category_visibility(user_id uuid,category_id uuid,tier text);
