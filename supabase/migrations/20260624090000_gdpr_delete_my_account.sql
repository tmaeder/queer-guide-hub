-- GDPR Art. 17 / Swiss nFADP right to erasure: self-serve account deletion.
--
-- The Privacy Policy promises users can delete their account and personal data,
-- but no backend existed. profiles.user_id -> auth.users is ON DELETE CASCADE and
-- ~70 child tables cascade off profiles/auth.users, so most data is removed by
-- deleting the profile. But two classes need explicit handling, verified against
-- the live schema:
--   * NO-ACTION FKs to profiles/auth.users that would ABORT the cascade
--     (events/venues/marketplace_listings.created_by, review_queue.resolved_by,
--      trip_members.user_id, group_invites.accepted_by) — cleared in Tier 0.
--   * user-referencing columns with NO foreign key, which survive the cascade —
--     hard-deleted (personal) or NULL-scrubbed (audit/security/catalog) below.
-- All deletes run atomically in this SECURITY DEFINER RPC (RLS bypassed); the
-- edge function then deletes storage objects + the auth.users row.

create or replace function public.delete_my_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profiles int := 0;
begin
  -- Self-only: the caller can erase only their own account.
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Tier 0 — clear NO-ACTION FK blockers (else the profiles cascade aborts).
  delete from trip_members           where user_id = p_user_id;
  update events               set created_by = null where created_by = p_user_id;
  update marketplace_listings set created_by = null where created_by = p_user_id;
  update venues               set created_by = null where created_by = p_user_id;
  update review_queue         set resolved_by = null where resolved_by = p_user_id;
  update group_invites        set accepted_by = null where accepted_by = p_user_id;

  -- Tier 1 — hard-delete personal rows in tables with NO FK to auth.users/profiles
  -- (these would otherwise survive the cascade).
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

  -- Tier 2/3 — retain the row (legal/audit/catalog), strip the user link.
  update community_groups    set created_by  = null where created_by  = p_user_id;
  update organizations       set claimed_by  = null where claimed_by  = p_user_id;
  update videos              set created_by  = null where created_by  = p_user_id;
  update ingestion_staging   set reviewed_by = null where reviewed_by = p_user_id;
  update tag_suggestions     set reviewed_by = null where reviewed_by = p_user_id;
  update tag_adult_false_positive_backup set cleared_by = null where cleared_by = p_user_id;
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

  -- Finally remove the profile; CASCADE clears every child table that FKs to
  -- profiles.user_id / auth.users.
  delete from profiles where user_id = p_user_id;
  get diagnostics v_profiles = row_count;

  return jsonb_build_object(
    'user_id', p_user_id,
    'deleted_at', now(),
    'profile_deleted', v_profiles
  );
end;
$$;

revoke all on function public.delete_my_account(uuid) from public, anon;
grant execute on function public.delete_my_account(uuid) to authenticated;

-- Lists the storage objects owned by the caller so the edge function can purge
-- them via the storage API (storage.objects has no FK to auth.users, so the
-- binaries survive the cascade). Self-only.
create or replace function public.list_my_storage_objects(p_user_id uuid)
returns table(bucket_id text, name text)
language sql
security definer
set search_path = public, storage
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where o.owner = p_user_id
    and p_user_id = auth.uid()
$$;

revoke all on function public.list_my_storage_objects(uuid) from public, anon;
grant execute on function public.list_my_storage_objects(uuid) to authenticated;
