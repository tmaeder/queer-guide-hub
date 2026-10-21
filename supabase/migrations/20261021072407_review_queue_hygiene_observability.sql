-- Record actual repair counts, not only cron completion.
create or replace function public.run_review_queue_hygiene(p_batch integer default 500,p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_limit int:=greatest(1,least(coalesce(p_batch,500),2000));
 v_rejected int:=0; v_images int:=0; v_country int:=0; v_flags int:=0; v_broken int:=0; v_enriched int:=0; v_row record; v_summary jsonb; v_started timestamptz:=clock_timestamp();
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
 v_summary:=jsonb_build_object('dry_run',p_dry_run,'unsupported_city_proposals',v_rejected,'obsolete_image_observations',v_images,'corrected_country_findings',v_country,'http_only_closure_prompts',v_flags,'removed_broken_event_images',v_broken,'enriched_business_contacts',v_enriched);
 if not p_dry_run then
   insert into public.admin_automation_runs(automation_id,automation_slug,started_at,finished_at,status,items_examined,items_changed,summary)
   select id,'review_queue_hygiene',v_started,clock_timestamp(),'success',v_rejected+v_images+v_country+v_flags+v_broken+v_enriched,v_rejected+v_images+v_country+v_flags+v_broken+v_enriched,v_summary
   from public.admin_automations where slug='review_queue_hygiene';
   update public.admin_automations set last_run_at=v_started,last_run_status='success' where slug='review_queue_hygiene';
 end if;
 return v_summary;
end $$;

comment on function public.run_review_queue_hygiene(integer,boolean) is 'Bounded evidence-based repairs; per-run counts in admin_automation_runs. No inferred human decisions.';
