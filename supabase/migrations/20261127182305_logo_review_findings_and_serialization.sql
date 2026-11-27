-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127182305 with no repo file — the signature of
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
-- Serialize cross-entity logo writes, whose sync triggers can otherwise deadlock.
create or replace function public.logo_review_finish(p_table text,p_id uuid,p_lease uuid,p_url text,p_reason text,p_evidence jsonb,p_on_ink boolean default false)
returns text language plpgsql security invoker set search_path='' as $$
declare et text; case_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('logo_review_finish',0));
 et:=case p_table when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' when 'marketplace_brands' then 'marketplace_brand' else null end;
 if et is null then raise exception 'invalid review entity'; end if;
 select id into case_id from public.review_queue where entity_type=et and entity_id=p_id and review_type='logo_quality'
   and status in ('pending','open','pending_review','review') limit 1 for update;
 if not found then
   update public.logo_quality_jobs set status='superseded',reason='review_already_decided',updated_at=now()
    where entity_table=p_table and entity_id=p_id and lease=p_lease and status='processing';
   return 'review_already_decided';
 end if;
 return public.logo_quality_finish(p_table,p_id,p_lease,'repaired',p_url,p_reason,p_evidence,p_on_ink);
end $$;

-- Persist failed verification attempts in the existing admin review case.
-- Does not change the entity image or revive a case a person has decided.
create function public.logo_review_record_findings(p_findings jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare finding jsonb; changed integer:=0; rows_changed integer; et text;
begin
 if jsonb_typeof(p_findings)<>'array' or jsonb_array_length(p_findings)>500 then raise exception 'invalid findings batch'; end if;
 for finding in select value from jsonb_array_elements(p_findings) loop
  et:=case finding->>'entity_table' when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' when 'marketplace_brands' then 'marketplace_brand' else null end;
  if et is null then continue; end if;
  update public.logo_quality_jobs j set
    reason='official_source_unverified: '||left(finding->>'reason',120),
    evidence=j.evidence||jsonb_build_object('official_source_review',finding->'evidence','automatic',false),
    checked_at=now(),updated_at=now()
  where j.entity_table=finding->>'entity_table' and j.entity_id=(finding->>'entity_id')::uuid
    and j.status in ('review','quarantined')
    and j.expected_url is not distinct from finding->>'expected_url'
    and j.expected_website is not distinct from finding->>'expected_website'
    and exists(select 1 from public.review_queue r where r.entity_type=et and r.entity_id=j.entity_id
      and r.review_type='logo_quality' and r.status in ('pending','open','pending_review','review'));
  get diagnostics rows_changed=row_count; changed:=changed+rows_changed;
 end loop;
 return changed;
end $$;
revoke all on function public.logo_review_record_findings(jsonb) from public,anon,authenticated;
grant execute on function public.logo_review_record_findings(jsonb) to service_role;
;
