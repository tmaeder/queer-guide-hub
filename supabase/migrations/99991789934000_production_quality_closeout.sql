-- Close the final production quality issues measured on 2026-09-21.

set local statement_timeout = '600s';

-- Messaging asks for these public presence fields through the
-- conversation_participants -> profiles relationship. The table already has
-- an authenticated SELECT policy, but these three newer columns never received
-- the column privilege granted to the older public-profile fields. Keep this a
-- column grant: profiles also contains private health/contact data that must not
-- become broadly selectable.
grant select (vibe_emoji, vibe_text, vibe_expires_at)
  on table public.profiles to authenticated;

-- Opening one bell item should clear that exact item. Feed ids originate from
-- either notifications or group_notifications; updating both is safe because
-- ownership is checked in each predicate and UUID collisions merely clear two
-- alerts that belong to the same caller.
create or replace function public.mark_inbox_alert_read(p_item uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.notifications
     set read = true
   where id = p_item
     and user_id = auth.uid()
     and read = false;

  update public.group_notifications
     set read_at = now()
   where id = p_item
     and user_id = auth.uid()
     and read_at is null;
end;
$function$;

revoke all on function public.mark_inbox_alert_read(uuid) from public, anon;
grant execute on function public.mark_inbox_alert_read(uuid) to authenticated;

-- The nightly category reconciler historically repaired only the text mirror.
-- Repair category_id too, one tag per UPDATE: the existing category triggers
-- can re-enter a tuple during a set-based update, while this established
-- per-row shape is safe. The junction remains the source of truth.
create or replace function public.run_tag_category_resync(p_batch integer default 500)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_ids int := 0;
  v_text int := 0;
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'admin:tag-category-resync', true);

  for r in
    select u.id, want.category_id
      from public.unified_tags u
      cross join lateral (
        select a.category_id
          from public.tag_category_assignments a
          join public.tag_categories tc on tc.id = a.category_id
         where a.tag_id = u.id
         order by a.is_primary desc nulls last,
                  tc.level desc,
                  a.created_at asc,
                  a.category_id
         limit 1
      ) want
     where u.category_id is null
     order by u.id
     limit greatest(p_batch, 0)
  loop
    update public.unified_tags
       set category_id = r.category_id,
           updated_at = now()
     where id = r.id
       and category_id is null;
    if found then v_ids := v_ids + 1; end if;
  end loop;

  with diff as (
    select u.id, w.want
      from public.unified_tags u
      cross join lateral (select public.tag_category_mirror_want(u.id) as want) w
     where w.want is not null
       and u.category is distinct from w.want
     limit greatest(p_batch, 0)
  )
  update public.unified_tags u
     set category = d.want
    from diff d
   where u.id = d.id;

  get diagnostics v_text = row_count;
  return v_ids + v_text;
end;
$function$;

comment on function public.run_tag_category_resync(integer) is
  'Reconciles unified_tags.category_id and category from tag_category_assignments. Runs nightly; category_id writes are intentionally per-row to avoid category-trigger tuple re-entry.';

revoke all on function public.run_tag_category_resync(integer) from public, anon, authenticated;
grant execute on function public.run_tag_category_resync(integer) to service_role;

select public.run_tag_category_resync(5000);

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.unified_tags u
   where u.category_id is null
     and exists (
       select 1 from public.tag_category_assignments a where a.tag_id = u.id
     );
  if v_bad <> 0 then
    raise exception '% tag category_id mirrors remain empty', v_bad;
  end if;

  if not has_column_privilege('authenticated', 'public.profiles', 'vibe_emoji', 'SELECT')
     or not has_column_privilege('authenticated', 'public.profiles', 'vibe_text', 'SELECT')
     or not has_column_privilege('authenticated', 'public.profiles', 'vibe_expires_at', 'SELECT') then
    raise exception 'authenticated messaging presence grants are incomplete';
  end if;

  if has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    raise exception 'profiles received a table-wide SELECT grant';
  end if;
end
$verify$;
