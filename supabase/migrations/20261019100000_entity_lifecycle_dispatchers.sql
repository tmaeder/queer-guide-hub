-- Archive / restore / delete dispatchers for the registry-driven admin.
--
-- WHY THIS EXISTS: /admin/content/:type covers 26 content types and had NO
-- delete at any level, while its Archive button wrote `workflow_state` into the
-- `cms_content_metadata` sidecar — a table no public query reads and the admin
-- list itself does not join. Archiving a venue changed nothing: still public,
-- still in search, still reading "Published" in the list.
--
-- Shape deliberately mirrors the existing `merge_entities` / `unmerge_entities`
-- pair: one dispatcher, per-type branches, `assert_admin_or_internal()`,
-- SECURITY DEFINER, revoked from anon.
--
-- ARCHIVE SEMANTICS STAY PER ENTITY. The three conventions in this schema each
-- mean something the others do not — a `presumed_closed` venue is a live
-- business we believe has shut, a `ghost` city is not a place at all, and
-- `review_status='archived'` is an editorial judgement. Collapsing them into one
-- `archived_at` column would lose that AND require teaching every public read
-- path, RLS policy and search indexer about a new column on 15 tables.
--
-- FOUR TYPES ARE DELIBERATELY NOT ARCHIVABLE: hotels, news_articles, countries
-- and community_groups have no status/visibility/review_status column at all.
-- They carry only `seo_indexable`, which governs crawlers and the sitemap — it
-- does NOT remove a row from the site or from search. Giving them an "Archive"
-- button that only deindexes would ship precisely the defect
-- 20261016110000 was written to remove: a control that claims to hide something
-- and does not. They raise `unsupported_type` here and the registry does not
-- offer the action. Making them archivable is a schema decision plus the
-- read-path work each one needs, not a line in this dispatcher.

-- ---------------------------------------------------------------------------
-- archive_entity
-- ---------------------------------------------------------------------------
create or replace function public.archive_entity(
  p_type   text,
  p_id     uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor  uuid := auth.uid();
  v_result jsonb;
  v_n      int;
begin
  perform public.assert_admin_or_internal();
  if p_id is null then
    raise exception 'p_id is required' using errcode = '22023';
  end if;

  case p_type
    -- Reuse what already exists rather than writing a second way to archive
    -- the same row. Each of these carries its own prior-state snapshot and has
    -- an exact inverse, which restore_entity below calls.
    when 'city' then
      v_result := public.archive_city_as_nonplace(p_id, coalesce(p_reason, 'admin archive'), '{}'::jsonb);
    when 'personality' then
      v_result := public.archive_personality_as_nonperson(p_id, coalesce(p_reason, 'admin archive'), '{}'::jsonb);
    when 'venue' then
      v_result := public.decide_venue_nonvenue(p_id, true, coalesce(p_reason, 'admin archive'));
    when 'event' then
      perform public._existence_apply_archive('event', p_id, coalesce(p_reason, 'admin archive'), '{}'::jsonb, v_actor);
      v_result := jsonb_build_object('archived', true);
    when 'marketplace' then
      perform public._existence_apply_archive('marketplace', p_id, coalesce(p_reason, 'admin archive'), '{}'::jsonb, v_actor);
      v_result := jsonb_build_object('archived', true);

    -- New, but the column and its CHECK already admit the value; nothing had
    -- ever written it.
    when 'guide' then
      update public.guides set status = 'archived' where id = p_id and status <> 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('archived', v_n > 0);
    when 'milestone' then
      update public.milestones set status = 'archived', seo_indexable = false
        where id = p_id and status <> 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('archived', v_n > 0);
    when 'queer_village' then
      update public.queer_villages set shell_status = 'ghost', seo_indexable = false
        where id = p_id and shell_status is distinct from 'ghost';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('archived', v_n > 0);
    when 'organization' then
      update public.organizations set status = 'archived' where id = p_id and status <> 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('archived', v_n > 0);

    else
      raise exception 'unsupported_type: % cannot express an archived state — see the header of this migration', p_type
        using errcode = '22023';
  end case;

  insert into public.admin_lifecycle_audit (entity_type, entity_id, action, actor, reason, details)
  values (p_type, p_id, 'archive', v_actor, p_reason, coalesce(v_result, '{}'::jsonb));

  return coalesce(v_result, jsonb_build_object('archived', true));
end; $function$;

-- ---------------------------------------------------------------------------
-- restore_entity — the exact inverse of the above.
-- ---------------------------------------------------------------------------
create or replace function public.restore_entity(p_type text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor  uuid := auth.uid();
  v_result jsonb;
  v_n      int;
begin
  perform public.assert_admin_or_internal();
  if p_id is null then
    raise exception 'p_id is required' using errcode = '22023';
  end if;

  case p_type
    when 'city' then
      v_result := public.unarchive_city(p_id);
    when 'personality' then
      v_result := jsonb_build_object('restored', public.unarchive_personality(p_id));
    when 'venue' then
      v_result := public.restore_venue_from_nonvenue(p_id);
    when 'event' then
      v_result := jsonb_build_object('restored', public._existence_apply_reopen('event', p_id, v_actor));
    when 'marketplace' then
      v_result := jsonb_build_object('restored', public._existence_apply_reopen('marketplace', p_id, v_actor));

    -- The new branches restore to a NON-published state on purpose. An archived
    -- row that comes back straight to 'published' skips whatever review put it
    -- there, and the reason it was archived is rarely "this was fine all along".
    -- `restore_venue_from_nonvenue` already sets 'pending' rather than
    -- 'approved' for the same reason.
    when 'guide' then
      update public.guides set status = 'draft' where id = p_id and status = 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('restored', v_n > 0, 'status', 'draft');
    when 'milestone' then
      update public.milestones set status = 'draft' where id = p_id and status = 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('restored', v_n > 0, 'status', 'draft');
    when 'queer_village' then
      -- seo_indexable is left false: run_village_trust_recompute owns that
      -- column and will restore it on the next nightly pass if the village has
      -- real content. Setting it true here would re-index a still-empty
      -- village and fight the engine.
      update public.queer_villages set shell_status = 'real' where id = p_id and shell_status = 'ghost';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('restored', v_n > 0, 'seo_indexable', 'left to run_village_trust_recompute');
    when 'organization' then
      update public.organizations set status = 'active' where id = p_id and status = 'archived';
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('restored', v_n > 0);

    else
      raise exception 'unsupported_type: %', p_type using errcode = '22023';
  end case;

  insert into public.admin_lifecycle_audit (entity_type, entity_id, action, actor, reason, details)
  values (p_type, p_id, 'restore', v_actor, null, coalesce(v_result, '{}'::jsonb));

  return coalesce(v_result, jsonb_build_object('restored', true));
end; $function$;

-- ---------------------------------------------------------------------------
-- delete_entity — snapshot, then remove.
--
-- The snapshot is the ONLY way back; there is no unmerge for a delete. It is a
-- whole-row jsonb copy, which is why this is deliberately NOT used for users:
-- admin_delete_user writes no snapshot, because retaining a deleted account's
-- row would preserve exactly what the erasure removes.
-- ---------------------------------------------------------------------------
create or replace function public.delete_entity(
  p_type   text,
  p_id     uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor  uuid := auth.uid();
  v_table  text;
  v_row    jsonb;
  v_n      int;
begin
  perform public.assert_admin_or_internal();
  if p_id is null then
    raise exception 'p_id is required' using errcode = '22023';
  end if;

  -- Tags are not handled here. admin_delete_tag already refuses when the tag is
  -- in use and explains what is in the way; routing tags through a generic
  -- snapshot-and-delete would skip that and silently cascade citations,
  -- clinical codes and ontology edges away.
  if p_type = 'tag' then
    raise exception 'use admin_delete_tag() for tags — it refuses when the tag is still in use'
      using errcode = '22023';
  end if;
  -- Users likewise: admin_delete_user clears FK blockers in a fixed order and
  -- must not leave a personal-data snapshot behind.
  if p_type = 'user' then
    raise exception 'use admin_delete_user() for accounts' using errcode = '22023';
  end if;

  v_table := case p_type
    when 'venue' then 'venues'
    when 'event' then 'events'
    when 'city' then 'cities'
    when 'personality' then 'personalities'
    when 'marketplace' then 'marketplace_listings'
    when 'hotel' then 'hotels'
    when 'organization' then 'organizations'
    when 'news' then 'news_articles'
    when 'milestone' then 'milestones'
    when 'guide' then 'guides'
    when 'queer_village' then 'queer_villages'
    when 'group' then 'community_groups'
    else null
  end;

  if v_table is null then
    raise exception 'unsupported_type: %', p_type using errcode = '22023';
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
    into v_row using p_id;
  if v_row is null then
    raise exception 'no % with id %', p_type, p_id using errcode = 'P0002';
  end if;

  -- Audit BEFORE the delete. If the delete then fails on a foreign key the
  -- transaction rolls the audit row back with it, so the log cannot claim a
  -- deletion that did not happen — and if it succeeds, the snapshot is
  -- guaranteed to exist rather than depending on a second statement.
  insert into public.admin_lifecycle_audit (entity_type, entity_id, action, actor, reason, row_snapshot, details)
  values (p_type, p_id, 'delete', v_actor, p_reason, v_row,
          jsonb_build_object('table', v_table));

  execute format('delete from public.%I where id = $1', v_table) using p_id;
  get diagnostics v_n = row_count;

  return jsonb_build_object('deleted', v_n > 0, 'type', p_type, 'id', p_id);
end; $function$;

-- ---------------------------------------------------------------------------
-- restore_deleted_entity — re-INSERT from the snapshot, at the original id so
-- slugs and inbound links resolve again.
--
-- It restores the ROW, not the world: rows that cascaded away in other tables
-- do not come back, and a search embedding or an R2 image a cron has since
-- reclaimed is gone. Hence the 30-day window the admin UI advertises rather
-- than implying permanence.
-- ---------------------------------------------------------------------------
create or replace function public.restore_deleted_entity(p_audit_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_audit public.admin_lifecycle_audit%rowtype;
  v_table text;
  v_n     int;
begin
  perform public.assert_admin_or_internal();

  select * into v_audit from public.admin_lifecycle_audit where id = p_audit_id;
  if not found then
    raise exception 'no audit row %', p_audit_id using errcode = 'P0002';
  end if;
  if v_audit.action <> 'delete' then
    raise exception 'audit row % is a %, not a delete', p_audit_id, v_audit.action using errcode = '22023';
  end if;
  if v_audit.restored_at is not null then
    raise exception 'audit row % was already restored at %', p_audit_id, v_audit.restored_at using errcode = '22023';
  end if;
  if v_audit.row_snapshot is null then
    raise exception 'audit row % has no snapshot — user deletions deliberately keep none', p_audit_id
      using errcode = '22023';
  end if;

  v_table := v_audit.details->>'table';
  if v_table is null then
    raise exception 'audit row % does not name its table', p_audit_id using errcode = '22023';
  end if;

  execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', v_table, v_table)
    using v_audit.row_snapshot;
  get diagnostics v_n = row_count;

  update public.admin_lifecycle_audit set restored_at = now() where id = p_audit_id;

  insert into public.admin_lifecycle_audit (entity_type, entity_id, action, actor, reason, details)
  values (v_audit.entity_type, v_audit.entity_id, 'restore', v_actor,
          format('restored from audit #%s', p_audit_id),
          jsonb_build_object('rows', v_n, 'table', v_table));

  return jsonb_build_object('restored', v_n > 0, 'type', v_audit.entity_type, 'id', v_audit.entity_id);
end; $function$;

revoke all on function public.archive_entity(text, uuid, text)      from public, anon;
revoke all on function public.restore_entity(text, uuid)            from public, anon;
revoke all on function public.delete_entity(text, uuid, text)       from public, anon;
revoke all on function public.restore_deleted_entity(bigint)        from public, anon;
grant execute on function public.archive_entity(text, uuid, text)   to authenticated, service_role;
grant execute on function public.restore_entity(text, uuid)         to authenticated, service_role;
grant execute on function public.delete_entity(text, uuid, text)    to authenticated, service_role;
grant execute on function public.restore_deleted_entity(bigint)     to authenticated, service_role;

comment on function public.archive_entity(text, uuid, text) is
  'Archive dispatcher. Reuses each type''s existing archive RPC where one exists. hotels/news/countries/groups raise unsupported_type: they have no column that can express archived, and a button that only deindexes would not hide anything.';
comment on function public.delete_entity(text, uuid, text) is
  'Snapshots the whole row into admin_lifecycle_audit, then deletes. Refuses for tags (use admin_delete_tag, which checks usage) and users (use admin_delete_user, which keeps no snapshot).';
