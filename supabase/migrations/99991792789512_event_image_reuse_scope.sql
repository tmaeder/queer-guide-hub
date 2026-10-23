-- Match the SQL scanner's recurring-artwork policy and count current events,
-- rather than historical observation rows, in the external image auditor.
create function public.event_image_reuse_assessment(p_event_id uuid,p_image_url text,p_content_hash text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $fn$
declare target public.events%rowtype; event_count bigint; recurring boolean;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Image reuse assessment requires an internal actor';end if;
 if p_content_hash is null or p_content_hash!~'^[0-9a-f]{64}$'then
  raise exception 'A SHA-256 content hash is required' using errcode='22023';end if;
 select *into target from public.events where id=p_event_id;
 if not found or target.images[1]is distinct from p_image_url or target.duplicate_of_id is not null
  or coalesce(target.status,'active')in('archived','rejected','cancelled')then
  return jsonb_build_object('contract','current-event-artwork-reuse:v1','current_image',false,
   'should_flag',false,'reason','event_or_primary_image_changed');end if;
 select count(distinct observed.event_id)into event_count
 from public.event_image_quality_observations observed
 join public.events peer on peer.id=observed.event_id
 where observed.content_hash=p_content_hash and observed.probe_status='pass'
  and peer.images[1]=observed.image_url and peer.duplicate_of_id is null
  and coalesce(peer.status,'active')not in('archived','rejected','cancelled');
 recurring:=coalesce(target.is_recurring,false)or target.series_key is not null;
 return jsonb_build_object('contract','current-event-artwork-reuse:v1','current_image',true,
  'event_count',event_count,'is_recurring',coalesce(target.is_recurring,false),
  'series_key',target.series_key,'should_flag',event_count>=10 and not recurring,
  'reason',case when recurring then 'declared_recurring_artwork'
   when event_count<10 then 'below_distinct_current_event_threshold' else 'unrelated_event_reuse' end);
end $fn$;
revoke all on function public.event_image_reuse_assessment(uuid,text,text)from public,anon,authenticated;
grant execute on function public.event_image_reuse_assessment(uuid,text,text)to service_role;
