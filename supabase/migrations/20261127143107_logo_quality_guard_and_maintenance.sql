-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127143107 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Visually reviewed shared marks on unrelated business domains, 2026-11-27.
insert into public.logo_denied_marks(sha256,label,note) values
 ('09dbd5e4f89b4f35da8bae0ea84caa33f8e888c525c7644e8d2e2699fa48c5eb','stock cube','Identical grey stock cube on 23 unrelated domains.'),
 ('b374336ac49ab44c84fec3263add58b347db8b012299a40b3bb8a7325e88af62','stock home icon','White outline house on black; unrelated businesses.'),
 ('7e854e5517c23c0509fd47f2e389a19a2c8301a1907645180d6f736b9857fb86','WordPress','New encoding of the blue WordPress W.'),
 ('2e1d4ad05623f429853cc5bc2536331e3f156c74ff66f157f6b2da3fce1c52a4','blank','Transparent blank image on unrelated sites.'),
 ('92fd8e08d4cfb9e6792db82ab2beb4e1e996e2fbee02e7772412124f23e4385e','generic rainbow flag','Shared decoration rather than an entity mark.'),
 ('62304d555142e477d7e650ded68c781ea2e2c21963efb09aca2663ab2b3465a5','DISH by METRO','Restaurant website/menu platform; not each restaurant logo.'),
 ('375ad838bd34c9d70229426ae9c45813f7853575768ffff1c97f0ff9c1a8e5a8','FC2','FC2 hosting platform mark.'),
 ('e477bc19aaa928338fba2269e6912fa46a2c02c180bb900451bbe122c1ffb768','stock layout icon','Generic blue page-layout thumbnail across unrelated sites.'),
 ('0b2842229fe6f5a4bfb6255ffa9ffa859f92427e48cb46b9449180749b356657','stock pencil icon','Generic editing pencil on unrelated sites.'),
 ('c78a0201720ec903d9c2e6c6bb849a25487d9fdf9a449d4a1aa2fa19245adb1e','Jimdo','Site-builder J on unrelated sites.')
on conflict do nothing;
insert into public.logo_platform_domains(value,match_mode,class) values
 ('wikipedia.org','suffix','aggregator'),('berlin.de','suffix','aggregator'),
 ('fc2.com','suffix','builder'),('dish.co','suffix','builder')
on conflict do nothing;

create index logo_quality_jobs_site_identity on public.logo_quality_jobs(expected_website,entity_name) where checked_at is not null;

-- New automated imports cannot publish an unchecked image while waiting for
-- the audit worker. Verified worker writes and explicit admin edits are exempt.
create or replace function public.logo_quality_enqueue() returns trigger language plpgsql
security definer set search_path='' as $$
declare j jsonb := to_jsonb(new); submitted text := j->>'logo_url'; prior text;
  bad boolean := false; held boolean := false; meta jsonb := '{}'; et text;
begin
 if current_setting('app.logo_quality_writer',true)='on' then return new; end if;
 if tg_op='UPDATE' then prior := old.logo_url; end if;
 bad := new.logo_url is not null and public.logo_mark_denied(new.logo_url);
 held := new.logo_url is not null and not bad and submitted is distinct from prior
   and not coalesce(public.has_role_jwt('admin'),false);
 if bad then new.logo_url := null;
 elsif held then new.logo_url := prior;
 end if;
 if tg_op='UPDATE' and not held and not bad and new.logo_url is not distinct from old.logo_url and new.website is not distinct from old.website then return new; end if;
 if new.logo_url is null and new.website is null and submitted is null then return new; end if;
 if bad then meta := jsonb_build_object('blocked_url',submitted); end if;
 if held then meta := jsonb_build_object('submitted_url',submitted); end if;
 insert into public.logo_quality_jobs(entity_table,entity_id,entity_name,expected_url,expected_website,evidence)
 values(tg_table_name,new.id,coalesce(j->>'name',j->>'title',j->>'display_name',''),new.logo_url,new.website,meta)
 on conflict(entity_table,entity_id) do update set
   entity_name=excluded.entity_name,expected_url=excluded.expected_url,expected_website=excluded.expected_website,
   status='pending',attempts=0,lease=null,updated_at=now(),checked_at=null,candidate_url=null,reason=null,evidence=excluded.evidence;
 if bad or held then
   et := case tg_table_name when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' else 'marketplace_brand' end;
   insert into public.logo_quality_history(entity_table,entity_id,previous_url,replacement_url,previous_website,outcome,evidence)
   values(tg_table_name,new.id,prior,new.logo_url,new.website,case when bad then 'write_guard' else 'held_for_verification' end,meta);
   if not exists(select 1 from public.review_queue where entity_type=et and entity_id=new.id and review_type='logo_quality' and status in ('pending','open','pending_review','review')) then
     insert into public.review_queue(entity_type,entity_id,review_type,details)
     values(et,new.id,'logo_quality',jsonb_build_object('title',coalesce(j->>'name',j->>'title',j->>'display_name',''),
       'field','logo_url','previous_url',prior,'current_url',new.logo_url,'submitted_url',submitted,
       'reason',case when bad then 'known_platform_or_cms_mark_removed' else 'imported_logo_held_for_verification' end,'website',new.website));
   end if;
 end if;
 return new;
end $$;
revoke all on function public.logo_quality_enqueue() from public,anon,authenticated;

update public.venues set logo_url=logo_url where public.logo_mark_denied(logo_url);
update public.events set logo_url=logo_url where public.logo_mark_denied(logo_url);
update public.organizations set logo_url=logo_url where public.logo_mark_denied(logo_url);
update public.marketplace_brands set logo_url=logo_url where public.logo_mark_denied(logo_url);

create function public.logo_quality_close_verified_review() returns trigger language plpgsql
security definer set search_path='' as $$
begin
 if new.status in ('verified','repaired') then
   update public.review_queue set status='resolved',resolved_at=now(),details=coalesce(details,'{}')||
     jsonb_build_object('resolution','verified_official_logo','replacement_url',new.candidate_url,'evidence',new.evidence)
   where entity_id=new.entity_id and review_type='logo_quality' and status in ('pending','open','pending_review','review');
 end if;
 return new;
end $$;
revoke all on function public.logo_quality_close_verified_review() from public,anon,authenticated;
create trigger logo_quality_close_review after update of status on public.logo_quality_jobs
 for each row execute function public.logo_quality_close_verified_review();

-- New writes enqueue automatically; this existing application scheduler drains
-- bounded work continuously. It is deliberately small enough for edge CPU limits.
select cron.schedule('logo-quality-repair','*/5 * * * *', $cron$
 select net.http_post(
   url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/logo-quality-repair',
   headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',
     (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
   body:='{"table":"all","batch_size":8}'::jsonb,timeout_milliseconds:=250000);
$cron$);
;
