-- Admin-initiated account deletion and anonymisation.
--
-- WHAT WAS WRONG: /admin/users renders the shared data-table bulk bar with
-- `tableName: 'profiles'`, so "Delete" issued a raw PostgREST
-- `DELETE FROM profiles WHERE id IN (...)`. That is the wrong door. The GDPR
-- path `delete_my_account` exists precisely because this table has NO-ACTION FK
-- blockers that must be cleared first (trip_members, events.created_by,
-- review_queue.resolved_by, group_invites.accepted_by), storage objects with no
-- FK at all, and an `auth.users` row a table delete never touches. A bare
-- delete either errors on the FKs or half-succeeds and orphans the auth user.
--
-- There was also no admin-initiated deletion RPC of any kind: `delete_my_account`
-- is self-only (`auth.uid() <> p_user_id` -> 42501).
--
-- THE ERASURE LOGIC IS NOT DUPLICATED. `delete_my_account`'s body moves into
-- `_delete_user_data_core` verbatim and both wrappers call it, so the self-serve
-- GDPR path and the admin path can never drift into deleting different sets of
-- tables. `delete_my_account` keeps its exact signature, guard and return shape.

-- ---------------------------------------------------------------------------
-- 1) Shared audit table (Phase A of the archive/delete work reuses this).
-- ---------------------------------------------------------------------------
create table if not exists public.admin_lifecycle_audit (
  id            bigserial primary key,
  entity_type   text        not null,
  entity_id     uuid        not null,
  action        text        not null check (action in ('archive','restore','delete','anonymize')),
  actor         uuid,
  reason        text,
  -- Full pre-state, for content deletes only. DELIBERATELY NULL for the two
  -- user actions below: a snapshot of a deleted account's row would preserve
  -- exactly the personal data the deletion exists to erase, and would do it in
  -- a table nobody thinks of as personal. GDPR Art. 17 is not satisfied by
  -- moving the data sideways.
  row_snapshot  jsonb,
  -- Non-personal proof-of-work: row counts, which tables were touched.
  details       jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  restored_at   timestamptz
);

create index if not exists admin_lifecycle_audit_entity_idx
  on public.admin_lifecycle_audit (entity_type, entity_id, created_at desc);
create index if not exists admin_lifecycle_audit_recent_idx
  on public.admin_lifecycle_audit (created_at desc);

comment on table public.admin_lifecycle_audit is
  'Admin archive/restore/delete/anonymize log. row_snapshot is populated for content deletes so they can be restored; it is ALWAYS NULL for user delete/anonymize, because retaining the row there would defeat the erasure.';

alter table public.admin_lifecycle_audit enable row level security;
revoke all on public.admin_lifecycle_audit from public, anon;
grant select on public.admin_lifecycle_audit to authenticated;
grant all on public.admin_lifecycle_audit to service_role;
grant usage, select on sequence public.admin_lifecycle_audit_id_seq to service_role;

drop policy if exists admin_lifecycle_audit_read on public.admin_lifecycle_audit;
create policy admin_lifecycle_audit_read on public.admin_lifecycle_audit
  for select to authenticated
  using (public.has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]));

-- ---------------------------------------------------------------------------
-- 2) The erasure core — the body of delete_my_account, minus its self-only
--    guard. service_role/internal only; the guards live in the wrappers.
-- ---------------------------------------------------------------------------
create or replace function public._delete_user_data_core(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_profiles int := 0;
begin
  -- Tier 0 — clear NO-ACTION FK blockers. Without these the profiles delete
  -- errors instead of cascading, which is the specific failure a raw
  -- `DELETE FROM profiles` walks into.
  delete from trip_members           where user_id = p_user_id;
  update events               set created_by = null where created_by = p_user_id;
  update marketplace_listings set created_by = null where created_by = p_user_id;
  update venues               set created_by = null where created_by = p_user_id;
  update review_queue         set resolved_by = null where resolved_by = p_user_id;
  update group_invites        set accepted_by = null where accepted_by = p_user_id;
  -- Tier 1 — personal rows with no FK back to profiles.
  delete from access_logs            where user_id = p_user_id;
  delete from calendar_feed_tokens   where user_id = p_user_id;
  delete from city_favorites         where user_id = p_user_id;
  delete from contact_submissions    where user_id = p_user_id;
  delete from country_favorites      where user_id = p_user_id;
  delete from event_favorites        where user_id = p_user_id;
  delete from import_audit_log       where user_id = p_user_id;
  delete from import_jobs_enhanced   where user_id = p_user_id;
  delete from news_favorites         where user_id = p_user_id;
  delete from notifications          where user_id = p_user_id;
  delete from push_notification_logs where user_id = p_user_id;
  delete from search_queries         where user_id = p_user_id;
  delete from tag_favorites          where user_id = p_user_id;
  delete from user_photos            where user_id = p_user_id;
  delete from user_push_tokens       where user_id = p_user_id;
  delete from user_sessions          where user_id = p_user_id;
  delete from venue_checkins         where user_id = p_user_id;
  delete from venue_favorites        where user_id = p_user_id;
  delete from profiles_audit_log     where profile_user_id = p_user_id;
  -- Tiers 2/3 — keep the audit/catalog row, drop the link to the person.
  update community_groups    set created_by  = null where created_by  = p_user_id;
  update organizations       set claimed_by  = null where claimed_by  = p_user_id;
  update videos              set created_by  = null where created_by  = p_user_id;
  update ingestion_staging   set reviewed_by = null where reviewed_by = p_user_id;
  update tag_suggestions     set reviewed_by = null where reviewed_by = p_user_id;
  update news_feedback_events set actor_id   = null where actor_id    = p_user_id;
  update profiles_audit_log  set accessing_user_id = null where accessing_user_id = p_user_id;
  update role_audit_logs     set performed_by   = null where performed_by   = p_user_id;
  update role_audit_logs     set target_user_id = null where target_user_id = p_user_id;
  update role_audit_logs     set user_id        = null where user_id        = p_user_id;
  update user_role_audit_log set admin_user_id  = null where admin_user_id  = p_user_id;
  update user_role_audit_log set target_user_id = null where target_user_id = p_user_id;
  update security_events      set user_id        = null where user_id        = p_user_id;
  update security_monitoring  set user_id        = null where user_id        = p_user_id;
  update security_monitoring  set target_user_id = null where target_user_id = p_user_id;
  update suspicious_activities set user_id       = null where user_id        = p_user_id;
  delete from profiles where user_id = p_user_id;
  get diagnostics v_profiles = row_count;
  return jsonb_build_object('user_id', p_user_id, 'deleted_at', now(), 'profile_deleted', v_profiles);
end; $function$;

revoke all on function public._delete_user_data_core(uuid) from public, anon, authenticated;
grant execute on function public._delete_user_data_core(uuid) to service_role;

comment on function public._delete_user_data_core(uuid) is
  'Table-level erasure for one account. NO authorization check — callers must gate. Wrappers: delete_my_account (self-only) and admin_delete_user (admin-only).';

-- Self-serve GDPR path, unchanged in signature, guard and return shape.
create or replace function public.delete_my_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public._delete_user_data_core(p_user_id);
end; $function$;

-- ---------------------------------------------------------------------------
-- 3) Admin deletion.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_user(p_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
  v_actor  uuid := auth.uid();
begin
  perform public.assert_admin_or_internal();

  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;

  -- Deleting an admin from this screen is refused rather than confirmed away:
  -- it is the one deletion that can lock everyone out of the console, and it
  -- is never the routine case this button exists for. Demote first, which is
  -- a reversible action that leaves a role_audit_logs trail.
  if exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'::app_role
  ) then
    raise exception 'refusing to delete an account holding the admin role — remove the role first'
      using errcode = '42501';
  end if;

  -- Self-deletion belongs to the account owner, through the flow that asks
  -- them to re-type their username. An admin deleting themselves here would
  -- also destroy the session performing the delete.
  if v_actor is not null and v_actor = p_user_id then
    raise exception 'use the account settings flow to delete your own account'
      using errcode = '42501';
  end if;

  v_result := public._delete_user_data_core(p_user_id);

  -- Personal-data-free proof of deletion. No row_snapshot: see the table comment.
  insert into public.admin_lifecycle_audit (entity_type, entity_id, action, actor, reason, details)
  values ('user', p_user_id, 'delete', v_actor, p_reason, v_result);

  return v_result;
end; $function$;

revoke all on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated, service_role;

comment on function public.admin_delete_user(uuid, text) is
  'Admin-initiated account erasure. Clears the same tables as the GDPR self-serve path (shared core). Does NOT remove storage objects or the auth.users row — the admin-delete-user edge function does that, mirroring delete-account.';

-- ---------------------------------------------------------------------------
-- 4) Anonymisation — keep the row, remove the person.
--
-- DENY-BY-DEFAULT, and that is the whole point. `public.profiles` has ~180
-- columns and the great majority are intensely personal on this platform in
-- particular: sexual_orientation, gender_identity, coming_out_status,
-- family_acceptance_level, workplace_safety, immigration_status,
-- disability_status, sexual_health_status, kink_interests, bdsm_role,
-- emergency_contact_*, date_of_birth, and the *_encrypted twins of several.
--
-- A hand-maintained list of "columns to scrub" over that surface WILL fall
-- behind the schema, and the failure mode is not a cosmetic leftover — leaving
-- `coming_out_status` or `immigration_status` on a supposedly anonymised
-- profile is an outing or a safety risk. So the list that is maintained by hand
-- is the SHORT one of columns to KEEP, and every other column is reset. A newly
-- added column is scrubbed by default; forgetting to update this function is
-- safe rather than harmful.
-- ---------------------------------------------------------------------------
create or replace function public.admin_anonymize_user(p_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor    uuid := auth.uid();
  v_keep     text[] := array[
    'id',                 -- identity of the row itself
    'user_id',            -- FK target; the account still exists
    'created_at',
    'updated_at',
    'moderation_status'   -- a ban must survive anonymisation
  ];
  v_col      record;
  v_sets     text[] := '{}';
  v_skipped  text[] := '{}';
  v_sql      text;
  v_count    int := 0;
begin
  perform public.assert_admin_or_internal();

  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'no profile for user %', p_user_id using errcode = 'P0002';
  end if;

  for v_col in
    select c.column_name, c.is_nullable, c.column_default
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and not (c.column_name = any (v_keep))
    order by c.ordinal_position
  loop
    if v_col.is_nullable = 'YES' then
      v_sets := v_sets || format('%I = null', v_col.column_name);
    elsif v_col.column_default is not null then
      -- NOT NULL with a default: DEFAULT is the empty state.
      v_sets := v_sets || format('%I = default', v_col.column_name);
    else
      -- NOT NULL, no default: cannot be emptied without inventing a value.
      -- Recorded rather than silently left populated, so it is visible if one
      -- ever appears.
      v_skipped := v_skipped || v_col.column_name;
    end if;
  end loop;

  if array_length(v_sets, 1) is null then
    raise exception 'nothing to anonymize — the keep-list covers every column' using errcode = '22023';
  end if;

  v_sql := format(
    'update public.profiles set %s where user_id = %L',
    array_to_string(v_sets, ', '),
    p_user_id
  );
  execute v_sql;
  get diagnostics v_count = row_count;

  -- A tombstone so the admin console and any surviving authored content have
  -- something to render instead of a blank.
  update public.profiles
     set display_name = 'Deleted user',
         updated_at   = now()
   where user_id = p_user_id;

  insert into public.admin_lifecycle_audit (entity_type, entity_id, action, actor, reason, details)
  values (
    'user', p_user_id, 'anonymize', v_actor, p_reason,
    jsonb_build_object(
      'columns_cleared', array_length(v_sets, 1),
      'columns_not_nullable_without_default', to_jsonb(v_skipped),
      'rows', v_count
    )
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'anonymized_at', now(),
    'columns_cleared', array_length(v_sets, 1),
    'skipped', to_jsonb(v_skipped)
  );
end; $function$;

revoke all on function public.admin_anonymize_user(uuid, text) from public, anon;
grant execute on function public.admin_anonymize_user(uuid, text) to authenticated, service_role;

comment on function public.admin_anonymize_user(uuid, text) is
  'Strips every profiles column except a short keep-list, so a column added later is scrubbed by default. Keeps the row (and the account) so authored venues/events keep referential integrity. For full erasure use admin_delete_user.';
