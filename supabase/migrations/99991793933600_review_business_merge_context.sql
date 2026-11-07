-- Show the recorded venue merge and the organization that owns its survivor.
-- A venue merge establishes the venue relationship. It leaves the decision
-- about organization identity, ownership and missing business fields open.
create function api_private.admin_review_business_merge_context(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object(
  'organization',jsonb_build_object('name',o.name,'city',oc.name,'country',oco.name,
   'website',case when not o.safety_gated then o.website end),
  'previous_venue',case when d.id is not null then jsonb_build_object('name',d.name,
   'city',dc.name,'address',case when not d.safety_gated then d.address end) end,
  'surviving_venue',case when k.id is not null then jsonb_build_object('name',k.name,
   'city',kc.name,'address',case when not k.safety_gated then k.address end,
   'website',case when not k.safety_gated then k.website end,'closed',k.closed_at is not null) end,
  'surviving_organization',case when ko.id is not null then jsonb_build_object('name',ko.name,
   'city',koc.name,'country',kco.name,'website',case when not ko.safety_gated then ko.website end) end,
  'venue_merge_at',a.created_at,
  'pending_fields',case when ko.id is not null and ko.id<>o.id then
   (select coalesce(jsonb_agg(field order by field),'[]'::jsonb)
    from jsonb_object_keys(public.merge_gap_patch('organization',to_jsonb(ko),to_jsonb(o))) field)
   else '[]'::jsonb end)
 from public.organizations o
 left join public.cities oc on oc.id=o.city_id
 left join public.countries oco on oco.id=o.country_id
 left join public.venues d on d.id=o.primary_venue_id and d.organization_id=o.id and d.duplicate_of_id is not null
 left join public.cities dc on dc.id=d.city_id
 left join public.venues k on k.id=d.duplicate_of_id and k.duplicate_of_id is null
 left join public.cities kc on kc.id=k.city_id
 left join public.organizations ko on ko.id=k.organization_id and ko.duplicate_of_id is null
 left join public.cities koc on koc.id=ko.city_id
 left join public.countries kco on kco.id=ko.country_id
 left join lateral(select m.created_at from public.venue_merge_audit m
  where m.drop_id=d.id and m.keep_id=k.id and m.undone_at is null order by m.created_at desc limit 1) a on true
 where o.id=p_id and o.duplicate_of_id is null;
$fn$;
revoke all on function api_private.admin_review_business_merge_context(uuid) from public,anon,authenticated;
grant execute on function api_private.admin_review_business_merge_context(uuid) to service_role;

do $context$
declare definition text:=pg_get_functiondef('api_private.get_admin_review_case_details(uuid)'::regprocedure);
 anchor text:=$anchor$'candidates',v_candidates,'research',to_jsonb(j),$anchor$;
begin
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
  or position('review_case_sources_authorized(c.members)' in definition)=0
  or position('review_case_can_read(c.required_role)' in definition)=0
 then raise exception 'Authorized Review detail contract changed';end if;
 execute replace(definition,anchor,$replacement$'business_context',case when c.family='business_link'
  and c.item->>'entity_table'='organizations' then
  api_private.admin_review_business_merge_context((c.item->>'entity_id')::uuid) else null end,
  'candidates',v_candidates,'research',to_jsonb(j),$replacement$);
end $context$;
