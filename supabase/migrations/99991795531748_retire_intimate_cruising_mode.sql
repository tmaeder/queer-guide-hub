-- Phase 6 of docs/plans/2026-11-24-meet-dating-identity-design.md: retire the
-- old cruising presence store now that one live switch (99991795531392) owns
-- presence in user_presence_location.
--
-- Measured on prod before writing (2026-11-24): intimate_cruising_mode holds
-- 1 row, expired 2026-10-07, 0 active; its safety acknowledgement was copied
-- to intimate_profiles by phase 5. No client, edge function or worker reads
-- the table or calls cruising_presence_set any more.
--
-- Readers patched from their live bodies (exact-count anchors, never
-- restated): merge_cities and unmerge_cities carry the table in their
-- reparent list; run_review_automatic_resolution, review_inactive_city_unlinked
-- and admin_review_city_context count it as a city link. unmerge_cities only
-- replays tables in its list, so old audits that recorded this table stay
-- replayable for every other table.
--
-- Also drops intimate_profiles.limits: 0 rows ever held a value, nothing reads
-- or writes it (hard limits live in the kink grid, which keeps its own
-- visibility tiers), and it was readable by every opted-in member while the UI
-- promised "never shown".

-- Soft preconditions: an anchor already gone means another change got there
-- first; only a count that is neither 0 nor the expected one aborts.
do $patch$
declare
  r record;
  v_src text;
  v_n int;
begin
  for r in
    select * from (values
      ('api_private.merge_cities(uuid,uuid,boolean)',
       $a$    'intimate_cruising_mode','city_id','user_id',
$a$, $b$$b$, 1),
      ('public.unmerge_cities(uuid,boolean)',
       $a$    'intimate_cruising_mode','city_id','user_id',
$a$, $b$$b$, 1),
      ('api_private.run_review_automatic_resolution(integer,boolean)',
       $a$ union all select city_id from public.intimate_cruising_mode$a$, $b$$b$, 1),
      ('api_private.review_inactive_city_unlinked(uuid)',
       $a$
 or exists(select 1 from public.intimate_cruising_mode where city_id=p_id)$a$, $b$$b$, 1),
      ('api_private.admin_review_city_context(uuid)',
       $a$+
    (select count(*)from public.intimate_cruising_mode where city_id=c.id)$a$, $b$$b$, 1)
    ) as t(fn, v_from, v_to, expected)
  loop
    v_src := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_src) - length(replace(v_src, r.v_from, ''))) / length(r.v_from);
    if v_n = 0 then
      raise notice '% no longer references intimate_cruising_mode; skipping', r.fn;
      continue;
    end if;
    if v_n <> r.expected then
      raise exception '%: expected % anchor(s), found %', r.fn, r.expected, v_n;
    end if;
    execute replace(v_src, r.v_from, r.v_to);
  end loop;
end
$patch$;

-- The dating map counts one store again.
create or replace function api_private.cruising_presence_areas()
returns table(city_id uuid, city_name text, city_slug text, latitude double precision, longitude double precision, active_count bigint)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.is_intimate_eligible(v_uid) then
    return;
  end if;

  return query
  select
    c.id,
    c.name,
    c.slug,
    c.latitude::double precision,
    c.longitude::double precision,
    count(distinct upl.user_id)::bigint
  from public.user_presence_location upl
  join public.intimate_profiles ip on ip.id = upl.user_id
  join public.cities c on c.id = upl.city_id
  where upl.dating_visible
    and upl.expires_at > now()
    and ip.opted_in_at is not null
    and ip.moderation_status = 'approved'
    and c.latitude is not null
    and c.longitude is not null
    and upl.user_id <> v_uid
    and not public.intimate_is_blocked(v_uid, upl.user_id)
    and not api_private.test_account_hidden(upl.user_id)
  group by c.id, c.name, c.slug, c.latitude, c.longitude
  order by count(distinct upl.user_id) desc, c.name;
end
$function$;

drop function if exists public.cruising_presence_set(boolean, uuid, integer, boolean);
drop function if exists api_private.cruising_presence_set(boolean, uuid, integer, boolean);
drop table if exists public.intimate_cruising_mode;
alter table public.intimate_profiles drop column if exists limits;

do $verify$
declare
  v_fn text;
begin
  if to_regclass('public.intimate_cruising_mode') is not null then
    raise exception 'intimate_cruising_mode still exists';
  end if;
  if exists (select 1 from pg_proc where proname = 'cruising_presence_set') then
    raise exception 'cruising_presence_set still exists';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'intimate_profiles' and column_name = 'limits') then
    raise exception 'intimate_profiles.limits still exists';
  end if;
  for v_fn in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'api_private')
      and position('intimate_cruising_mode' in
            regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')) > 0
  loop
    raise exception '% still references intimate_cruising_mode', v_fn;
  end loop;
  if position('user_presence_location' in
       regexp_replace(pg_get_functiondef('api_private.cruising_presence_areas()'::regprocedure),
                      '--[^' || chr(10) || ']*', '', 'g')) = 0 then
    raise exception 'cruising_presence_areas lost its presence source';
  end if;
end
$verify$;
