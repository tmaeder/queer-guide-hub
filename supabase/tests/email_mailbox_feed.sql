-- Owner metadata, folder exclusions and microsecond/UUID cursor boundaries.
begin;
insert into auth.users(id,email) values
 ('88888888-0000-4000-8000-000000000071','mail-feed-owner@example.invalid'),
 ('88888888-0000-4000-8000-000000000072','mail-feed-other@example.invalid');
insert into public.mailbox_emails(id,owner_id,direction,from_address,to_address,subject,status,folder,is_read,email_date,deleted_at) values
 ('88888888-0000-4000-8000-000000000081','88888888-0000-4000-8000-000000000071','outbound','from@example.invalid','to@example.invalid','Sent one','queued','sent',true,'2026-10-24T12:00:00.123456Z',null),
 ('88888888-0000-4000-8000-000000000082','88888888-0000-4000-8000-000000000071','inbound','from@example.invalid','to@example.invalid','Incoming tie','delivered','inbox',false,'2026-10-24T12:00:00.123456Z',null),
 ('88888888-0000-4000-8000-000000000083','88888888-0000-4000-8000-000000000071','outbound','from@example.invalid','to@example.invalid','Older microsecond','accepted','sent',true,'2026-10-24T12:00:00.123455Z',null),
 ('88888888-0000-4000-8000-000000000084','88888888-0000-4000-8000-000000000071','outbound','from@example.invalid','to@example.invalid','Draft excluded','draft','drafts',true,now(),null),
 ('88888888-0000-4000-8000-000000000085','88888888-0000-4000-8000-000000000071','outbound','from@example.invalid','to@example.invalid','Trash excluded','delivered','trash',true,now(),null),
 ('88888888-0000-4000-8000-000000000086','88888888-0000-4000-8000-000000000071','outbound','from@example.invalid','to@example.invalid','Deleted excluded','delivered','sent',true,now(),now()),
 ('88888888-0000-4000-8000-000000000087','88888888-0000-4000-8000-000000000072','outbound','from@example.invalid','to@example.invalid','Foreign excluded','accepted','sent',true,now(),null);
set local role authenticated;
select set_config('request.jwt.claim.sub','88888888-0000-4000-8000-000000000071',true);
do $$
declare first_page uuid[]; next_page uuid[];
begin
 select array_agg(id order by email_date desc,id desc) into first_page from (
  select id,email_date from public.mailbox_emails where owner_id=auth.uid()
  and folder in('inbox','sent') and deleted_at is null order by email_date desc,id desc limit 2) q;
 if first_page is distinct from array['88888888-0000-4000-8000-000000000082','88888888-0000-4000-8000-000000000081']::uuid[] then
  raise exception 'Mail metadata scope or stable order failed: %',first_page;
 end if;
 select array_agg(id order by email_date desc,id desc) into next_page from public.mailbox_emails
 where owner_id=auth.uid() and folder in('inbox','sent') and deleted_at is null
 and email_date<='2026-10-24T12:00:00.123456Z'
 and (email_date<'2026-10-24T12:00:00.123456Z' or (email_date='2026-10-24T12:00:00.123456Z' and id<'88888888-0000-4000-8000-000000000081'));
 if next_page is distinct from array['88888888-0000-4000-8000-000000000083']::uuid[] then
  raise exception 'The cursor skipped a microsecond boundary: %',next_page;
 end if;
 if exists(select 1 from public.mailbox_emails where owner_id='88888888-0000-4000-8000-000000000072') then
  raise exception 'Foreign mailbox metadata escaped RLS';
 end if;
end $$;
reset role;
do $$begin
 if to_regclass('public.idx_mailbox_owner_email_date_id') is null then raise exception 'Missing owner/date mailbox index';end if;
end $$;
rollback;
