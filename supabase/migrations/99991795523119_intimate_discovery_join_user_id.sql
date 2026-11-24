-- Dating discovery returned nobody, to anybody.
--
-- intimate_profiles.id is the auth user id. profiles.id is a separate surrogate
-- key; the auth user id lives in profiles.user_id. Both discovery read paths
-- joined `p.id = ip.id`, which matched 0 rows on prod (2026-11-24: 20 approved,
-- opted-in intimate profiles; 0 rows from intimate_discovery_v; 0 profiles with
-- id = user_id). That is why /meet/dating showed no people and there were 0
-- likes and 0 matches ever.
--
-- Fix: join on p.user_id. Exactly these two objects carried the wrong join
-- (searched every function, view and policy that mentions intimate_profiles).
--
-- Second defect, hidden behind the first: intimate_discover declares
-- `height_cm integer` but selects intimate_profiles.height_cm, a smallint, so
-- the first row it ever returned would raise 42804 ("Returned type smallint does
-- not match expected type integer in column 9"). Found by the dry run of this
-- file; it could never fire while the join matched nothing. Cast in the select.
--
-- The view is security_invoker; CREATE OR REPLACE VIEW resets reloptions, so the
-- option is restated and asserted. Column list and grants are unchanged.

create or replace view public.intimate_discovery_v
with (security_invoker = on) as
select
  ip.id as user_id,
  p.display_name,
  p.avatar_url,
  ip.discovery_city_id,
  ip.role,
  ip.into_tags,
  ip.body_type,
  ip.age_band,
  ip.height_cm,
  ip.last_active_at
from public.intimate_profiles ip
join public.profiles p on p.user_id = ip.id
where ip.opted_in_at is not null
  and ip.moderation_status = 'approved';

-- Patch the RPC body in place rather than restating it: the live body is the
-- source of truth. Soft precondition: a body already fixed is left alone.
do $patch$
declare
  v_src text := pg_get_functiondef('api_private.intimate_discover'::regproc);
  v_from constant text := 'join public.profiles p on p.id = ip.id';
  v_to constant text := 'join public.profiles p on p.user_id = ip.id';
begin
  if position(v_from in v_src) > 0 then
    v_src := replace(v_src, v_from, v_to);
  end if;
  if position('ip.height_cm::integer' in v_src) = 0 then
    v_src := replace(v_src, '    ip.height_cm,', '    ip.height_cm::integer,');
  end if;
  execute v_src;
end
$patch$;

do $verify$
declare
  v_src text := pg_get_functiondef('api_private.intimate_discover'::regproc);
  v_view text := pg_get_viewdef('public.intimate_discovery_v'::regclass);
begin
  if position('p.user_id = ip.id' in v_src) = 0 or position('p.id = ip.id' in v_src) > 0 then
    raise exception 'intimate_discover still joins profiles on the wrong key';
  end if;
  if position('ip.height_cm::integer' in v_src) = 0 then
    raise exception 'intimate_discover still returns smallint height_cm as integer';
  end if;
  if position('p.user_id = ip.id' in v_view) = 0 then
    raise exception 'intimate_discovery_v still joins profiles on the wrong key';
  end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.intimate_discovery_v'::regclass
      and 'security_invoker=on' = any (coalesce(reloptions, '{}'))
  ) then
    raise exception 'intimate_discovery_v lost security_invoker';
  end if;
  if has_table_privilege('anon', 'public.intimate_discovery_v', 'select') then
    raise exception 'intimate_discovery_v is readable by anon';
  end if;
end
$verify$;
