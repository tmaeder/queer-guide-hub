-- Approved narrow fix: profile-key attribution for general-review only.
-- Preserve authorization, audit user IDs, foreign keys and all other branches.
do $review_resolver_guard$
begin
  if md5(pg_get_functiondef('api_private.admin_review_action(text,uuid,text,text,boolean,jsonb)'::regprocedure)) <> 'c64854c73096758f5e49c43e17c90869' then
    raise exception 'admin_review_action changed; review the current definition before applying the resolver fix' using errcode='40001';
  end if;
end
$review_resolver_guard$;

CREATE OR REPLACE FUNCTION api_private.admin_review_action(p_queue_type text, p_item_id uuid, p_action text, p_notes text DEFAULT NULL::text, p_confirm boolean DEFAULT false, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.admin_review_sources; v_meta jsonb; v_entity uuid; v_flags jsonb;
 v_result jsonb; v_check jsonb; v_changed integer; v_issue text; v_description text; v_merge uuid; v_tag public.tag_suggestions;
 v_reviewer_profile_id uuid;
begin
 p_confirm:=coalesce(p_confirm,false); p_payload:=coalesce(p_payload,'{}'::jsonb);
 if auth.uid() is null or not public.has_any_role_jwt(array['admin','moderator','editor']::public.app_role[]) then
  raise exception 'Review decision requires a staff account' using errcode='42501'; end if;
 select * into r from public.admin_review_sources where queue_key=p_queue_type and active;
 if not found or not(public.has_role_jwt('admin'::public.app_role) or
   (r.min_role='moderator' and public.has_role_jwt('moderator'::public.app_role)) or
   (r.min_role='editor' and public.has_any_role_jwt(array['moderator','editor']::public.app_role[]))) then
  raise exception 'You cannot decide this review source' using errcode='42501'; end if;
 if p_action is null or p_action not in ('approve','reject','reopen') then raise exception 'Unsupported review decision'; end if;
 if p_action='reopen' then
  if not r.can_reopen then raise exception 'This decision cannot be undone'; end if;
  v_result:=public.triage_action(p_item_id,p_queue_type,p_action,auth.uid(),p_notes,p_payload->>'canned_slug',false,p_confirm,p_payload);
 else
  -- Serialize decisions across review clients, then recheck pending membership.
  perform pg_advisory_xact_lock(hashtextextended(p_queue_type||':'||p_item_id::text,0));
  if r.lock_table is not null then
   execute format('select id from public.%I where id=$1 for update',r.lock_table) using p_item_id;
  end if;
  execute format('select meta,entity_id,risk_flags from public.%I where id=$1',r.view_name)
   into v_meta,v_entity,v_flags using p_item_id;
  get diagnostics v_changed=row_count;
  if v_changed=0 then raise exception 'This item is no longer pending. Refresh the queue.' using errcode='40001'; end if;
  v_meta:=coalesce(v_meta,'{}'::jsonb);
  if p_action='approve' and p_queue_type='dedup-review' and coalesce((v_flags->>'namesake')::boolean,false) and not coalesce((p_payload->>'namesake_confirmed')::boolean,false) then raise exception 'Confirm that these records describe the same person before merging'; end if;
  if (p_action='approve' or p_action='reject' and coalesce((v_flags->>'confirm_rejection')::boolean,false)) and coalesce((v_flags->>'requires_confirm')::boolean,false) and not p_confirm then
   raise exception 'Confirm the consequences before approving this item'; end if;
  case p_queue_type
   when 'org-link-review' then
    v_result:=public.decide_org_adoption(p_item_id,p_action='approve',nullif(p_payload->>'organization_id','')::uuid,p_notes);
   when 'sensitive-tags' then
    perform set_config('app.actor','admin:unified-review',true);
    update public.unified_tags set human_reviewed=true,seo_indexable=p_action='approve',verification_status='reviewed'
     where id=p_item_id and status='active' and not coalesce(human_reviewed,false);
   when 'editorial' then
    if p_action='approve' then
     if p_payload ? 'draft_hook' then
      if nullif(trim(p_payload->>'draft_hook'),'') is null then raise exception 'A reviewed hook is required'; end if;
      update public.editorial_drafts set draft_hook=trim(p_payload->>'draft_hook'),draft_long=nullif(trim(p_payload->>'draft_long'),'') where id=p_item_id and status='pending';
     end if;
     perform public.approve_editorial_draft(p_item_id);
    else perform public.reject_editorial_draft(p_item_id,p_notes); end if;
   when 'tags' then
    if p_action='approve' and coalesce((v_flags->>'approve_unsupported')::boolean,false) then
     if not p_confirm then raise exception 'Confirm the tag identities before merging'; end if;
     select * into strict v_tag from public.tag_suggestions where id=p_item_id and status='pending';
     if v_tag.entity_id is null or v_tag.tag_id is null or v_tag.entity_id=v_tag.tag_id then raise exception 'This pair is not a valid tag merge'; end if;
     select id into v_merge from public.tag_merge_review where canonical_id=v_tag.tag_id and duplicate_id=v_tag.entity_id and status='pending' limit 1;
     if v_merge is null then
      insert into public.tag_merge_review(canonical_id,duplicate_id,similarity,reason,status,lexical_variant)
       values(v_tag.tag_id,v_tag.entity_id,coalesce(v_tag.confidence,0),coalesce(v_tag.reason,'Admin-reviewed tag pair'),'pending',false) returning id into v_merge;
     end if;
     perform public.approve_tag_merge(v_merge,auth.uid()::text);
     update public.tag_suggestions set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=p_item_id;
    else v_result:=public.triage_action(p_item_id,p_queue_type,p_action,auth.uid(),p_notes,p_payload->>'canned_slug',false,p_confirm,p_payload); end if;
   when 'tag-merges' then
    if p_action='approve' then perform public.approve_tag_merge(p_item_id,auth.uid()::text);
    else perform public.reject_tag_merge(p_item_id,coalesce((p_payload->>'keep_distinct')::boolean,false),auth.uid()::text); end if;
   when 'venue-category' then
    v_result:=public.decide_venue_category(p_item_id,p_action='approve',nullif(p_payload->>'category',''),p_notes);
   when 'venue-kind' then
    v_result:=public.decide_venue_nonvenue(p_item_id,p_action='approve',p_notes,false);
   when 'event-quality' then
    perform public.decide_event_quality_issue(p_item_id,case when p_action='approve' then 'resolved' else 'accepted' end,p_notes);
   when 'liveness' then
    if p_action='approve' then perform public.existence_approve_archive((v_meta->>'audit_id')::bigint);
    else perform public.existence_reject_archive((v_meta->>'audit_id')::bigint,p_notes); end if;
   when 'group-requests' then
    if p_action='approve' then perform public.approve_group_join_request(p_item_id);
    else perform public.reject_group_join_request(p_item_id); end if;
   when 'brand-ownership' then
    if p_action='approve' then v_result:=public.approve_marketplace_brand(p_item_id,
     array(select jsonb_array_elements_text(coalesce(p_payload->'tags','[]'::jsonb))),p_confirm,p_notes);
    else v_result:=public.reject_marketplace_brand(p_item_id,p_notes); end if;
   when 'personality-publication' then
    if p_action='approve' then perform public.freigabe_personality(p_item_id,p_confirm);
    else perform public.reject_personality_capture(p_item_id,coalesce(p_notes,'Rejected after review')); end if;
   when 'tag-restoration' then
    perform public.review_tag_restoration(p_item_id,case when p_action='reject' then 'retire' else coalesce(p_payload->>'decision','utility') end,p_payload->>'description');
   when 'tag-editorial' then
    v_issue:=v_meta->>'issue_code';
    perform set_config('app.actor','admin:unified-review',true);
    if v_issue in ('article_missing_description','article_unreviewed_prose') and p_action='approve' then
     perform public.review_tag_description(v_entity,coalesce(nullif(p_payload->>'description',''),v_meta->>'description'));
    elsif v_issue='article_ontology_unreviewed' and p_action='approve' then
     perform public.review_tag_ontology(v_entity,coalesce(p_payload->>'decision','none_applicable'));
    elsif v_issue='article_localisation_unreviewed' and p_action='approve' then
     perform public.review_tag_translation(v_entity,p_payload->>'locale',p_payload->>'description');
    elsif p_action='reject' then
     if nullif(trim(p_notes),'') is null then raise exception 'Add a reason for retaining this tag as utility vocabulary'; end if;
     update public.unified_tags set publication_role='utility',publication_role_reviewed_at=now(),
      publication_role_review_note=p_notes,seo_indexable=false,seo_deindex_reason='publication_role:utility' where id=v_entity;
    elsif v_issue in ('utility_indexable','redirect_indexable') then
     update public.unified_tags set seo_indexable=false where id=v_entity;
    else raise exception 'Correct the category or source evidence in the editor first, then refresh the queue.'; end if;
   when 'quality-tag' then
    if p_action='approve' then perform public.approve_entity_review(p_item_id,p_notes,p_confirm);
    else perform public.reject_entity_review(p_item_id,p_notes); end if;
   when 'quality-other' then
    if p_action='approve' then perform public.approve_entity_review(p_item_id,p_notes,p_confirm);
    else perform public.reject_entity_review(p_item_id,p_notes); end if;
   when 'milestone-review' then
    if p_action='approve' then
     if v_meta->>'field'='description' then
      if length(trim(coalesce(p_payload->>'description','')))<30 then raise exception 'Write a replacement description before approving'; end if;
      update public.milestone_review_queue set proposed_value=proposed_value||jsonb_build_object('replacement',p_payload->>'description') where id=p_item_id;
     end if;
     perform public.approve_milestone_review(p_item_id,p_notes);
    else perform public.reject_milestone_review(p_item_id,p_notes); end if;
   when 'milestone-links' then
    if p_action='approve' then perform public.approve_milestone_link_proposal(p_item_id,nullif(p_payload->>'role',''));
    else perform public.reject_milestone_link_proposal(p_item_id); end if;
   when 'milestone-duplicates' then
    perform public.decide_milestone_duplicate_candidate(p_item_id,case when p_action='approve' then 'confirmed' else 'dismissed' end,p_notes);
   when 'business-quality' then
    if p_action='reject' then
     v_result:=public.resolve_business_brand_quality_findings(array[(v_meta->>'finding_id')::bigint],'waive',p_notes);
    else
     perform public.refresh_business_brand_quality();
     if exists(select 1 from public.entity_quality_findings where id=(v_meta->>'finding_id')::bigint and state in ('fail','pending') and waived_at is null) then
      raise exception 'The issue is still present. Correct the record before rechecking.'; end if;
    end if;
   when 'trip-geography' then
    if p_action='reject' then raise exception 'Choose the correct destination to resolve this task'; end if;
    if nullif(p_payload->>'city_id','') is null and nullif(p_payload->>'country_id','') is null then
     raise exception 'Choose a city or country before resolving'; end if;
    if nullif(p_payload->>'city_id','') is not null and nullif(p_payload->>'country_id','') is not null and not exists(
     select 1 from public.cities where id=(p_payload->>'city_id')::uuid and country_id=(p_payload->>'country_id')::uuid) then
     raise exception 'The selected city and country do not match'; end if;
    perform public.resolve_trip_geo_review(p_item_id,nullif(p_payload->>'city_id','')::uuid,nullif(p_payload->>'country_id','')::uuid);
   when 'geography' then
    if p_action='reject' then raise exception 'Geographic evidence conflicts must be corrected, not dismissed'; end if;
    v_check:=public.geo_cms_verify((v_meta->>'place_id')::uuid);
    if v_check->>'verification_status' in ('review','missing','stale') then
     raise exception 'Verification still needs evidence or corrections. Open the record editor.'; end if;
   when 'feedback' then
    if p_action='reject' and nullif(trim(p_notes),'') is null then raise exception 'Add a reason for closing this feedback'; end if;
    update public.community_submissions set feedback_status=case when p_action='approve' then 'planned' else 'done' end,
     resolution=case when p_action='reject' then 'wontfix' else null end,reviewed_by=auth.uid(),reviewed_at=now(),
     reviewer_notes=coalesce(p_notes,reviewer_notes),resolved_at=case when p_action='reject' then now() else null end
     where id=p_item_id and feedback_status in ('new','under_review');
   when 'general-review' then
    if nullif(trim(p_notes),'') is null then raise exception 'Add a review note explaining the outcome'; end if;
    -- resolved_by references profiles.id; the audit actor remains auth.uid().
    select p.id into strict v_reviewer_profile_id
      from public.profiles p where p.user_id=auth.uid();
    update public.review_queue set status=case when p_action='approve' then 'resolved' else 'rejected' end,
     resolved_by=v_reviewer_profile_id,resolved_at=now(),details=coalesce(details,'{}'::jsonb)||jsonb_build_object('review_note',p_notes) where id=p_item_id;
   when 'cms-issues' then
    if nullif(trim(p_notes),'') is null then raise exception 'Add a review note explaining the outcome'; end if;
    update public.cms_review_queue set resolution=case when p_action='approve' then 'resolved' else 'rejected' end,
     resolved_by=auth.uid(),resolved_at=now(),notes=coalesce(p_notes,notes) where id=p_item_id;
   when 'tag-enrichment' then raise exception 'Enrichment decisions must use the application service';
   when 'ai-suggestions' then raise exception 'Enrichment decisions must use the application service';
   else
    v_result:=public.triage_action(p_item_id,p_queue_type,p_action,auth.uid(),p_notes,p_payload->>'canned_slug',false,p_confirm,p_payload);
  end case;
 end if;
 if v_result->>'ok'='false' or v_result->>'error' is not null then
  raise exception '%',coalesce(v_result->>'error','The source refused this decision'); end if;
 insert into public.admin_review_decisions(queue_key,item_id,actor_id,decision,notes)
  values(p_queue_type,p_item_id,auth.uid(),p_action,p_notes);
 return jsonb_build_object('ok',true,'result',v_result);
end $function$



