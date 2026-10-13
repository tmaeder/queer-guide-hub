-- Sidebar badges need exact totals, not a sorted page and hydrated item details.
-- Keep the review queue's JWT/source authorization and finding classification.
CREATE OR REPLACE FUNCTION public.get_admin_review_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp AS $function$
declare v_union text; v_result jsonb;
begin
 if not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
  raise exception 'Review queue requires a staff account' using errcode='42501';
 end if;
 select string_agg(format(
  'select u.queue_type,u.subtitle,u.created_at,coalesce(u.risk_flags->>''risk'',%L)::text risk,%L::integer sla_hours from public.%I u',
  r.risk,r.sla_hours,r.view_name),' union all ' order by r.queue_key)
 into v_union from public.admin_review_sources r where r.active and (
  public.has_role_jwt('admin'::public.app_role)
  or (r.min_role='moderator' and public.has_role_jwt('moderator'::public.app_role))
  or (r.min_role='editor' and public.has_any_role_jwt(array['moderator','editor']::public.app_role[])));
 if v_union is null then
  return jsonb_build_object('sources','[]'::jsonb,'all_total',0,'overdue_total',0,'safety_total',0,'decisions_total',0,'findings_total',0,'updated_at',now());
 end if;
 execute format($query$
 with authorized as not materialized (
  select u.*,sla_hours is not null and u.created_at < now()-make_interval(hours=>sla_hours) as overdue,
   (f.queue_key is not null) as is_finding
  from (%s) u left join public.admin_review_finding_codes f
   on f.queue_key=u.queue_type and f.subtitle_match=u.subtitle
 ), counts as materialized (
  select queue_type,count(*) n,count(*) filter(where overdue) late,
   count(*) filter(where is_finding) findings,count(*) filter(where not is_finding) decisions,
   count(*) filter(where risk='safety') safety from authorized group by queue_type
 )
 select jsonb_build_object(
  'all_total',(select coalesce(sum(n),0) from counts),
  'decisions_total',(select coalesce(sum(decisions),0) from counts),
  'findings_total',(select coalesce(sum(findings),0) from counts),
  'overdue_total',(select coalesce(sum(late),0) from counts),
  'safety_total',(select coalesce(sum(safety),0) from counts),
  'sources',coalesce((select jsonb_agg(jsonb_build_object('key',r.queue_key,'label',r.label,'count',coalesce(c.n,0),
    'overdue',coalesce(c.late,0),'findings',coalesce(c.findings,0),'decisions',coalesce(c.decisions,0),'risk',r.risk,'can_reopen',r.can_reopen,'can_bulk',coalesce((select (ts.capabilities->>'can_bulk')::boolean from public.triage_sources ts where ts.queue_key=r.queue_key and ts.active),false)) order by r.label)
    from public.admin_review_sources r left join counts c on c.queue_type=r.queue_key where r.active and (
     public.has_role_jwt('admin'::public.app_role) or
     (r.min_role='moderator' and public.has_role_jwt('moderator'::public.app_role)) or
     (r.min_role='editor' and public.has_any_role_jwt(array['moderator','editor']::public.app_role[])))),'[]'::jsonb),
  'updated_at',now()) $query$,v_union) into v_result;
 return v_result;
end $function$;
REVOKE ALL ON FUNCTION public.get_admin_review_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_review_summary() TO authenticated;
