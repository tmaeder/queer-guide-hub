-- Bounded fixture capacity, not a claim about production throughput.
begin;
insert into public.email_templates(template_key,name,subject,html_content) values('capacity-fixture','Capacity','Capacity','<p>Capacity fixture</p>');
set local role service_role;
insert into public.email_subscribers(email,status,locale,topics,source,consent_version,confirmed_at)
 select 'capacity-'||g||'@example.com','subscribed','en',array['newsletter'],'disposable_capacity_fixture','fixture_only',now() from generate_series(1,10000) g;
do $$
declare c jsonb; a uuid; result jsonb; before_count bigint; after_count bigint; n int; started timestamptz:=clock_timestamp();
begin
 c:=public.email_campaign_save('{"name":"Capacity fixture","template_key":"capacity-fixture","topic":"newsletter"}');
 a:=public.email_campaign_snapshot_begin((c->>'id')::uuid,1);
 for n in 1..11 loop
  select scanned into before_count from public.email_campaign_audiences where id=a;
  result:=public.email_campaign_snapshot_batch(a,1000000);
  select scanned into after_count from public.email_campaign_audiences where id=a;
  assert after_count-before_count<=1000,'worker exceeded its hard batch ceiling';
  exit when result->>'status'='ready';
 end loop;
 assert result->>'status'='ready' and (result->>'scanned')::int=10000;
 assert (select count(*)=10000 from public.email_campaign_audience_members where audience_id=a);
 perform public.email_campaign_snapshot_batch(a,1000);
 assert (select count(*)=10000 from public.email_campaign_audience_members where audience_id=a),'replay duplicated members';
 assert (select count(*)=0 from public.email_outbox),'capacity preparation queued mail';
 raise notice '10,000 fixture contacts collected in 11 bounded batches: % seconds',extract(epoch from clock_timestamp()-started);
end $$;
rollback;
