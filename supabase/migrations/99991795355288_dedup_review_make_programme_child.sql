-- Dedup inbox: "make child of" for event pairs that are a festival and one of
-- its parts, not two copies of one event.
--
-- Design: docs/plans/2026-11-22-festival-multi-event-structure-design.md
-- (Phase 1, item 5). 99991795346738 added the review-only arms
-- umbrella_overlap_containment / umbrella_nested_duplicate; a reviewer could
-- then only merge (wrong: deletes a date) or reject (leaves the child
-- unlinked). This adds the third answer.
--
-- Shape: triage_action('dedup-review','approve', p_payload => {"parent_id": ..})
-- links the OTHER side of the pair under parent_id and closes the review as
-- 'rejected' (it is not a duplicate; status='rejected' is the sweep's memory,
-- so the pair is never re-queued). Nothing is merged.
--
-- Provenance: app.programme_link_source = 'admin:dedup-review', read by
-- trg_events_programme_link_provenance into field_provenance.parent_event_id.
-- Depth: trg_events_programme_depth still decides; an umbrella cannot become a
-- child and a child cannot become a parent. Its check_violation is surfaced
-- to the reviewer unchanged. run_event_programme_link is not touched.

create or replace function api_private.link_dedup_review_as_child(
  p_id uuid,
  p_parent_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  q record;
  v_child uuid;
begin
  perform public.assert_admin_or_internal();

  select * into q from public.dedup_review_queue
   where id = p_id and status = 'open' for update;
  if not found then
    raise exception 'dedup review % not found or not open', p_id;
  end if;
  if q.entity_type <> 'event' then
    raise exception 'only event pairs can be linked as a programme (got %)', q.entity_type
      using errcode = '22023';
  end if;

  if p_parent_id = q.keep_id then
    v_child := q.drop_id;
  elsif p_parent_id = q.drop_id then
    v_child := q.keep_id;
  else
    raise exception 'parent % is not one of the two events in review %', p_parent_id, p_id
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.events
                  where id = p_parent_id and duplicate_of_id is null) then
    raise exception 'parent event % no longer exists or was merged', p_parent_id;
  end if;

  perform set_config('app.programme_link_source', 'admin:dedup-review', true);

  update public.events
     set parent_event_id = p_parent_id
   where id = v_child and duplicate_of_id is null;
  if not found then
    raise exception 'child event % no longer exists or was merged', v_child;
  end if;

  update public.dedup_review_queue
     set status = 'rejected',
         reviewer_id = auth.uid(),
         reviewer_note = coalesce(nullif(p_note, ''), 'linked as programme child')
                         || ' [programme: ' || v_child || ' -> ' || p_parent_id || ']',
         reviewed_at = now()
   where id = p_id;

  perform public._dedup_set_needs_attention(q.entity_type, q.keep_id, false);
  perform public._dedup_set_needs_attention(q.entity_type, q.drop_id, false);

  return jsonb_build_object('linked', true, 'id', p_id,
                            'parent_event_id', p_parent_id, 'child_event_id', v_child);
end;
$function$;

revoke all on function api_private.link_dedup_review_as_child(uuid, uuid, text) from public, anon, authenticated;
grant execute on function api_private.link_dedup_review_as_child(uuid, uuid, text) to service_role;

-- Route it from triage_action. Patched from the live body (restating it would
-- revert anything later passes added); the anchor must match exactly once.
do $patch$
declare
  v_def  text := pg_get_functiondef('api_private.triage_action(uuid,text,text,uuid,text,text,boolean,boolean,jsonb)'::regprocedure);
  v_from text := E'      IF p_action = ''approve'' THEN\n        v_keep := nullif(p_payload->>''keep_id'', '''')::uuid;';
  v_to   text := E'      IF p_action = ''approve'' AND nullif(p_payload->>''parent_id'', '''') IS NOT NULL THEN\n'
               || E'        PERFORM api_private.link_dedup_review_as_child(p_item_id, (p_payload->>''parent_id'')::uuid, v_notes);\n'
               || E'      ELSIF p_action = ''approve'' THEN\n        v_keep := nullif(p_payload->>''keep_id'', '''')::uuid;';
  v_n    int;
begin
  if position('link_dedup_review_as_child' in v_def) > 0 then
    return;  -- already patched
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
  if v_n <> 1 then
    raise exception 'triage_action dedup anchor matched % times, expected 1', v_n;
  end if;
  execute replace(v_def, v_from, v_to);
end;
$patch$;

do $verify$
begin
  if position('link_dedup_review_as_child' in
       pg_get_functiondef('api_private.triage_action(uuid,text,text,uuid,text,text,boolean,boolean,jsonb)'::regprocedure)) = 0 then
    raise exception 'triage_action does not route parent_id to link_dedup_review_as_child';
  end if;
  if has_function_privilege('authenticated', 'api_private.link_dedup_review_as_child(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'link_dedup_review_as_child must not be callable by authenticated directly';
  end if;
end;
$verify$;
