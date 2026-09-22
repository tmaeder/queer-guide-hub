begin;

-- Messaging intentionally reads a participant's short-lived public vibe. Keep
-- these three display fields inside the authenticated column allowlist while
-- retaining the ban on table-wide profile SELECT.
create or replace function public.profiles_column_exposure()
returns table(kind text, object_name text, grantee text, detail text)
language sql stable security definer
set search_path=''
as $$
  select 'table_grant'::text,'public.profiles'::text,
    case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,
    'table-wide SELECT subsumes the column allowlist'::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  cross join lateral pg_catalog.aclexplode(c.relacl) a
  where c.relname='profiles' and a.privilege_type='SELECT'
    and (a.grantee=0 or a.grantee::regrole::text in ('anon','authenticated'))

  union all

  select 'column_grant'::text,'public.profiles.'||att.attname,
    case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,
    'column granted outside the '||
      case when a.grantee=0 then 'anon' else a.grantee::regrole::text end||
      ' allowlist'::text
  from pg_catalog.pg_attribute att
  join pg_catalog.pg_class c on c.oid=att.attrelid and c.relname='profiles'
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  cross join lateral pg_catalog.aclexplode(att.attacl) a
  where a.privilege_type='SELECT'
    and (a.grantee=0 or a.grantee::regrole::text in ('anon','authenticated'))
    and att.attname <> all (
      case when a.grantee<>0 and a.grantee::regrole::text='authenticated'
        then array[
          'availability_tags','avatar_url','bio','created_at','display_name','dnd_until','id',
          'is_business','last_active_at','last_seen_at','location','presence_visibility',
          'status_emoji','status_expires_at','status_text','travel_mode','user_id','user_mode',
          'username','verified_identity','website','age_range','education','gender_identity',
          'has_children','has_pets','interests','occupation','pronouns','relationship_status',
          'onboarding_completed_at','body_type','height_cm','moderation_status',
          'privacy_settings','sexual_orientation','social_links','updated_at',
          'vibe_emoji','vibe_text','vibe_expires_at']
        else array[
          'id','user_id','username','display_name','avatar_url','website','user_mode',
          'is_business','verified_identity','bio','location','created_at','last_active_at',
          'last_seen_at','status_emoji','status_text','status_expires_at','availability_tags',
          'dnd_until','travel_mode','presence_visibility']
      end)

  union all

  select 'definer_view'::text,'public.'||v.relname,
    case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,
    'view over profiles without security_invoker bypasses the column allowlist'::text
  from pg_catalog.pg_class v
  join pg_catalog.pg_namespace vn on vn.oid=v.relnamespace and vn.nspname='public'
  join pg_catalog.pg_rewrite rw on rw.ev_class=v.oid
  join pg_catalog.pg_depend d on d.objid=rw.oid
    and d.classid='pg_catalog.pg_rewrite'::regclass
    and d.refobjid='public.profiles'::regclass
  cross join lateral pg_catalog.aclexplode(v.relacl) a
  where v.relkind='v' and a.privilege_type='SELECT'
    and (a.grantee=0 or a.grantee::regrole::text in ('anon','authenticated'))
    and coalesce((select option_value from pg_catalog.pg_options_to_table(v.reloptions)
      where option_name='security_invoker'),'false') not in ('true','on','1');
$$;

revoke all on function public.profiles_column_exposure() from public,anon,authenticated;
grant execute on function public.profiles_column_exposure() to service_role;

-- This is a maintenance backfill, never a public API endpoint.
revoke all on function public.marketplace_taxonomy_v3_backfill(integer)
  from public,anon,authenticated;
grant execute on function public.marketplace_taxonomy_v3_backfill(integer) to service_role;

commit;
