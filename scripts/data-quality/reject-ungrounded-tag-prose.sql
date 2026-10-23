-- Default dry run. Native application decisions, not direct queue updates.
-- Real HTTP decisions commit independently; SQL rollback cannot undo them.
-- Do not lock suggestions here: the native endpoint uses a separate DB session.
set statement_timeout='60s';
do $cleanup$
declare dry_run boolean:=true;batch_size integer:=20;r record;response record;
 candidates integer:=0;rejected integer:=0;stale integer:=0;failure jsonb;note text;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Automatic cleanup requires an internal actor'; end if;
 for r in
  select s.id,s.updated_at,s.status,s.source_model,s.proposed_value->>'field' field,
   md5(s.proposed_value::text) proposal_md5,
   case when t.human_reviewed then 'preserve_human_reviewed_prose' else 'ungrounded_low_confidence_prose' end reason
  from public.ai_suggestions s join public.unified_tags t on t.id=s.entity_id
  where s.entity_type='unified_tags' and s.suggestion_type='description' and s.source='workers-ai'
   and s.source_model='gpt-4o-mini' and s.status='pending' and s.applied_at is null
   and s.reviewer_id is null and s.approved_at is null and s.review_notes is null and s.locale is null
   and (s.expires_at is null or s.expires_at>now())
   and s.proposed_value->>'field' in('description','short_description')
   and (t.human_reviewed or (s.confidence<=0.5 and s.current_value->>'value' is null
    and s.proposed_value->>'field'='description'))
  order by s.id limit greatest(0,least(batch_size,20))
 loop
  candidates:=candidates+1;
  if dry_run then continue; end if;
  note:='auto-reject-tag-prose:v1 '||jsonb_build_object('reason',r.reason,'source_model',r.source_model,
   'field',r.field,'proposal_md5',r.proposal_md5,'automated',true,'human_reviewed',false,
   'explanation','Reject unsupported model prose and preserve the original tag; no factual replacement or human verification is asserted.')::text;
  select h.status,h.content::jsonb result into response from extensions.http((
   'PATCH','https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/search-intelligence/suggestions/'||r.id,
   array[('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key'))::extensions.http_header,
    ('X-Internal-Secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret'))::extensions.http_header],
   'application/json',jsonb_build_object('status','rejected','expected_status',r.status,
    'expected_updated_at',r.updated_at,'review_notes',note)::text)::extensions.http_request) h;
  if response.status=200 and response.result#>>'{data,status}'='rejected' then rejected:=rejected+1;
  elsif response.status=409 then stale:=stale+1;
  else failure:=jsonb_build_object('id',r.id,'http_status',response.status,'error',response.result->>'error');exit;end if;
 end loop;
 perform set_config('matching.tag_prose_cleanup',jsonb_build_object('dry_run',dry_run,'candidates',candidates,
  'rejected',rejected,'stale',stale,'failure',failure)::text,false);
end $cleanup$;
select current_setting('matching.tag_prose_cleanup')::jsonb result;
