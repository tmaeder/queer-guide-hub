-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261002092832 with no repo file — the signature of
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
-- The hourly city composer ran once between the human decision and deployment
-- of its rejected-proposal guard. Reject that final race-window pair.

update public.entity_review_queue
set status='rejected', reviewed_at=now(),
    reviewer_note=case field
      when 'lgbt_friendly_rating' then
        'Rejected after source review: the cited national summary does not substantiate the claimed score or the statement that Madhya Pradesh has no relevant protections; unchanged re-proposals are now suppressed by the city composer.'
      else
        'Rejected after source review: the citation concerns national law and does not substantiate the proposed local editorial hook; unchanged re-proposals are now suppressed by the city composer.'
    end
where id in (
  '5f71f571-210f-473e-a288-f16aaa1f4214'::uuid,
  'b510ec4a-783e-475c-bec5-ec492fc2c6bf'::uuid
) and status='open';

do $verify$
begin
  if exists(select 1 from public.triage_src_quality_city) then
    raise exception 'city quality queue still has open rows';
  end if;
end
$verify$;
;
