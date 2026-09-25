-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260925112543 with no repo file — the signature of
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
begin;

create or replace function public.country_quality_health()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
  with q as materialized (
    select * from public.country_quality_profile
  ),
  issues as (
    select issue_code, count(*)::integer affected
    from q
    cross join lateral unnest(q.issue_codes) as issue_code
    group by issue_code
  ),
  dimensions as (
    select d.name, round(avg(d.score), 1) average
    from q
    cross join lateral (values
      ('identity', q.identity_score),
      ('hierarchy', q.hierarchy_score),
      ('editorial', q.editorial_score),
      ('rights', q.rights_score),
      ('imagery', q.imagery_score),
      ('relationships', q.relationships_score),
      ('provenance', q.provenance_score),
      ('translation', q.translation_score)
    ) d(name, score)
    group by d.name
  ),
  editorial_checks as materialized (
    select
      d.id,
      nullif(btrim(d.draft_hook), '') is null as empty_hook,
      nullif(btrim(d.draft_long), '') is null as empty_long,
      char_length(d.draft_hook) > 120 as hook_over_120,
      (select count(*) from regexp_matches(btrim(coalesce(d.draft_long, '')), '[.!?]+([[:space:]]+|$)', 'g'))
        not between 3 and 5 as invalid_sentence_count,
      lower(coalesce(d.draft_hook, '') || ' ' || coalesce(d.draft_long, ''))
        ~ '\m(discover|explore|unlock|curated|journey|amazing|tailored|personalized|vibrant|charming|hidden gem|must-see)\M'
        as banned_word,
      lower(coalesce(d.draft_hook, '') || ' ' || coalesce(d.draft_long, ''))
        ~ '\m(you|your|yours)\M' as second_person,
      coalesce(d.source_hash, '') !~ '^[0-9a-f]{64}$' as missing_grounding_hash,
      jsonb_typeof(d.citations) <> 'array'
        or not exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(d.citations) = 'array' then d.citations else '[]'::jsonb end
          ) citation
          where citation->>'role' = 'rights'
            and nullif(citation->>'source', '') is not null
            and nullif(citation->>'source_ref', '') is not null
            and nullif(citation->>'observed_at', '') is not null
            and jsonb_typeof(citation->'claims') = 'object'
        )
        or not exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(d.citations) = 'array' then d.citations else '[]'::jsonb end
          ) citation
          where citation->>'role' = 'country_facts'
            and nullif(citation->>'source', '') is not null
            and nullif(citation->>'source_ref', '') is not null
            and nullif(citation->>'observed_at', '') is not null
            and jsonb_typeof(citation->'claims') = 'object'
        ) as missing_evidence
    from public.editorial_drafts d
    where d.entity_type = 'country' and d.status = 'pending'
  ),
  editorial_readiness as materialized (
    select *, (
      empty_hook or empty_long or hook_over_120 or invalid_sentence_count
      or banned_word or second_person or missing_grounding_hash or missing_evidence
    ) as blocked
    from editorial_checks
  ),
  translation_checks as materialized (
    select
      s.id,
      s.current_value->>'source_hash' is distinct from
        encode(extensions.digest(coalesce(c.description, ''), 'sha256'), 'hex') as stale_source,
      nullif(btrim(s.proposed_value->>'value'), '') is null as empty_value,
      s.proposed_value->>'field' is distinct from 'description' as wrong_field,
      lower(btrim(s.proposed_value->>'value')) = lower(btrim(s.current_value->>'value')) as unchanged,
      coalesce(s.proposed_value->>'value', '') ~ '&(#?[0-9A-Za-z]+);|<[^>]+>' as html_residue,
      count(*) over (
        partition by s.entity_id, s.locale, s.proposed_value->>'field'
      ) > 1 as duplicate_tuple
    from public.ai_suggestions s
    join public.countries c on c.id = s.entity_id
    where s.entity_type = 'countries'
      and s.suggestion_type = 'translation'
      and s.status = 'pending'
  ),
  translation_readiness as materialized (
    select *, (
      stale_source or empty_value or wrong_field or unchanged or html_residue or duplicate_tuple
    ) as blocked
    from translation_checks
  ),
  image_checks as materialized (
    select
      s.id,
      not coalesce((c.image_metadata->>'stored_locally')::boolean, false) as missing_local,
      nullif(c.image_metadata->>'license', '') is null as missing_license,
      nullif(c.image_metadata->>'source', '') is null as missing_source
    from public.ai_suggestions s
    join public.countries c on c.id = s.entity_id
    where s.entity_type = 'country'
      and s.suggestion_type = 'image_replacement'
      and s.status = 'pending'
  ),
  image_readiness as materialized (
    select *, (missing_local or missing_license or missing_source) as blocked
    from image_checks
  )
  select jsonb_build_object(
    'probe_ok', true,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'countries', (select count(*) from q),
      'indexable', (select count(*) from q where seo_indexable),
      'publication_ready', (select count(*) from q where publication_ready),
      'blocked', (select count(*) from q where cardinality(blockers) > 0)
    ),
    'dimensions', coalesce(
      (select jsonb_object_agg(name, average order by name) from dimensions),
      '{}'::jsonb
    ),
    'issues', coalesce(
      (select jsonb_object_agg(issue_code, affected order by issue_code) from issues),
      '{}'::jsonb
    ),
    'backlogs', jsonb_build_object(
      'editorial_review', (select count(*) from editorial_readiness),
      'translation_review', (select count(*) from translation_readiness),
      'image_review', (select count(*) from image_readiness),
      'category_other', (select sum(other_venues + other_events) from q),
      'region_review', (
        select count(*) from public.countries
        where duplicate_of_id is null and enrichment_status->'region'->>'state' = 'review'
      ),
      'unresolved_geography', (
        (select count(*) from public.venues where duplicate_of_id is null and city_id is null and country_id is null and enrichment_status->'geography'->>'state' is null)
        + (select count(*) from public.events where duplicate_of_id is null and city_id is null and country_id is null and venue_id is null and enrichment_status->'geography'->>'state' is null)
        + (select count(*) from public.organizations where duplicate_of_id is null and city_id is null and country_id is null and enrichment_status->'geography'->>'state' is null)
        + (select count(*) from public.personalities where duplicate_of_id is null and city_id is null and country_id is null and enrichment_status->'geography'->>'state' is null)
        + (select count(*) from public.milestones where city_id is null and country_id is null and geography_exemption_reason is null)
      )
    ),
    'review_readiness', jsonb_build_object(
      'editorial', jsonb_build_object(
        'total', (select count(*) from editorial_readiness),
        'ready', (select count(*) from editorial_readiness where not blocked),
        'blocked', (select count(*) from editorial_readiness where blocked),
        'issues', jsonb_build_object(
          'missing_evidence', (select count(*) from editorial_readiness where missing_evidence),
          'missing_grounding_hash', (select count(*) from editorial_readiness where missing_grounding_hash),
          'empty_hook', (select count(*) from editorial_readiness where empty_hook),
          'empty_long', (select count(*) from editorial_readiness where empty_long),
          'hook_over_120', (select count(*) from editorial_readiness where hook_over_120),
          'invalid_sentence_count', (select count(*) from editorial_readiness where invalid_sentence_count),
          'banned_word', (select count(*) from editorial_readiness where banned_word),
          'second_person', (select count(*) from editorial_readiness where second_person)
        )
      ),
      'translation', jsonb_build_object(
        'total', (select count(*) from translation_readiness),
        'ready', (select count(*) from translation_readiness where not blocked),
        'blocked', (select count(*) from translation_readiness where blocked),
        'issues', jsonb_build_object(
          'stale_source', (select count(*) from translation_readiness where stale_source),
          'empty_value', (select count(*) from translation_readiness where empty_value),
          'wrong_field', (select count(*) from translation_readiness where wrong_field),
          'unchanged', (select count(*) from translation_readiness where unchanged),
          'html_residue', (select count(*) from translation_readiness where html_residue),
          'duplicate_tuple', (select count(*) from translation_readiness where duplicate_tuple)
        )
      ),
      'image', jsonb_build_object(
        'total', (select count(*) from image_readiness),
        'ready', (select count(*) from image_readiness where not blocked),
        'blocked', (select count(*) from image_readiness where blocked),
        'issues', jsonb_build_object(
          'missing_local', (select count(*) from image_readiness where missing_local),
          'missing_license', (select count(*) from image_readiness where missing_license),
          'missing_source', (select count(*) from image_readiness where missing_source)
        )
      )
    ),
    'samples', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'slug', slug,
        'blockers', blockers,
        'warnings', warnings
      ))
      from (
        select * from q
        where cardinality(issue_codes) > 0
        order by cardinality(blockers) desc, name
        limit 30
      ) sample_rows
    ), '[]'::jsonb)
  )
$function$;

revoke all on function public.country_quality_health() from public, anon;

grant execute on function public.country_quality_health() to authenticated, service_role;

commit;
