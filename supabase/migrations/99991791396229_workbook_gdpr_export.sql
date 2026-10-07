-- Extend the GDPR/nFADP export with the workbook answer tables.
-- Erasure is covered by ON DELETE CASCADE from profiles(user_id), asserted in
-- the answers migration's P7 — there is no bespoke delete path here, same as
-- the kink tables.
--
-- WHY A FULL RE-EMIT RATHER THAN A pg_get_functiondef PATCH
--
-- The house rule is that a live function body is not necessarily what any repo
-- file says, so this was checked rather than assumed: the live `prosrc` md5 is
-- d37b454177d106a9d140ba54fd55fb4e over 2605 bytes, which is byte-identical to
-- the body in 20260705100100_kink_gdpr_export.sql. Nothing has patched this
-- function since, so re-emitting it cannot silently revert anything — and a
-- re-emit is what that migration itself did (it is otherwise byte-identical to
-- its own predecessor, 20260624090100, with four lines spliced in).
--
-- If that digest ever stops matching, patch instead of restating: the pattern
-- is in 99991790719601, which had to patch tag_hygiene_stats for exactly this
-- reason.
--
-- TWO NEW KEYS, NOT THREE
--
-- Workbook partner grants are rows in `kink_grants` with kind='workbook', so
-- the existing 'kink_grants' key already exports them — and it already uses the
-- two-party disjunction (grantor_id = p_user_id OR grantee_id = p_user_id), so
-- the subject receives both the workbook access they gave and the access they
-- were given. No new key is needed for the grants, and adding one would export
-- the same rows twice.

create or replace function public.export_my_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  result := jsonb_build_object(
    'profile',             (select to_jsonb(p) from profiles p where p.user_id = p_user_id),
    'profile_attic',       (select data from profiles_attic where user_id = p_user_id),
    'intimate_profile',    (select to_jsonb(t) from intimate_profiles t where t.id = p_user_id),
    'intimate_profile_text', (select to_jsonb(x) from public.intimate_get_my_text() x),
    'kink_ratings',        (select jsonb_agg(to_jsonb(x)) from kink_ratings x where x.user_id = p_user_id),
    'kink_category_visibility', (select jsonb_agg(to_jsonb(x)) from kink_category_visibility x where x.user_id = p_user_id),
    'kink_grants',         (select jsonb_agg(to_jsonb(x)) from kink_grants x where x.grantor_id = p_user_id or x.grantee_id = p_user_id),
    'kink_share_links',    (select jsonb_agg(to_jsonb(x)) from kink_share_links x where x.owner_id = p_user_id),
    'workbook_answers',    (select jsonb_agg(to_jsonb(x)) from tag_workbook_answers x where x.user_id = p_user_id),
    'workbook_progress',   (select jsonb_agg(to_jsonb(x)) from tag_workbook_progress x where x.user_id = p_user_id),
    'travel_preferences',  (select jsonb_agg(to_jsonb(x)) from user_travel_preferences x where x.user_id = p_user_id),
    'trips',               (select jsonb_agg(to_jsonb(x)) from trips x where x.owner_id = p_user_id),
    'venue_reviews',       (select jsonb_agg(to_jsonb(x)) from venue_reviews x where x.user_id = p_user_id),
    'marketplace_reviews', (select jsonb_agg(to_jsonb(x)) from marketplace_reviews x where x.user_id = p_user_id),
    'community_posts',     (select jsonb_agg(to_jsonb(x)) from community_posts x where x.user_id = p_user_id),
    'photos',              (select jsonb_agg(to_jsonb(x)) from user_photos x where x.user_id = p_user_id),
    'notifications',       (select jsonb_agg(to_jsonb(x)) from notifications x where x.user_id = p_user_id),
    'venue_checkins',      (select jsonb_agg(to_jsonb(x)) from venue_checkins x where x.user_id = p_user_id),
    'favorites', jsonb_build_object(
      'cities',    (select jsonb_agg(to_jsonb(x)) from city_favorites x where x.user_id = p_user_id),
      'countries', (select jsonb_agg(to_jsonb(x)) from country_favorites x where x.user_id = p_user_id),
      'events',    (select jsonb_agg(to_jsonb(x)) from event_favorites x where x.user_id = p_user_id),
      'news',      (select jsonb_agg(to_jsonb(x)) from news_favorites x where x.user_id = p_user_id),
      'tags',      (select jsonb_agg(to_jsonb(x)) from tag_favorites x where x.user_id = p_user_id),
      'venues',    (select jsonb_agg(to_jsonb(x)) from venue_favorites x where x.user_id = p_user_id)
    )
  );

  return result;
end;
$$;

revoke all on function public.export_my_data(uuid) from public, anon;
grant execute on function public.export_my_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_src text;
  v_bad int;
begin
  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'export_my_data';

  -- P1: the two new keys are present.
  if position('''workbook_answers''' in v_src) = 0
     or position('''workbook_progress''' in v_src) = 0 then
    raise exception 'P1 failed: export_my_data is missing a workbook key';
  end if;

  -- P2: the keys read the right tables, scoped to the subject. A key that
  -- selects without a user_id predicate would export every user's answers.
  if position('from tag_workbook_answers x where x.user_id = p_user_id' in v_src) = 0
     or position('from tag_workbook_progress x where x.user_id = p_user_id' in v_src) = 0 then
    raise exception 'P2 failed: a workbook export key is unscoped or reads the wrong table';
  end if;

  -- P3: MIRROR — nothing that was being exported stopped being exported. A
  -- re-emit is a whole-body rewrite, so this is the half that catches a
  -- dropped line, and asserting only the new keys would not.
  select count(*) into v_bad
  from unnest(array[
    'profile','profile_attic','intimate_profile','intimate_profile_text',
    'kink_ratings','kink_category_visibility','kink_grants','kink_share_links',
    'travel_preferences','trips','venue_reviews','marketplace_reviews',
    'community_posts','photos','notifications','venue_checkins','favorites'
  ]) k
  where position('''' || k || '''' in v_src) = 0;
  if v_bad <> 0 then
    raise exception 'P3 failed: % pre-existing export key(s) went missing in the re-emit', v_bad;
  end if;

  -- P4: the kink_grants key keeps its two-party disjunction. Workbook grants
  -- live in that table, so narrowing this to grantor_id alone would stop
  -- exporting the access a subject was GIVEN.
  if position('x.grantor_id = p_user_id or x.grantee_id = p_user_id' in v_src) = 0 then
    raise exception 'P4 failed: the kink_grants export lost its two-party disjunction';
  end if;

  -- P5: the self-gate survives. Without it any authenticated caller could
  -- export any other user.
  if position('auth.uid() <> p_user_id' in v_src) = 0 then
    raise exception 'P5 failed: export_my_data lost its self-gate';
  end if;

  -- P6: still authenticated-only.
  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'export_my_data'
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_bad <> 0 then
    raise exception 'P6 failed: export_my_data is reachable by anon';
  end if;

  raise notice 'workbook_gdpr_export: P1-P6 pass';
end
$verify$;
