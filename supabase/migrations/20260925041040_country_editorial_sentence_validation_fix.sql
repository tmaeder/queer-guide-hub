-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260925041040 with no repo file — the signature of
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

  select count(*)::integer into sentence_count
  from regexp_matches(btrim(new.draft_long), '[.!?]+([[:space:]]+|$)', 'g');
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

commit;
