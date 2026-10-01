-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260925040051 with no repo file — the signature of
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

-- Publishing a country draft is the trust boundary. Keep this enforcement on
-- the table as well as in the admin UI so direct SQL and future RPCs cannot
-- bypass the evidence and house-style contract.
create or replace function public.tg_country_editorial_publication_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  combined_text text := lower(coalesce(new.draft_hook, '') || ' ' || coalesce(new.draft_long, ''));
  sentence_count integer;
begin
  if new.entity_type <> 'country' or new.status <> 'published' then
    return new;
  end if;

  if nullif(btrim(new.draft_hook), '') is null then
    raise exception 'country draft requires an editorial hook';
  end if;
  if char_length(new.draft_hook) > 120 then
    raise exception 'country editorial hook exceeds 120 characters';
  end if;
  if new.draft_hook ~ '[.]$' then
    raise exception 'country editorial hook must not end with a period';
  end if;
  if nullif(btrim(new.draft_long), '') is null then
    raise exception 'country draft requires a canonical description';
  end if;

  sentence_count := cardinality(regexp_split_to_array(btrim(new.draft_long), '[.!?]+[[:space:]]*')) - 1;
  if sentence_count < 3 or sentence_count > 5 then
    raise exception 'country description must contain 3 to 5 sentences';
  end if;
  if combined_text ~ '\m(discover|explore|unlock|curated|journey|amazing|tailored|personalized|vibrant|charming|hidden gem|must-see)\M' then
    raise exception 'country draft contains banned marketing language';
  end if;
  if combined_text ~ '\m(you|your|yours)\M' then
    raise exception 'country draft must not use second person';
  end if;
  if coalesce(new.source_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'country draft requires a grounding source hash';
  end if;
  if jsonb_typeof(new.citations) <> 'array' then
    raise exception 'country draft citations must be an array';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(new.citations) citation
    where citation->>'role' = 'rights'
      and nullif(citation->>'source', '') is not null
      and nullif(citation->>'source_ref', '') is not null
      and nullif(citation->>'observed_at', '') is not null
      and jsonb_typeof(citation->'claims') = 'object'
  ) then
    raise exception 'country draft requires claim-level rights provenance';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(new.citations) citation
    where citation->>'role' = 'country_facts'
      and nullif(citation->>'source', '') is not null
      and nullif(citation->>'source_ref', '') is not null
      and nullif(citation->>'observed_at', '') is not null
      and jsonb_typeof(citation->'claims') = 'object'
  ) then
    raise exception 'country draft requires claim-level country-fact provenance';
  end if;

  return new;
end
$function$;

revoke all on function public.tg_country_editorial_publication_guard() from public;

drop trigger if exists country_editorial_publication_guard on public.editorial_drafts;

create trigger country_editorial_publication_guard
before insert or update of status, draft_hook, draft_long, citations, source_hash
on public.editorial_drafts
for each row execute function public.tg_country_editorial_publication_guard();

-- The current generated cohort predates claim-level provenance. Retiring it is
-- deterministic: none of these rows can pass the new publication contract.
-- The content remains preserved as rejected history for auditability.
create temporary table country_drafts_to_regenerate on commit drop as
select d.id, d.entity_id
from public.editorial_drafts d
where d.entity_type = 'country'
  and d.status = 'pending'
  and (
    nullif(d.source_hash, '') is null
    or jsonb_typeof(d.citations) <> 'array'
    or not exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(d.citations) = 'array' then d.citations else '[]'::jsonb end
      ) citation
      where citation->>'role' = 'rights'
        and nullif(citation->>'source_ref', '') is not null
        and jsonb_typeof(citation->'claims') = 'object'
    )
    or not exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(d.citations) = 'array' then d.citations else '[]'::jsonb end
      ) citation
      where citation->>'role' = 'country_facts'
        and nullif(citation->>'source_ref', '') is not null
        and jsonb_typeof(citation->'claims') = 'object'
    )
  );

update public.countries c
set enrichment_status = jsonb_set(
      coalesce(c.enrichment_status, '{}'::jsonb),
      '{editorial}',
      jsonb_build_object(
        'state', 'needs_regeneration',
        'reason', 'claim_level_provenance_required',
        'at', now()
      ),
      true
    ),
    updated_at = now()
where exists (
  select 1 from country_drafts_to_regenerate invalid where invalid.entity_id = c.id
);

-- A historical rejected row may already occupy the table's
-- (entity_type, entity_id, status) uniqueness slot. Preserve the newer invalid
-- draft in that audit row before removing only the redundant pending record.
update public.editorial_drafts prior
set reviewer_note = concat_ws(
      E'\n',
      prior.reviewer_note,
      'Automatically retired before publication: claim-level rights and country-fact provenance plus a grounding source hash are required.',
      'Superseded pending revision preserved: ' || jsonb_build_object(
        'id', pending.id,
        'draft_hook', pending.draft_hook,
        'draft_long', pending.draft_long,
        'citations', pending.citations,
        'source_hash', pending.source_hash
      )::text
    ),
    reviewed_at = now()
from country_drafts_to_regenerate invalid
join public.editorial_drafts pending on pending.id = invalid.id
where prior.entity_type = 'country'
  and prior.entity_id = invalid.entity_id
  and prior.status = 'rejected';

delete from public.editorial_drafts pending
using country_drafts_to_regenerate invalid
where pending.id = invalid.id
  and exists (
    select 1
    from public.editorial_drafts prior
    where prior.entity_type = 'country'
      and prior.entity_id = invalid.entity_id
      and prior.status = 'rejected'
  );

update public.editorial_drafts d
set status = 'rejected',
    reviewer_note = concat_ws(
      E'\n',
      d.reviewer_note,
      'Automatically retired before publication: claim-level rights and country-fact provenance plus a grounding source hash are required.'
    ),
    reviewed_at = now()
where exists (
  select 1 from country_drafts_to_regenerate invalid where invalid.id = d.id
);

commit;
