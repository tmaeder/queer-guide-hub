begin;
-- Event artwork belongs to the source-owned event image worker. Generic
-- location-related stock photos must never become canonical event artwork.
do $selector$
declare target regprocedure;src text;old_branch text:=$old$
  ELSIF p_entity_type = 'event' THEN
    RETURN QUERY
      SELECT e.id, e.title, e.city AS country_name, COALESCE(e.event_type, '') AS capital, NULL::text, NULL::text
      FROM events e
      WHERE e.duplicate_of_id IS NULL
        AND e.title IS NOT NULL
        AND (e.images IS NULL OR array_length(e.images, 1) IS NULL OR array_length(e.images, 1) = 0)
        AND NOT EXISTS (
          SELECT 1 FROM enrichment_log el
          WHERE el.step = 'queer_image_backfill'
            AND el.entity_type = 'event'
            AND el.entity_id = e.id
        )
      ORDER BY e.start_date DESC NULLS LAST
      LIMIT GREATEST(1, LEAST(200, p_limit));


$old$;
begin
 target:=coalesce(to_regprocedure('api_private.entities_due_for_queer_image(text,integer)'),to_regprocedure('public.entities_due_for_queer_image(text,integer)'));
 if target is null then raise exception 'Legacy imagery selector missing';end if;
 old_branch:=btrim(old_branch,chr(10));src:=pg_get_functiondef(target);
 if(length(src)-length(replace(src,old_branch,'')))/length(old_branch)<>1 then raise exception 'Legacy event stock branch changed';end if;
 execute replace(src,old_branch,E'  ELSIF p_entity_type = ''event'' THEN\n    RETURN;');
end $selector$;

select set_config('app.automation_state_source','migration',true);
select set_config('app.automation_state_reason','Generic event stock imagery consolidated into source-owned event_image_backfill',true);
do $schedule$
declare job_item record;
begin
 if not exists(select 1 from public.admin_automations where slug='event_image_backfill'and enabled and lifecycle_state='active')
  or not exists(select 1 from cron.job where jobname='event_image_backfill'and active)then raise exception 'Canonical event artwork producer is not active';end if;
 if not exists(select 1 from public.admin_automations where slug='queer_image_backfill_event'and action->>'jobname'='queer_image_backfill_event')then raise exception 'Legacy stock registry changed';end if;
 update public.admin_automations set enabled=false,lifecycle_state='consolidated',can_run_now=false,can_dry_run=false,
  capability_reason='Event-owned artwork is handled by event_image_backfill; stock photos are not event artwork.',updated_at=now()
  where slug='queer_image_backfill_event';
 for job_item in select jobid from cron.job where jobname='queer_image_backfill_event'loop perform cron.unschedule(job_item.jobid);end loop;
end $schedule$;


commit;
