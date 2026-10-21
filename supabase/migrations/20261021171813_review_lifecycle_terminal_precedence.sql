-- An archived/merged city may retain its original tmp-* slug for history.
-- Terminal lifecycle states must win over that naming convention. Otherwise
-- resolved identities reopen forever, and ghost exposure/child blockers vanish.
set local search_path to public, extensions, pg_temp;

do $patch$
declare
  v_definition text := pg_get_viewdef('public.city_quality_profile'::regclass, true);
  v_before text := $old$WHEN c.slug ~~ 'tmp-%'::text OR c.shell_status = 'placeholder'::text THEN 'unresolved_placeholder'::text$old$;
  v_after text := $new$WHEN (c.slug ~~ 'tmp-%'::text OR c.shell_status = 'placeholder'::text) AND c.shell_status NOT IN ('ghost'::text, 'merged'::text) THEN 'unresolved_placeholder'::text$new$;
begin
  if position(v_after in v_definition) = 0 then
    if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before) <> 1 then
      raise exception 'city_quality_profile lifecycle anchor changed';
    end if;
    execute 'create or replace view public.city_quality_profile as ' || replace(v_definition,v_before,v_after);
  end if;
end
$patch$;

-- Resolve only the obsolete lifecycle question. Other integrity findings stay
-- open, including exposure and linked-child blockers for archived identities.
with current_quality as materialized (
  select id, lifecycle_cohort, issue_codes from public.city_quality_profile
)
update public.review_queue r
set status='resolved', resolved_at=now(),
    details=coalesce(r.details,'{}'::jsonb) || jsonb_build_object(
      'resolution','terminal_lifecycle_already_decided',
      'resolved_automatically',true,'lifecycle_cohort',q.lifecycle_cohort,
      'reconciled_at',now(),'source','review_lifecycle_terminal_precedence')
from current_quality q
where r.entity_type='city' and r.entity_id=q.id and r.status='pending'
  and r.review_type='CITY_LIFECYCLE_UNRESOLVED'
  and q.lifecycle_cohort in ('archived_non_place','merged_redirect')
  and not ('CITY_LIFECYCLE_UNRESOLVED'=any(q.issue_codes));

do $verify$
begin
  if exists(select 1 from public.city_quality_profile
    where shell_status in ('ghost','merged') and lifecycle_cohort='unresolved_placeholder') then
    raise exception 'terminal lifecycle still classified as unresolved';
  end if;
  if exists(select 1 from public.city_quality_profile
    where shell_status='ghost' and venue_count+event_count>0
      and not ('CITY_GHOST_HAS_LIVE_CHILDREN'=any(blockers))) then
    raise exception 'archived city child blocker was lost';
  end if;
  if exists(select 1 from public.city_quality_profile
    where shell_status='placeholder' and not ('CITY_LIFECYCLE_UNRESOLVED'=any(issue_codes))) then
    raise exception 'genuine placeholder question was lost';
  end if;
end
$verify$;

select public.refresh_admin_review_queue_counts();
