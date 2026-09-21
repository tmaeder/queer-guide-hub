-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991789933191 with no repo file — the signature of
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
-- Resolve the finite date-plausibility backlog from Wikidata precision loss.
-- Preserve the original guard payload under date_plausibility_resolved; never
-- invent an exact date or a review decision.

select set_config('app.actor','editorial:personality-date-guard-repair',true);

-- Modern living people received 1901-01-01 from a coarse Wikidata time claim.
-- Null is the honest representation when the source does not provide a usable
-- birth date; the original imported value remains in the resolved provenance.
update public.personalities p
set birth_date=null,
    needs_attention=false,
    field_provenance=jsonb_set(
      coalesce(p.field_provenance,'{}'::jsonb)-'date_plausibility',
      '{date_plausibility_resolved}',
      (p.field_provenance->'date_plausibility') || jsonb_build_object(
        'resolution','removed_coarse_precision_sentinel','resolved_at',now()), true),
    updated_at=now()
where p.needs_attention
  and p.is_living
  and p.birth_date between date '1900-01-01' and date '1901-12-31'
  and coalesce((p.field_provenance->'date_plausibility'->>'coarse_precision_shape')::boolean,false)
  and coalesce(p.wikidata_qid,'') ~ '^Q[0-9]+$';

-- Rows with an actual death date are already non-living; only the old guard
-- marker remained from an earlier enrichment pass.
update public.personalities p
set needs_attention=false,
    field_provenance=jsonb_set(
      coalesce(p.field_provenance,'{}'::jsonb)-'date_plausibility',
      '{date_plausibility_resolved}',
      (p.field_provenance->'date_plausibility') || jsonb_build_object(
        'resolution','death_date_confirms_not_living','resolved_at',now()), true),
    updated_at=now()
where p.needs_attention and not p.is_living and p.death_date is not null
  and coalesce(p.field_provenance,'{}'::jsonb) ? 'date_plausibility';

-- A historical person born more than 122 years ago cannot be living. This is
-- a deterministic correction even when Wikidata has no death date.
update public.personalities p
set is_living=false,
    needs_attention=false,
    field_provenance=jsonb_set(
      coalesce(p.field_provenance,'{}'::jsonb)-'date_plausibility',
      '{date_plausibility_resolved}',
      (p.field_provenance->'date_plausibility') || jsonb_build_object(
        'resolution','lifespan_bound_confirms_not_living','resolved_at',now()), true),
    updated_at=now()
where p.needs_attention and p.is_living
  and p.birth_date < current_date-interval '122 years'
  and coalesce(p.wikidata_qid,'') ~ '^Q[0-9]+$'
  and coalesce(p.field_provenance,'{}'::jsonb) ? 'date_plausibility';

-- A SKIP sentinel is explicitly not identity evidence. Preserve the record as
-- an archived draft instead of guessing whether its date or identity is real.
update public.personalities p
set review_status='archived', visibility='draft', seo_indexable=false,
    needs_attention=false,
    field_provenance=jsonb_set(
      coalesce(p.field_provenance,'{}'::jsonb)-'date_plausibility',
      '{date_plausibility_resolved}',
      (p.field_provenance->'date_plausibility') || jsonb_build_object(
        'resolution','archived_without_identity_evidence','resolved_at',now()), true),
    updated_at=now()
where p.needs_attention and coalesce(p.wikidata_qid,'') like 'SKIP_%'
  and coalesce(p.field_provenance,'{}'::jsonb) ? 'date_plausibility';

do $verify$
begin
  if exists(
    select 1 from public.personalities p
    where p.needs_attention
      and coalesce(p.review_status,'') not in ('archived','rejected')
      and coalesce(p.field_provenance,'{}'::jsonb) ? 'date_plausibility'
  ) then
    raise exception 'unresolved personality date-plausibility guards remain';
  end if;
end
$verify$;
