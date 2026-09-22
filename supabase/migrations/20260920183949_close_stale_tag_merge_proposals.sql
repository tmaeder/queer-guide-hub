-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260920183949 with no repo file — the signature of
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
-- The remaining merge proposals are embedding-neighbour false positives or
-- stale rows whose endpoints are already merged/deprecated. Keep active pairs
-- distinct permanently so the generator does not recreate the same queue.

select set_config('app.actor','editorial:tag-merge-queue-audit',true);

insert into public.tag_relationship_exclusions(tag1_id,tag2_id,reason)
select least(r.canonical_id,r.duplicate_id),greatest(r.canonical_id,r.duplicate_id),
       'audited merge proposal: related or similarly named, but distinct concepts'
from public.tag_merge_review r
join public.unified_tags c on c.id=r.canonical_id
join public.unified_tags d on d.id=r.duplicate_id
where r.status='pending' and c.status='active' and d.status='active'
on conflict do nothing;

update public.tag_merge_review
set status='rejected',decided_at=now(),decided_by='editorial:tag-merge-queue-audit',
    reason=case
      when reason is null or btrim(reason)='' then 'audited: false positive or stale proposal'
      else reason || ' | audited: false positive or stale proposal'
    end
where status='pending';

do $verify$
begin
  if exists(select 1 from public.tag_merge_review where status='pending') then
    raise exception 'tag merge review queue still contains pending rows';
  end if;
end $verify$;
;
