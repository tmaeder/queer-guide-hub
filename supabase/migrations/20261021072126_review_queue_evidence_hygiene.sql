-- Stop evidenced repeat noise at intake. Keep the rejected proposal for audit;
-- do not publish unsupported prose or record a machine decision as human review.
create or replace function public.city_review_evidence_rejection(p_type text,p_field text,p_citations jsonb)
returns text language sql immutable set search_path=public,pg_temp as $$
 select case when p_type='city' and p_field in ('editorial_hook','best_time_to_visit','lgbt_friendly_rating')
 and not exists (
   select 1 from jsonb_array_elements(case when jsonb_typeof(p_citations)='array' then p_citations else '[]'::jsonb end) c
   where coalesce(c->>'url','') ~ '^https?://[^/@[:space:]]+([/:?#]|$)'
     and length(btrim(coalesce(c->>'quote',''))) >= 12
     and (p_field<>'lgbt_friendly_rating' or (
       coalesce(c->>'url','') !~* '/wiki/LGBT_rights_in_'
       and coalesce(c->>'quote','') !~* 'equality[_[:space:]]*score'))
 ) then case when p_field='lgbt_friendly_rating'
   then 'auto-evidence-reject: no independent local rating evidence; national law or equality scores cannot substantiate city friendliness'
   else 'auto-evidence-reject: no field-specific source quotation for this city claim' end end;
$$;
revoke all on function public.city_review_evidence_rejection(text,text,jsonb) from public,anon;
grant execute on function public.city_review_evidence_rejection(text,text,jsonb) to authenticated,service_role;

create or replace function public.guard_city_review_evidence()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_reason text;
begin
 if new.status='open' then
   v_reason:=public.city_review_evidence_rejection(new.entity_type,new.field,new.citations);
   if v_reason is not null then
     new.status:='rejected'; new.reviewer_id:=null;
     new.reviewed_at:=now(); new.reviewer_note:=v_reason;
   end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_city_review_evidence() from public,anon,authenticated;
drop trigger if exists guard_city_review_evidence on public.entity_review_queue;
create trigger guard_city_review_evidence before insert or update of status,citations,field,entity_type
on public.entity_review_queue for each row execute function public.guard_city_review_evidence();

-- A dead URL is a repair signal, not proof that a business closed. Exclude HTTP
-- from the existence decision's strong-dead set; keep collecting raw HTTP signals.
-- Exact anchor and postcondition prevent silently patching a different contract.
do $patch$
declare v_src text; v_anchor text := $a$ARRAY['http_status','jsonld_status','content_closed_phrase',$a$;
begin
 select pg_get_functiondef('public.run_existence_decision(text,boolean)'::regprocedure) into v_src;
 if position(v_anchor in v_src)=0 then raise exception 'existence strong-dead anchor changed'; end if;
 v_src:=replace(v_src,v_anchor,$b$ARRAY['jsonld_status','content_closed_phrase',$b$);
 execute v_src;
end $patch$;

create or replace function public.run_review_queue_hygiene(p_batch integer default 500,p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_limit int:=greatest(1,least(coalesce(p_batch,500),2000));
 v_rejected int:=0; v_images int:=0; v_country int:=0; v_flags int:=0; v_broken int:=0; v_enriched int:=0; v_row record;
begin
 perform public.assert_admin_or_internal();
 if not p_dry_run and not exists(select 1 from public.admin_automations where slug='review_queue_hygiene' and enabled) then
   return jsonb_build_object('skipped',true,'reason','paused');
 end if;
 if not pg_try_advisory_xact_lock(hashtext('review_queue_hygiene')) then
   return jsonb_build_object('skipped',true,'reason','already running');
 end if;
 for v_row in select q.id,q.entity_type,q.entity_id,public.city_review_evidence_rejection(q.entity_type,q.field,q.citations) reason
   from public.entity_review_queue q where q.status='open'
   and public.city_review_evidence_rejection(q.entity_type,q.field,q.citations) is not null
   order by q.created_at limit v_limit for update skip locked
 loop
   v_rejected:=v_rejected+1;
   if not p_dry_run then
     update public.entity_review_queue set status='rejected',reviewer_id=null,reviewed_at=now(),reviewer_note=v_row.reason where id=v_row.id and status='open';
     perform public._review_clear_needs_attention(v_row.entity_type,v_row.entity_id);
   end if;
 end loop;
 -- Fill only absent contact fields from the sole canonical primary venue.
 -- No inferred ownership, cross-branch copies, description generation or media reuse.
 for v_row in select o.id,v.id venue_id,v.website,v.email,v.phone from public.organizations o
   join public.venues v on v.id=o.primary_venue_id and v.organization_id=o.id
   where o.duplicate_of_id is null and v.duplicate_of_id is null and v.closed_at is null
     and lower(btrim(o.name))=lower(btrim(v.name))
     and (o.country_id is null or o.country_id=v.country_id)
     and o.roles<@array['venue','support','community','advocacy']::text[]
     and not exists(select 1 from public.venues other where other.organization_id=o.id and other.id<>v.id and other.duplicate_of_id is null)
     and ((nullif(btrim(o.website),'') is null and nullif(btrim(v.website),'') is not null)
       or (nullif(btrim(o.email),'') is null and nullif(btrim(v.email),'') is not null)
       or (nullif(btrim(o.phone),'') is null and nullif(btrim(v.phone),'') is not null))
   order by o.id limit least(v_limit,100) for update of o skip locked
 loop
   v_enriched:=v_enriched+1;
   if not p_dry_run then
     update public.organizations o set
       website=coalesce(nullif(btrim(o.website),''),nullif(btrim(v_row.website),'')),
       email=coalesce(nullif(btrim(o.email),''),nullif(btrim(v_row.email),'')),
       phone=coalesce(nullif(btrim(o.phone),''),nullif(btrim(v_row.phone),'')),
       field_provenance=coalesce(o.field_provenance,'{}'::jsonb)
         || case when nullif(btrim(o.website),'') is null and nullif(btrim(v_row.website),'') is not null then jsonb_build_object('website',jsonb_build_object('source','primary_venue','source_id',v_row.venue_id,'inherited_at',now(),'human_reviewed',false)) else '{}'::jsonb end
         || case when nullif(btrim(o.email),'') is null and nullif(btrim(v_row.email),'') is not null then jsonb_build_object('email',jsonb_build_object('source','primary_venue','source_id',v_row.venue_id,'inherited_at',now(),'human_reviewed',false)) else '{}'::jsonb end
         || case when nullif(btrim(o.phone),'') is null and nullif(btrim(v_row.phone),'') is not null then jsonb_build_object('phone',jsonb_build_object('source','primary_venue','source_id',v_row.venue_id,'inherited_at',now(),'human_reviewed',false)) else '{}'::jsonb end
     where o.id=v_row.id;
   end if;
 end loop;
 -- Remove only the exact image URL with a recent definitive HTTP 404/410 result.
 -- Keep all other images. The ordinary quality scan still owns missing-image findings.
 for v_row in select e.id,q.evidence->>'url' url from public.event_quality_issues q join public.events e on e.id=q.event_id
   where q.status='open' and q.issue_code='IMAGE_UNREACHABLE'
     and q.evidence->>'http_status' in ('404','410') and q.last_seen_at>now()-interval '7 days'
     and (q.evidence->>'url')=any(e.images)
   order by q.detected_at limit least(v_limit,100) for update of e skip locked
 loop
   v_broken:=v_broken+1;
   if not p_dry_run then update public.events set images=array_remove(images,v_row.url) where id=v_row.id and v_row.url=any(images); end if;
 end loop;
 for v_row in select q.id from public.event_quality_issues q join public.events e on e.id=q.event_id
   where q.status='open' and q.issue_code in ('IMAGE_UNREACHABLE','IMAGE_LOW_RESOLUTION','IMAGE_MIME_INVALID','IMAGE_TOO_SMALL','IMAGE_DIMENSIONS_UNKNOWN','IMAGE_HASH_UNAVAILABLE')
   and nullif(q.evidence->>'url','') is not null
   and not ((q.evidence->>'url')=any(coalesce(e.images,'{}'::text[])))
   order by q.detected_at limit v_limit for update of q skip locked
 loop
   v_images:=v_images+1;
   if not p_dry_run then update public.event_quality_issues set status='resolved',resolved_at=now(),reviewed_at=now(),reviewed_by=null,
     resolution='auto-hygiene: observed URL is no longer on this event; this closes obsolete evidence, not a verification of current media'
     where id=v_row.id and status='open'; end if;
 end loop;
 for v_row in select q.id from public.review_queue q join public.venues v on v.id=q.entity_id
   where q.status='pending' and q.entity_type='venue' and q.review_type='venue_missing_country' and v.country_id is not null
   order by q.created_at limit v_limit for update of q skip locked
 loop
   v_country:=v_country+1;
   if not p_dry_run then update public.review_queue set status='resolved',resolved_at=now(),resolved_by=null,
     details=coalesce(details,'{}'::jsonb)||jsonb_build_object('auto_resolution','country is present on the live venue','resolved_at',now())
     where id=v_row.id and status='pending'; end if;
 end loop;
 -- Retire HTTP-only closure prompts without forging an admin/alive signal.
 -- Date lifecycle observations are not closure evidence for archival events.
 for v_row in select a.id from public.entity_existence_audit a
   where a.action='flag' and a.reverted_at is null
   and a.reason in ('single_dead_signal','guarded_dead_needs_review')
   and exists(select 1 from public.entity_existence_signals s where s.entity_type=a.entity_type and s.entity_id=a.entity_id and s.signal_kind='http_status' and s.verdict='dead')
   and not exists(select 1 from public.entity_existence_signals s where s.entity_type=a.entity_type and s.entity_id=a.entity_id and s.signal_kind not in ('http_status','date_lifecycle') and s.verdict='dead')
   order by a.created_at limit v_limit for update of a skip locked
 loop
   v_flags:=v_flags+1;
   if not p_dry_run then update public.entity_existence_audit set reverted_at=now(),reverted_by=null,
     reason='auto-hygiene: HTTP-only evidence cannot establish closure; source health remains unverified'
     where id=v_row.id and reverted_at is null; end if;
 end loop;
 return jsonb_build_object('dry_run',p_dry_run,'unsupported_city_proposals',v_rejected,'obsolete_image_observations',v_images,'corrected_country_findings',v_country,'http_only_closure_prompts',v_flags,'removed_broken_event_images',v_broken,'enriched_business_contacts',v_enriched);
end $$;
revoke all on function public.run_review_queue_hygiene(integer,boolean) from public,anon,authenticated;
grant execute on function public.run_review_queue_hygiene(integer,boolean) to service_role;

insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule,auto_pause_threshold)
values('review_queue_hygiene','Review queue: evidence hygiene','Reject unsupported city claims and reconcile obsolete image, country and HTTP-only closure evidence. Does not publish content or assert that an unreachable source is alive.','system',true,'{"type":"schedule"}','[]',
 jsonb_build_object('type','rpc','fn','run_review_queue_hygiene','command','SELECT public.run_review_queue_hygiene(500);','jobname','review_queue_hygiene'),'1-59/5 * * * *',3)
on conflict(slug) do update set action=excluded.action,schedule=excluded.schedule,description=excluded.description;
select cron.schedule('review_queue_hygiene','1-59/5 * * * *','SELECT public.run_review_queue_hygiene(500);');
