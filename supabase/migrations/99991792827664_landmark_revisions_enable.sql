-- Turn on edit history for landmarks, and teach the history health check
-- where landmark history comes from.
--
-- 99991792825676 registered ('landmarks', 'cms_landmarks') and attached
-- log_landmark_revision() to geo_places (landmark rows only) and
-- geo_landmark_profiles. The row shipped disabled, as every seeded row must
-- (contentVersionedTablesDrift.test.ts: "arms nothing"), so it is switched on
-- here. The volume argument that keeps the other tables on a measured rollout
-- does not apply: there are 6 landmarks, and non-landmark geo_places writes
-- are filtered out by the trigger's WHEN clause before the function runs.
--
-- content_revision_signals() counts a registered table as wired up only when
-- log_content_revision() is attached to that same relation. cms_landmarks is
-- a view, and its history trigger lives on the two base tables, so without
-- this patch the enabled row would read as `enabled_without_trigger` and fail
-- the health check. The body is patched in place from pg_get_functiondef()
-- with an exactly-once anchor rather than restated, so nothing else in that
-- reviewed function can drift.

do $patch$
declare
  v_src  text := pg_get_functiondef('api_private.content_revision_signals()'::regprocedure);
  -- Assertions read a comment-stripped copy (scripts/check-functiondef-asserts.mjs);
  -- the substitution rewrites the original so the body keeps its comments.
  v_bare text := regexp_replace(pg_get_functiondef('api_private.content_revision_signals()'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
  v_from constant text :=
    $$       AND g.tgfoid = 'public.log_content_revision()'::regprocedure$$;
  v_to   constant text :=
    $$       AND g.tgfoid = 'public.log_content_revision()'::regprocedure
        OR (r.table_name = 'cms_landmarks'
            AND g.tgrelid = 'public.geo_landmark_profiles'::regclass
            AND NOT g.tgisinternal
            AND g.tgfoid = 'public.log_landmark_revision()'::regprocedure)$$;
  v_n    int;
begin
  if position('log_landmark_revision' in v_bare) > 0 then
    return; -- already patched
  end if;
  v_n := (length(v_bare) - length(replace(v_bare, v_from, ''))) / length(v_from);
  if v_n <> 1 then
    raise exception 'content_revision_signals anchor found % times, expected 1', v_n;
  end if;
  execute replace(v_src, v_from, v_to);
end
$patch$;

update public.content_versioned_tables
   set enabled = true
 where registry_key = 'landmarks';

-- The verify block does NOT call content_revision_signals(): it counts the
-- whole content_revisions table (millions of rows) and measured >50s on prod,
-- which would stall `db push`. It checks the two facts that function derives
-- instead: the patched branch is in the code, and the trigger it looks for is
-- attached.
do $verify$
begin
  if not exists (
    select 1 from public.content_versioned_tables
    where registry_key = 'landmarks' and enabled
  ) then
    raise exception 'landmark history is not enabled';
  end if;
  if position('log_landmark_revision' in regexp_replace(pg_get_functiondef('api_private.content_revision_signals()'::regprocedure), '--[^' || chr(10) || ']*', '', 'g')) = 0 then
    raise exception 'content_revision_signals does not recognise the landmark history trigger';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.geo_landmark_profiles'::regclass
      and tgfoid = 'public.log_landmark_revision()'::regprocedure
      and not tgisinternal
      and tgenabled <> 'D'
  ) then
    raise exception 'log_landmark_revision is not attached to geo_landmark_profiles';
  end if;
end
$verify$;
