-- Keep tag entity redirects valid when their target entity is merged, renamed
-- or deleted.
--
-- zy_validate_tag_entity_target raises on ANY update of a redirect tag whose
-- target no longer resolves to a live row at the stored path. Nothing updated
-- redirects when the target changed, so a personality merge left four tags
-- that rejected every write (repaired in 99991792772531). The merge cores
-- reparent everything else; this trigger does it for tag redirects, for all
-- nine target tables at once, instead of patching twelve merge functions:
--
--   * duplicate_of_id set   -> redirect follows the survivor (id + path)
--   * slug changed          -> redirect path follows the new slug
--   * row deleted, or the survivor has no live row -> tag becomes 'utility'
--
-- SECURITY DEFINER: an admin editing a venue slug may lack UPDATE on
-- unified_tags. app.actor is declared for the tag write and restored after,
-- so log_unified_tag_change's human_reviewed guard does not abort the merge and
-- is not left disabled for the rest of the caller's transaction.

create or replace function public.tag_redirect_follow_entity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_type   constant text := tg_argv[0];
  v_prefix constant text := tg_argv[1];
  v_key    constant text := tg_argv[2];  -- 'slug' or 'id': what the path ends in
  v_prev   text := current_setting('app.actor', true);
  v_target uuid;
  v_path   text;
begin
  if not exists (select 1 from public.unified_tags
                  where publication_role = 'entity_redirect'
                    and canonical_entity_type = v_type and canonical_entity_id = old.id) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    v_target := coalesce(new.duplicate_of_id, new.id);
    execute format('select $2 || %s from public.%I where id = $1 and duplicate_of_id is null',
                   case when v_key = 'id' then 'id::text' else 'slug' end, tg_table_name)
       into v_path using v_target, v_prefix;
  end if;

  perform set_config('app.actor', 'derived:tag-redirect-follow', true);
  if v_path is null then
    update public.unified_tags
       set publication_role = 'utility',
           publication_role_review_note = 'redirect target ' || v_type || ' ' || old.id || ' no longer exists'
     where publication_role = 'entity_redirect'
       and canonical_entity_type = v_type and canonical_entity_id = old.id;
  else
    update public.unified_tags
       set canonical_entity_id = v_target, canonical_entity_path = v_path
     where publication_role = 'entity_redirect'
       and canonical_entity_type = v_type and canonical_entity_id = old.id
       and (canonical_entity_id, canonical_entity_path) is distinct from (v_target, v_path);
  end if;
  perform set_config('app.actor', coalesce(nullif(v_prev, ''), 'system:trigger'), true);
  return null;
end
$fn$;

revoke all on function public.tag_redirect_follow_entity() from public, anon, authenticated;

-- CREATE TRIGGER takes SHARE ROW EXCLUSIVE on hot tables (events, venues):
-- retry briefly rather than queue every writer behind it or abort db push.
do $attach$
declare
  r record;
  v_cols text;
  i int;
begin
  for r in select * from (values
      ('personalities',   'personality',     '/personalities/', 'slug'),
      ('cities',          'city',            '/city/',          'slug'),
      ('countries',       'country',         '/country/',       'slug'),
      ('queer_villages',  'village',         '/villages/',      'slug'),
      ('venues',          'venue',           '/venues/',        'slug'),
      ('organizations',   'organization',    '/organizations/', 'slug'),
      ('events',          'event',           '/events/',        'slug'),
      ('hotels',          'hotel',           '/hotels/',        'slug'),
      ('community_groups','community_group', '/groups/',        'id')
    ) v(tbl, ty, prefix, k)
  loop
    v_cols := case when r.k = 'slug' then 'duplicate_of_id, slug' else 'duplicate_of_id' end;
    for i in 1..20 loop
      begin
        set local lock_timeout = '2s';
        execute format('drop trigger if exists zz_tag_redirect_follow_upd on public.%I', r.tbl);
        execute format('drop trigger if exists zz_tag_redirect_follow_del on public.%I', r.tbl);
        -- WHEN: UPDATE OF fires on columns NAMED in the statement, not on what changed.
        execute format(
          'create trigger zz_tag_redirect_follow_upd after update of %s on public.%I for each row '
          'when (old.duplicate_of_id is distinct from new.duplicate_of_id%s) '
          'execute function public.tag_redirect_follow_entity(%L, %L, %L)',
          v_cols, r.tbl,
          case when r.k = 'slug' then ' or old.slug is distinct from new.slug' else '' end,
          r.ty, r.prefix, r.k);
        execute format(
          'create trigger zz_tag_redirect_follow_del after delete on public.%I for each row '
          'execute function public.tag_redirect_follow_entity(%L, %L, %L)',
          r.tbl, r.ty, r.prefix, r.k);
        exit;
      exception when lock_not_available then
        if i = 20 then raise; end if;
        perform pg_sleep(2);
      end;
    end loop;
  end loop;
end
$attach$;

do $verify$
declare n int;
begin
  select count(*) into n from pg_trigger
   where tgname in ('zz_tag_redirect_follow_upd', 'zz_tag_redirect_follow_del') and not tgisinternal
     and tgfoid = 'public.tag_redirect_follow_entity'::regproc;
  if n <> 18 then
    raise exception 'P1 failed: % of 18 zz_tag_redirect_follow triggers attached (9 tables x upd/del)', n;
  end if;
end
$verify$;
