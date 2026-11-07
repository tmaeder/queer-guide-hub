-- A confirmed ship or multi-site program can retain its source label
-- without requesting a single stationary venue from the catalogue.
create or replace function api_private.event_has_verified_nonfixed_location(p_event_id uuid,p_provenance jsonb)
returns boolean
language sql stable set search_path='' as $fn$
  select case when p_provenance#>>'{venue_scope,contract}'='organizer_venue_scope.v1'
    and p_provenance#>>'{venue_scope,scope}' in ('onboard','multi_site')
  then exists (
    select 1
    from public.events e
    join public.event_sources s on s.event_id=e.id and s.is_primary
      and s.source_slug=e.data_source and s.source_entity_id=e.external_id
    cross join lateral (select p_provenance->'venue_scope' as proof) p
    where e.id=p_event_id and e.venue_id is null and nullif(btrim(e.address),'') is null
      and e.is_public and not e.safety_gated and e.duplicate_of_id is null
      and e.status in ('active','completed')
      and (p.proof->>'scope'<>'onboard' or e.event_type='cruise')
      and p.proof->>'title'=e.title and p.proof->>'venue_label'=e.venue_name
      and p.proof->>'city_id'=e.city_id::text and p.proof->>'country_id'=e.country_id::text
      and case when pg_input_is_valid(p.proof->>'start_date','timestamptz')
        and pg_input_is_valid(p.proof->>'end_date','timestamptz')
        then (p.proof->>'start_date')::timestamptz=e.start_date
          and (p.proof->>'end_date')::timestamptz=e.end_date else false end
      and p.proof->>'source_id'=s.id::text and p.proof->>'payload_hash'=s.payload_hash
      and p.proof->>'capture_sha256' ~ '^[a-f0-9]{64}$'
      and p.proof->>'url' ~ '^https://[^/]+/'
      and not exists(select 1 from public.review_queue q where q.entity_type='event'
        and q.entity_id=e.id and q.review_type='venue_link_candidate' and
        (q.resolved_by is not null or q.status='pending' and
          (q.resolved_at is not null or q.details ?| array['manual_hold','manual_review_required',
            'requires_confirm','force_review','human_reviewed'] or q.details->>'hard_blocker'='true')))
      and not exists(select 1 from public.event_quality_issues i where i.event_id=e.id
        and i.issue_code='NAMED_VENUE_UNLINKED' and (i.reviewed_by is not null or i.status='open' and
          (i.reviewed_at is not null or i.resolved_at is not null or i.resolution is not null
            or i.evidence ?| array['manual_hold','manual_review_required','governance_resolution']
            or i.evidence->>'hard_blocker'='true')))
  ) else false end;
$fn$;
revoke all on function api_private.event_has_verified_nonfixed_location(uuid,jsonb) from public,anon,authenticated;
grant execute on function api_private.event_has_verified_nonfixed_location(uuid,jsonb) to service_role;

do $patch$
declare
  definition text;
  target record;
  anchor text:='not api_private.event_source_lists_multiple_venues(e.id,e.data_source,e.external_id,e.venue_name,e.address)';
  addition text:=' and not api_private.event_has_verified_nonfixed_location(e.id,e.field_provenance)';
begin
  for target in select * from (values
    ('public.event_quality_findings(uuid)'::regprocedure,1),
    ('public.find_event_venue_candidates(integer,boolean)'::regprocedure,1),
    ('public.reconcile_event_venue_link_reviews()'::regprocedure,2)
  ) targets(fn,expected) loop
    definition:=pg_get_functiondef(target.fn);
    if position(addition in definition)>0 then continue; end if;
    if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>target.expected then
      raise exception 'Venue review exclusion changed in %',target.fn;
    end if;
    execute replace(definition,anchor,anchor||addition);
  end loop;
end $patch$;
