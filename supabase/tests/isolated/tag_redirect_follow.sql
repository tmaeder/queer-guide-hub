-- Behavioural check for 99991792772705: run against a THROWAWAY database
-- (psql -d scratch -f supabase/tests/isolated/tag_redirect_follow.sql). Builds minimal
-- tables plus prod's validate trigger, applies the migration, asserts merge/rename/
-- delete behaviour and that the human_reviewed guard stays on. Prints ALL PASS.
\set ON_ERROR_STOP 1
create role anon; create role authenticated;
do $$ declare t text; begin
  foreach t in array array['personalities','cities','countries','queer_villages','venues','organizations','events','hotels'] loop
    execute format('create table public.%I (id uuid primary key default gen_random_uuid(), slug text, duplicate_of_id uuid)', t);
  end loop;
end $$;
create table public.community_groups (id uuid primary key default gen_random_uuid(), duplicate_of_id uuid);
create table public.unified_tags (
  id uuid primary key default gen_random_uuid(), slug text, publication_role text,
  canonical_entity_type text, canonical_entity_id uuid, canonical_entity_path text,
  canonical_entity_reviewed_at timestamptz, human_reviewed boolean default false,
  publication_role_review_note text);
create table public.tag_change_log (tag_id uuid, action_type text, before_data jsonb, after_data jsonb, actor text);

-- prod's validate_tag_entity_target, verbatim
CREATE OR REPLACE FUNCTION public.validate_tag_entity_target()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare v_expected_path text;
begin
  if new.publication_role <> 'entity_redirect' then
    new.canonical_entity_type := null; new.canonical_entity_id := null;
    new.canonical_entity_path := null; new.canonical_entity_reviewed_at := null;
    return new;
  end if;
  if new.canonical_entity_type is null or new.canonical_entity_id is null
     or new.canonical_entity_path is null then
    raise exception 'An entity redirect requires a reviewed type, ID, and path' using errcode='23514';
  end if;
  v_expected_path := case new.canonical_entity_type
    when 'personality' then (select '/personalities/'||x.slug from public.personalities x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'city' then (select '/city/'||x.slug from public.cities x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'country' then (select '/country/'||x.slug from public.countries x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'village' then (select '/villages/'||x.slug from public.queer_villages x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'venue' then (select '/venues/'||x.slug from public.venues x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'organization' then (select '/organizations/'||x.slug from public.organizations x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'event' then (select '/events/'||x.slug from public.events x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'hotel' then (select '/hotels/'||x.slug from public.hotels x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
    when 'community_group' then (select '/groups/'||x.id::text from public.community_groups x where x.id=new.canonical_entity_id and x.duplicate_of_id is null)
  end;
  if v_expected_path is null then
    raise exception 'Canonical entity target does not exist or is a duplicate' using errcode='23503';
  end if;
  if new.canonical_entity_path <> v_expected_path then
    raise exception 'Canonical entity path % does not match target %', new.canonical_entity_path, v_expected_path using errcode='23514';
  end if;
  new.canonical_entity_reviewed_at := coalesce(new.canonical_entity_reviewed_at, now());
  return new;
end $function$;
create trigger zy_validate_tag_entity_target before insert or update on public.unified_tags
  for each row execute function public.validate_tag_entity_target();

-- prod's human_reviewed guard (reduced to the guard itself)
create or replace function public.log_unified_tag_change() returns trigger language plpgsql as $f$
declare v_actor text := coalesce(current_setting('app.actor', true), 'system:trigger');
begin
  if tg_op = 'UPDATE' and old.human_reviewed and v_actor like 'system:%' then
    raise exception 'human_reviewed tag % cannot be modified by %', old.id, v_actor;
  end if;
  insert into tag_change_log values (coalesce(new.id, old.id), tg_op, null, null, v_actor);
  return coalesce(new, old);
end $f$;
create trigger trg_log after insert or update on public.unified_tags for each row execute function public.log_unified_tag_change();

\ir ../../migrations/99991792772705_tag_redirect_follows_entity_merge.sql

-- fixtures
insert into personalities(id, slug) values ('00000000-0000-0000-0000-000000000001','old-p'), ('00000000-0000-0000-0000-000000000002','surv-p');
insert into venues(id, slug) values ('00000000-0000-0000-0000-000000000011','v1');
insert into cities(id, slug) values ('00000000-0000-0000-0000-000000000021','c1');
insert into community_groups(id) values ('00000000-0000-0000-0000-000000000031');
insert into unified_tags(slug, publication_role, canonical_entity_type, canonical_entity_id, canonical_entity_path, human_reviewed) values
  ('t-p', 'entity_redirect', 'personality', '00000000-0000-0000-0000-000000000001', '/personalities/old-p', true),
  ('t-v', 'entity_redirect', 'venue', '00000000-0000-0000-0000-000000000011', '/venues/v1', false),
  ('t-c', 'entity_redirect', 'city', '00000000-0000-0000-0000-000000000021', '/city/c1', false),
  ('t-g', 'entity_redirect', 'community_group', '00000000-0000-0000-0000-000000000031', '/groups/00000000-0000-0000-0000-000000000031', false);

-- 1. merge (human_reviewed tag; caller transaction has no actor set)
update personalities set duplicate_of_id = '00000000-0000-0000-0000-000000000002' where slug = 'old-p';
do $$ begin
  assert (select canonical_entity_path from unified_tags where slug='t-p') = '/personalities/surv-p', 'merge: path not repointed';
  assert (select canonical_entity_id from unified_tags where slug='t-p') = '00000000-0000-0000-0000-000000000002', 'merge: id not repointed';
  assert current_setting('app.actor', true) is distinct from 'derived:tag-redirect-follow', 'actor leaked';
end $$;
-- the redirect tag is editable again
update unified_tags set slug = 't-p' where slug = 't-p';

-- 2. slug rename
update venues set slug = 'v1-renamed' where slug = 'v1';
do $$ begin assert (select canonical_entity_path from unified_tags where slug='t-v') = '/venues/v1-renamed', 'rename: path not updated'; end $$;

-- 3. unchanged slug in statement does not touch tags
update venues set slug = 'v1-renamed';

-- 4. delete demotes
delete from cities where slug = 'c1';
do $$ begin
  assert (select publication_role from unified_tags where slug='t-c') = 'utility', 'delete: not demoted';
  assert (select canonical_entity_id from unified_tags where slug='t-c') is null, 'delete: target not cleared';
end $$;

-- 5. community_group merge into a missing survivor demotes
update community_groups set duplicate_of_id = '00000000-0000-0000-0000-0000000000ff';
do $$ begin assert (select publication_role from unified_tags where slug='t-g') = 'utility', 'group: not demoted'; end $$;

-- 6. human_reviewed guard still on for later writes in the same transaction
begin;
update personalities set slug = 'surv-p2' where slug = 'surv-p';
do $$ begin assert (select canonical_entity_path from unified_tags where slug='t-p') = '/personalities/surv-p2', 'survivor rename not followed'; end $$;
do $$ begin
  begin
    update unified_tags set publication_role_review_note = 'x' where slug = 't-p';
    raise exception 'guard disabled after trigger';
  exception when raise_exception then
    if sqlerrm like 'guard disabled%' then raise; end if;
  end;
end $$;
rollback;

select 'ALL PASS';
