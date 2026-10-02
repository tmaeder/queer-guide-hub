-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261002092151 with no repo file — the signature of
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
-- The canonical entity-review queue uses `open` (not the legacy `pending`)
-- for actionable rows. Record the already-reviewed Khandwa rejections there.

update public.entity_review_queue
set status='rejected',
    reviewer_note=case id
      when 'd468e1e5-79ab-49f8-93ac-e2406453170f'::uuid then
        'Rejected after source review: the cited national summary does not substantiate the claimed score or the statement that Madhya Pradesh has no relevant protections; India Code lists a Madhya Pradesh Transgender Persons (Protection of Rights) Act.'
      else
        'Rejected after source review: the citation concerns national law and does not support the proposed railway/Nimar editorial copy; the existing city hook is more specific.'
    end,
    reviewed_at=now()
where id in (
  'd468e1e5-79ab-49f8-93ac-e2406453170f'::uuid,
  'e9ee2b94-0ca6-4a13-9a95-65164ba864c1'::uuid
) and status='open';

do $verify$
begin
  if exists(select 1 from public.triage_src_quality_city) then
    raise exception 'city quality queue still has open rows';
  end if;
end
$verify$;
;
