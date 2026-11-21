\set ON_ERROR_STOP 1
create or replace function pg_temp.check(c boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(c,false) then raise exception 'FAIL: %', msg; end if; raise notice 'ok: %', msg; end $$;
insert into venues(id,name,description) values ('00000000-0000-0000-0000-000000000001','Trumps','Trumps is a club in Lisbon.');
insert into venues(id,name,description,safety_gated) values ('00000000-0000-0000-0000-000000000002','Gated','A bar.',true);
insert into events(id,title,description,venue_name,start_date) values ('00000000-0000-0000-0000-0000000000e1','Pride Night','A party at Trumps.','Trumps', now()+interval '3 days');
insert into events(id,title,description,start_date) values ('00000000-0000-0000-0000-0000000000e2','Old Party','Was fun.', now()-interval '30 days');
insert into organizations(id,name,description) values ('00000000-0000-0000-0000-0000000000a1','ILGA','An association.');

-- 1. anon demand
set role anon;
select request_translation('venues','00000000-0000-0000-0000-000000000001','de') as n1 \gset
select request_translation('venues','00000000-0000-0000-0000-000000000001','de') as n2 \gset
select request_translation('venues','00000000-0000-0000-0000-000000000002','de') as n_gated \gset
select request_translation('venues','00000000-0000-0000-0000-000000000001','xx') as n_badloc \gset
select request_translation('events','00000000-0000-0000-0000-0000000000e2','de') as n_past \gset
select request_translation('events','00000000-0000-0000-0000-0000000000e1','fr') as n_event \gset
reset role;
select pg_temp.check(:n1=1 and :n2=1, 'anon enqueues; repeat is idempotent');
select pg_temp.check((select count(*) from translation_jobs where entity_type='venues' and target_lang='de')=1 and (select priority from translation_jobs where entity_type='venues' and target_lang='de')=101, 'repeat demand bumps priority, one row');
select pg_temp.check(:n_gated=0, 'anon cannot enqueue a safety-gated venue');
select pg_temp.check(:n_badloc=0, 'unknown locale ignored');
select pg_temp.check(:n_past=0, 'past event not enqueued');
select pg_temp.check(:n_event=2, 'event enqueues title + description');

set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select request_translation('venues','00000000-0000-0000-0000-000000000002','de') as n_auth \gset
reset role; select set_config('request.jwt.claim.sub','',false);
select pg_temp.check(:n_auth=1, 'signed-in user can enqueue a gated venue');

-- 2. anon cannot touch the queue
set role anon;
\set ON_ERROR_STOP 0
select count(*) from translation_jobs;
select claim_translation_jobs(1,0);
\set ON_ERROR_STOP 1
reset role;

-- 3. worker claim + commit
set role service_role;
select job_id, source_text, source_hash, protected_name, context_text from claim_translation_jobs(1, 0) \gset
reset role;
select pg_temp.check(:'source_text' = 'Trumps is a club in Lisbon.' and :'protected_name'='Trumps', 'claim returns highest-priority job with source + name');
select pg_temp.check((select status from translation_jobs where id=:job_id)='running', 'claimed job is running');
set role service_role;
select commit_translation(:job_id, 'Trumps ist ein Club in Lissabon.', :'source_hash', 'en', 'translategemma-4b-it.Q4_K_M') as r \gset
reset role;
select pg_temp.check(:'r'='committed', 'commit returns committed');
select pg_temp.check((select description_i18n->>'de' from venues where id='00000000-0000-0000-0000-000000000001')='Trumps ist ein Club in Lissabon.', 'i18n map written');
select pg_temp.check((select status||source_lang||model from content_translations where record_id='00000000-0000-0000-0000-000000000001' and language='de')='machineentranslategemma-4b-it.Q4_K_M', 'ledger row written');
set role anon;
select request_translation('venues','00000000-0000-0000-0000-000000000001','de') as n_again \gset
reset role;
select pg_temp.check(:n_again=0, 'already translated → not re-enqueued');

-- 4. source edit → stale + re-queue only that locale
update venues set description='Trumps is the best-known queer club in Lisbon.' where id='00000000-0000-0000-0000-000000000001';
select pg_temp.check((select coalesce(description_i18n,'{}')='{}'::jsonb from venues where id='00000000-0000-0000-0000-000000000001'), 'edit clears translations (readers fall back)');
select pg_temp.check((select status from content_translations where record_id='00000000-0000-0000-0000-000000000001' and language='de')='stale', 'ledger marked stale');
select pg_temp.check((select count(*) from translation_jobs where entity_id='00000000-0000-0000-0000-000000000001' and status='pending' and target_lang='de' and priority=90)=1, 're-queued de at priority 90');
update venues set name='Trumps!' where id='00000000-0000-0000-0000-000000000001';
select pg_temp.check((select count(*) from translation_jobs where entity_id='00000000-0000-0000-0000-000000000001' and status='pending')=1, 'non-source edit does nothing');


-- ---------------- part 2 ----------------
delete from translation_jobs; delete from content_translations;
-- 6. mid-translation source change
set role anon; select request_translation('organizations','00000000-0000-0000-0000-0000000000a1','ja') as x \gset
reset role;
set role service_role; select job_id as j, source_hash as h from claim_translation_jobs(5,0) \gset
reset role;
update organizations set description='An international association.' where id='00000000-0000-0000-0000-0000000000a1';
set role service_role; select commit_translation(:j, '協会です。', :'h', 'en', 'm') as r \gset
reset role;
select pg_temp.check(:'r'='stale', 'commit rejected when source changed mid-flight');
select pg_temp.check((select description_i18n is null or description_i18n='{}'::jsonb from organizations where id='00000000-0000-0000-0000-0000000000a1'), 'stale result not published');
-- the edit had no prior translation of ja in the ledger, so a fresh demand is needed
set role anon; select request_translation('organizations','00000000-0000-0000-0000-0000000000a1','ja') as x2 \gset
reset role;
select pg_temp.check(:x2=1, 'new demand after edit enqueues against new source');
set role service_role; select job_id as j, source_hash as h from claim_translation_jobs(5,0) \gset
select commit_translation(:j, '国際的な協会です。', :'h', 'en', 'm') as r \gset
reset role;
select pg_temp.check(:'r'='committed' and (select description_i18n->>'ja' from organizations)='国際的な協会です。', 'organization translation committed');

-- 7. retry / backoff / failed
set role anon; select request_translation('venues','00000000-0000-0000-0000-000000000001','ko') as x \gset
reset role;
set role service_role; select job_id as jf from claim_translation_jobs(1,0) \gset
select fail_translation_job(:jf, 'token_lost', true) as s1 \gset
reset role;
select pg_temp.check(:'s1'='pending' and (select not_before > now() from translation_jobs where id=:jf), 'retryable failure → pending with backoff');
update translation_jobs set not_before=now() where id=:jf;
set role service_role; select job_id as jf from claim_translation_jobs(1,0) \gset
select fail_translation_job(:jf, 'token_lost', true) as s2 \gset
reset role;
update translation_jobs set not_before=now() where id=:jf;
set role service_role; select job_id as jf from claim_translation_jobs(1,0) \gset
select fail_translation_job(:jf, 'token_lost', true) as s3 \gset
reset role;
select pg_temp.check(:'s2'='pending' and :'s3'='failed', 'third attempt → failed');
set role anon; select request_translation('venues','00000000-0000-0000-0000-000000000001','ko') as x3 \gset
reset role;
select pg_temp.check(:x3=0, 'failed job for same source is not re-requested on every view');

-- 8. abandoned running job is reclaimed
set role anon; select request_translation('events','00000000-0000-0000-0000-0000000000e1','ar') as x \gset
reset role;
set role service_role; select job_id as ja from claim_translation_jobs(1,0) \gset
reset role;
update translation_jobs set locked_at=now()-interval '1 hour' where id=:ja;
set role service_role; select count(*) as reclaimed from claim_translation_jobs(5,0) where job_id=:ja \gset
reset role;
select pg_temp.check(:reclaimed=1, 'abandoned running job reclaimed');

-- 9. backfill + quiet-hours min priority
delete from translation_jobs;
set role service_role; select enqueue_translation_backfill('venues', array['de','fr'], 100, 10) as nb \gset
select count(*) as claimable_quiet from claim_translation_jobs(5, 50) \gset
reset role;
select pg_temp.check(:nb=4, 'backfill enqueues every untranslated (venue, locale): 2 venues × 2 locales');
select pg_temp.check(:claimable_quiet=0, 'min-priority claim skips backfill jobs during quiet hours');

-- 10. human_reviewed kept
update content_translations set status='human_reviewed', source_hash=translation_hash('An international association.') where table_name='organizations';
update organizations set description_i18n='{}' where true;
set role anon; select request_translation('organizations','00000000-0000-0000-0000-0000000000a1','ja') as x \gset
reset role;
set role service_role; select job_id as j, source_hash as h from claim_translation_jobs(5,90) \gset
select commit_translation(:j, 'machine text', :'h', 'en', 'm') as r \gset
reset role;
select pg_temp.check(:'r'='kept', 'human_reviewed translation of the same source is not overwritten');

-- 11. old pipeline
select pg_temp.check((select count(*) from i18n_translation_targets where enabled)=2 and (select bool_and(table_name='cities') from i18n_translation_targets where enabled), 'only the three NAS fields were disabled');
set role service_role; select translation_queue_signals() is not null as sig \gset
reset role;
select pg_temp.check(:'sig'='t', 'signals RPC works for service_role');
