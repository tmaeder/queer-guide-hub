-- Run after 99991790271091_event_data_quality_programme.sql on a non-production DB:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/event_data_quality_programme.sql
begin;

do $$ begin
  assert public.event_quality_url_is_safe('https://events.example.org/show'),
    'qualified public URL rejected';
  assert not public.event_quality_url_is_safe('https://public.example@127.0.0.1/private'),
    'credential-prefixed private URL accepted';
  assert not public.event_quality_url_is_safe('https://user:secret@events.example.org/show'),
    'credentialed URL accepted';
  assert not public.event_quality_url_is_safe('http://metadata/latest'),
    'unqualified hostname accepted';
  assert not public.event_quality_url_is_safe('http://100.64.0.1/latest'),
    'CGNAT address accepted';
  assert not public.event_quality_url_is_safe('http://[::ffff:7f00:1]/'),
    'IPv4-mapped IPv6 accepted';
end $$;

do $$
declare
  v_id uuid;
  v_historical_id uuid;
  v_quality jsonb;
  v_issue uuid;
  v_before text[];
  v_claim_one uuid:=gen_random_uuid();
  v_claim_two uuid:=gen_random_uuid();
  v_claimed integer;
begin
  -- Production has an insert/update guard that deterministically converts
  -- null-island coordinates to NULL. Bypass user triggers only for this fixture
  -- so the detector's legacy-corruption path remains covered.
  set local session_replication_role = replica;
  insert into public.events(
    title,slug,description,start_date,end_date,event_type,latitude,longitude,
    website,images,data_source,external_id,status
  ) values (
    'Event quality fixture','event-quality-fixture',
    'Erfasse deinen Event schnell & einfach – und mach ihn zum Publikumsmagneten.',
    now()+interval '10 days',now()+interval '10 days 2 hours','other',0,0,
    'javascript:alert(1)',array['https://example.test/default_event.png'],
    'quality-fixture','event-1','active'
  ) returning id into v_id;
  set local session_replication_role = origin;

  v_quality:=public.compute_event_quality(v_id);
  assert v_quality->>'quality_tier'='fail','critical defects must force fail';
  assert (v_quality->'blocker_codes') ? 'GEO_NULL_ISLAND','null-island blocker missing';
  assert (v_quality->'blocker_codes') ? 'WEBSITE_INVALID','invalid URL blocker missing';
  assert (v_quality->'blocker_codes') ? 'IMAGE_PLACEHOLDER','placeholder image blocker missing';
  assert (v_quality->'issue_codes') ? 'DESCRIPTION_BOILERPLATE','boilerplate detector missing';
  assert (v_quality->>'event_scope')='current','future fixture was not current';

  select count(*) into v_claimed
  from public.claim_event_image_quality_candidates(v_claim_one,5000);
  assert v_claimed>0,'image quality worker failed to acquire a lease';
  select count(*) into v_claimed
  from public.claim_event_image_quality_candidates(v_claim_two,5000);
  assert v_claimed=0,'overlapping image quality worker bypassed the lease';
  perform public.release_event_quality_worker_lease('event-image-quality',v_claim_one);

  insert into public.events(title,slug,description,start_date,end_date,event_type,
    data_source,external_id,status)
  values('Historical quality fixture','historical-quality-fixture',
    'An attributable archival description that is long enough to be meaningful.',
    now()-interval '2 years',now()-interval '2 years'+interval '2 hours','social',
    'quality-fixture','historical-1','completed') returning id into v_historical_id;
  v_quality:=public.compute_event_quality(v_historical_id);
  assert v_quality->>'event_scope'='historical','past fixture was not historical';
  assert not((v_quality->'issue_codes') ? 'CURRENT_URL_MISSING'),
    'historical event incorrectly required a current ticket/source URL';

  insert into public.dedup_review_queue(entity_type,keep_id,drop_id,confidence,reason,status,created_at)
  values('event',v_id,v_historical_id,0.60,'quality-fixture','open',now()-interval '15 days');
  v_quality:=public.compute_event_quality(v_id);
  assert (v_quality->'issue_codes') ? 'DEDUP_CANDIDATE',
    'unresolved dedup candidate was not surfaced as a quality issue';
  assert (select duplicate_of_id is null from public.events where id=v_id),
    'quality assessment merged a candidate instead of preserving review';

  perform public.run_event_quality_scan(5000,'current',false);
  assert exists(select 1 from public.event_quality_current where event_id=v_id),
    'scanner did not persist current assessment';
  assert (select count(*) from public.event_quality_issues
          where event_id=v_id and issue_code='GEO_NULL_ISLAND' and status='open')=1,
    'scanner did not create exactly one open issue';

  delete from public.event_quality_current where event_id=v_id;
  perform public.run_event_quality_scan(5000,'current',false);
  assert (select count(*) from public.event_quality_issues
          where event_id=v_id and issue_code='GEO_NULL_ISLAND' and status='open')=1,
    'idempotent scan duplicated an open issue';

  select id into v_issue from public.event_quality_issues
  where event_id=v_id and issue_code='CATEGORY_UNRESOLVED' and status='open';
  perform public.decide_event_quality_issue(v_issue,'accepted','Source provides no defensible category.');
  assert exists(select 1 from public.event_quality_issues where id=v_issue and status='accepted'
    and resolution='Source provides no defensible category.'),'accepted disposition was not audited';

  select images into v_before from public.events where id=v_id;
  perform public.run_event_quality_repairs(500,true);
  assert (select images from public.events where id=v_id)=v_before,
    'dry-run repair mutated the public event';

  update public.events set latitude=null,longitude=null,website=null,
    images='{}'::text[],updated_at=now()+interval '1 second' where id=v_id;
  delete from public.event_quality_current where event_id=v_id;
  perform public.run_event_quality_scan(5000,'current',false);
  assert not exists(select 1 from public.event_quality_issues where event_id=v_id
    and issue_code in ('GEO_NULL_ISLAND','WEBSITE_INVALID','IMAGE_PLACEHOLDER') and status='open'),
    'cleared deterministic defects remained open';
  assert exists(select 1 from public.event_quality_issues where id=v_issue and status='accepted'),
    'rescan erased an explicit disposition';

  insert into public.event_quality_issues(event_id,dimension,issue_code,detector,severity,
    evidence,evidence_hash)
  values(v_id,'media','IMAGE_UNREACHABLE','event-image-quality','high',
    '{"reason":"fixture"}'::jsonb,md5('{"reason":"fixture"}'));
  delete from public.event_quality_current where event_id=v_id;
  perform public.run_event_quality_scan(5000,'current',false);
  assert exists(select 1 from public.event_quality_issues where event_id=v_id
    and issue_code='IMAGE_UNREACHABLE' and detector='event-image-quality' and status='open'),
    'SQL scanner resolved another detector''s issue';

  assert (select enforcement_enabled=false from public.event_quality_rollout where singleton),
    'programme must deploy in shadow mode';
  assert not has_table_privilege('anon','public.event_quality_issues','select'),
    'anonymous role can read admin-only issue evidence';
  assert not has_table_privilege('authenticated','public.event_quality_worker_leases','select'),
    'authenticated role can read internal worker leases';
  assert has_table_privilege('authenticated','public.event_quality_issues','select'),
    'authenticated admin path lacks table select grant (RLS supplies row authorization)';
end;
$$;

rollback;
