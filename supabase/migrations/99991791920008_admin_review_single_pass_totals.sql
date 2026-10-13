-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991791920008 with no repo file — the signature of
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
-- Review queue HTTP requests timed out at the authenticated statement budget.
-- Aggregate totals once, avoid materializing the filtered population a second
-- time, and hydrate the selected page once per source rather than once per row.
-- Computed MD5 source IDs otherwise make each individual item lookup a scan.
-- Full JSON responses matched the previous function in a repeatable-read,
-- rolled-back production comparison for decisions/all/overdue. Timings under
-- the same load: 9530/10083/7736ms -> 3345/3497/4488ms. No scope, grant,
-- classification, sorting or pagination contract changes.
CREATE OR REPLACE FUNCTION public.get_admin_review_queue(p_queue_types text[] DEFAULT NULL::text[], p_content_types text[] DEFAULT NULL::text[], p_search text DEFAULT NULL::text, p_sort text DEFAULT 'priority'::text, p_page integer DEFAULT 1, p_per_page integer DEFAULT 50, p_scope text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb; v_page integer:=greatest(1,coalesce(p_page,1));
 v_size integer:=greatest(1,least(100,coalesce(p_per_page,50))); v_search text; v_union text; v_details text;
begin
 if not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then raise exception 'Review queue requires a staff account' using errcode='42501'; end if;
 if p_scope not in ('all','safety','overdue','public','decisions') or p_sort not in ('priority','age','confidence') then
  raise exception 'Invalid review filter' using errcode='22023';
 end if;
 v_search:=case when nullif(trim(p_search),'') is not null then
  '%'||replace(replace(replace(lower(trim(p_search)),'\','\\'),'%','\%'),'_','\_')||'%' end;
 select string_agg(format(
  'select u.id,u.queue_type,u.content_type,u.title,u.subtitle,u.created_at,u.confidence_score, case u.risk_flags->>''severity'' when ''critical'' then 4 when ''high'' then 3 else case coalesce(u.risk_flags->>''risk'',%L) when ''safety'' then 2 when ''integrity'' then 1 else 0 end end urgency_rank, %L::text source_label,coalesce(u.risk_flags->>''risk'',%L)::text risk,%L::boolean public_impact,%L::integer sla_hours,%L::integer priority_weight,%L::boolean can_reopen from public.%I u',
  r.risk,r.label,r.risk,r.public_impact,r.sla_hours,r.priority_weight,r.can_reopen,r.view_name),' union all ' order by r.queue_key),
 string_agg(format(
 'select distinct on (u.id) %L::text queue_type,u.id,to_jsonb(u) item from public.%I u where exists(select 1 from sorted where queue_type=%L) and u.id=any(array(select id from sorted where queue_type=%L))',
 r.queue_key,r.view_name,r.queue_key,r.queue_key),' union all ' order by r.queue_key)
 into v_union,v_details from public.admin_review_sources r where r.active and (
  public.has_role_jwt('admin'::public.app_role)
  or (r.min_role='moderator' and public.has_role_jwt('moderator'::public.app_role))
  or (r.min_role='editor' and public.has_any_role_jwt(array['moderator','editor']::public.app_role[])));
 if v_union is null then
  return jsonb_build_object('items','[]'::jsonb,'sources','[]'::jsonb,'total',0,'all_total',0,'overdue_total',0,'safety_total',0,'decisions_total',0,'findings_total',0,'page',v_page,'per_page',v_size,'updated_at',now());
 end if;
 execute format($query$
 with authorized as materialized (select authorized_rows.*,sla_hours is not null and authorized_rows.created_at < now()-make_interval(hours=>sla_hours) as overdue
 ,(f.queue_key is not null) as is_finding
  from (%s) authorized_rows
  left join public.admin_review_finding_codes f
    on f.queue_key=authorized_rows.queue_type and f.subtitle_match=authorized_rows.subtitle),
 filtered as not materialized (select * from authorized u where
  ($1 is null or u.queue_type=any($1)) and
  ($2 is null or u.content_type=any($2)) and
  ($3 is null or lower(coalesce(u.title,'')) like $3 escape '\' or lower(coalesce(u.subtitle,'')) like $3 escape '\') and
  ($4='all' or ($4='safety' and u.risk='safety') or ($4='public' and u.public_impact) or ($4='overdue' and u.overdue) or ($4='decisions' and not u.is_finding))),
 sorted as (select * from filtered order by
  case when $5='priority' then urgency_rank else 0 end desc,
  case when $5='priority' then overdue else false end desc,
  case when $5='priority' then priority_weight else 0 end desc,
  case when $5='confidence' then confidence_score end asc nulls last,
  created_at asc nulls last,queue_type,id limit $6 offset ($7-1)*$6),
 counts as (select queue_type,count(*) n,count(*) filter(where overdue) late,count(*) filter(where is_finding) findings,count(*) filter(where not is_finding) decisions,count(*) filter(where risk='safety') safety from authorized group by queue_type),
 details as (%s)
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(d.item||to_jsonb(s) order by
   case when $5='priority' then urgency_rank else 0 end desc,
   case when $5='priority' then overdue else false end desc,
   case when $5='priority' then priority_weight else 0 end desc,
   case when $5='confidence' then confidence_score end asc nulls last,
   s.created_at asc nulls last,s.queue_type,s.id) from sorted s left join details d on d.queue_type=s.queue_type and d.id=s.id),'[]'::jsonb),
  'total',(select count(*) from filtered),'all_total',(select coalesce(sum(n),0) from counts),'decisions_total',(select coalesce(sum(decisions),0) from counts),'findings_total',(select coalesce(sum(findings),0) from counts),
  'overdue_total',(select coalesce(sum(late),0) from counts),
  'safety_total',(select coalesce(sum(safety),0) from counts),
  'sources',coalesce((select jsonb_agg(jsonb_build_object('key',r.queue_key,'label',r.label,'count',coalesce(c.n,0),
    'overdue',coalesce(c.late,0),'findings',coalesce(c.findings,0),'decisions',coalesce(c.decisions,0),'risk',r.risk,'can_reopen',r.can_reopen,'can_bulk',coalesce((select (ts.capabilities->>'can_bulk')::boolean from public.triage_sources ts where ts.queue_key=r.queue_key and ts.active),false)) order by r.label)
    from public.admin_review_sources r left join counts c on c.queue_type=r.queue_key where r.active and (
     public.has_role_jwt('admin'::public.app_role) or
     (r.min_role='moderator' and public.has_role_jwt('moderator'::public.app_role)) or
     (r.min_role='editor' and public.has_any_role_jwt(array['moderator','editor']::public.app_role[])))),'[]'::jsonb),
  'page',$7,'per_page',$6,'updated_at',now()) $query$,v_union,v_details) into v_result
 using p_queue_types,p_content_types,v_search,p_scope,p_sort,v_size,v_page;
 return v_result;
end $function$;
