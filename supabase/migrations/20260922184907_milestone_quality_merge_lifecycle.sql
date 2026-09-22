-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260922184907 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
begin;

-- The generic milestone merge core predates the quality programme. Keep its
-- new evidence/review state lifecycle-aware without coupling the shared merge
-- implementation to tables that did not exist when it was introduced.
create or replace function public.reconcile_milestone_quality_after_merge(
  p_keep_id uuid,
  p_drop_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_sources jsonb;
begin
  if p_keep_id is null or p_drop_id is null or p_keep_id=p_drop_id then
    return;
  end if;

  -- Preserve every structurally valid citation, preferring the canonical
  -- record's label when both records cite the same normalized URL.
  with combined as (
    select value as source,0 as priority,ordinality as ord
    from public.milestones m
    cross join lateral jsonb_array_elements(coalesce(m.sources,'[]'::jsonb))
      with ordinality j(value,ordinality)
    where m.id=p_keep_id
    union all
    select value,1,ordinality
    from public.milestones m
    cross join lateral jsonb_array_elements(coalesce(m.sources,'[]'::jsonb))
      with ordinality j(value,ordinality)
    where m.id=p_drop_id
  ), deduplicated as (
    select distinct on (lower(trim(source->>'url'))) source,priority,ord
    from combined
    where nullif(trim(source->>'url'),'') is not null
    order by lower(trim(source->>'url')),priority,ord
  )
  select coalesce(jsonb_agg(source order by priority,ord),'[]'::jsonb)
  into v_sources from deduplicated;

  update public.milestones
  set sources=v_sources,
      tags=(select array(select distinct t from unnest(
        coalesce((select tags from public.milestones where id=p_keep_id),'{}'::text[])
        || coalesce((select tags from public.milestones where id=p_drop_id),'{}'::text[])
      ) t order by t)),
      last_verified_at=null,
      updated_at=now()
  where id=p_keep_id;

  perform public.sync_milestone_source_health(p_keep_id);

  -- Reuse the most recent check for citations that came from the duplicate.
  update public.milestone_source_health keep
  set source_class=drop_row.source_class,
      health_state=drop_row.health_state,
      http_status=drop_row.http_status,
      redirect_url=drop_row.redirect_url,
      archive_url=drop_row.archive_url,
      supports=drop_row.supports,
      last_checked_at=drop_row.last_checked_at,
      next_check_at=drop_row.next_check_at,
      check_attempts=drop_row.check_attempts,
      last_error=drop_row.last_error,
      updated_at=now()
  from public.milestone_source_health drop_row
  where keep.milestone_id=p_keep_id
    and drop_row.milestone_id=p_drop_id
    and keep.canonical_url=drop_row.canonical_url
    and (keep.last_checked_at is null
      or drop_row.last_checked_at is not null and drop_row.last_checked_at>keep.last_checked_at);

  delete from public.milestone_source_health where milestone_id=p_drop_id;
  delete from public.milestone_coverage_gaps where milestone_id=p_drop_id;

  update public.milestone_review_queue
  set status='rejected',reviewed_at=now(),
      reviewer_note=concat_ws(' ',nullif(reviewer_note,''),'Closed automatically because the milestone was merged.')
  where milestone_id=p_drop_id and status='open';

  update public.milestone_duplicate_candidates
  set status='dismissed',reviewed_at=now(),
      reviewer_note=concat_ws(' ',nullif(reviewer_note,''),'Closed automatically because one milestone was merged.')
  where status in ('pending','confirmed')
    and (milestone_id_1=p_drop_id or milestone_id_2=p_drop_id);
end;
$$;

create or replace function public.milestone_quality_merge_lifecycle_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if old.duplicate_of_id is null and new.duplicate_of_id is not null then
    perform public.reconcile_milestone_quality_after_merge(new.duplicate_of_id,new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_milestone_quality_merge_lifecycle on public.milestones;
create trigger trg_milestone_quality_merge_lifecycle
after update of duplicate_of_id on public.milestones
for each row execute function public.milestone_quality_merge_lifecycle_trigger();

-- Reconcile historical and just-completed merges once so the quality queues
-- start from a clean lifecycle state.
do $$
declare r record;
begin
  for r in
    select id,duplicate_of_id from public.milestones
    where duplicate_of_id is not null
    order by updated_at,id
  loop
    perform public.reconcile_milestone_quality_after_merge(r.duplicate_of_id,r.id);
  end loop;
end;
$$;

revoke all on function public.reconcile_milestone_quality_after_merge(uuid,uuid) from public;
revoke all on function public.milestone_quality_merge_lifecycle_trigger() from public;
grant execute on function public.reconcile_milestone_quality_after_merge(uuid,uuid) to service_role;

commit;
;
