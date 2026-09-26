-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260922185212 with no repo file — the signature of
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

create or replace function public.classify_milestone_source(p_url text)
returns text language sql immutable parallel safe
set search_path to 'public','pg_temp'
as $$
  select case
    when lower(p_url) ~ '(\.gov([./]|$)|\.gov\.[a-z]{2}([./]|$)|\.gob\.[a-z]{2}([./]|$)|parliament|europa\.eu|un\.org|coe\.int|gesetze-im-internet\.de|riksdagen\.se)' then 'primary_legal'
    when lower(p_url) ~ '(archives|museum|university|\.edu|who\.int|amnesty\.org|hrw\.org)' then 'institutional'
    when lower(p_url) ~ '(reuters|apnews|bbc\.|nytimes|guardian|washingtonpost|lemonde|dw\.com)' then 'reputable_secondary'
    when lower(p_url) ~ '(wikipedia\.org|britannica\.com)' then 'encyclopedia'
    when lower(p_url) ~ '(timeline|historyproject|lgbtq.*archive|queer.*archive)' then 'community_timeline'
    when lower(p_url) ~ '(blogspot|wordpress\.com|medium\.com|substack\.com)' then 'weak_self_published'
    else 'unknown'
  end;
$$;

create or replace function public.sync_milestone_source_health(p_milestone_id uuid default null)
returns integer language plpgsql security definer
set search_path to 'public','pg_temp'
as $$
declare v_count integer;
begin
  insert into public.milestone_source_health
    (milestone_id, source_url, canonical_url, domain, source_class)
  select m.id, s.url, public.canonical_milestone_source_url(s.url),
         lower(split_part(regexp_replace(s.url, '^https?://', '', 'i'), '/', 1)),
         public.classify_milestone_source(s.url)
  from public.milestones m
  cross join lateral (
    select trim(e->>'url') as url from jsonb_array_elements(coalesce(m.sources,'[]'::jsonb)) e
    where nullif(trim(e->>'url'),'') is not null
  ) s
  where m.duplicate_of_id is null
    and (p_milestone_id is null or m.id=p_milestone_id)
  on conflict (milestone_id, canonical_url) do update
    set source_url=excluded.source_url,domain=excluded.domain,
        source_class=case when public.milestone_source_health.source_class='unknown'
                          then excluded.source_class else public.milestone_source_health.source_class end,
        updated_at=now();
  get diagnostics v_count=row_count;

  delete from public.milestone_source_health h
  where (p_milestone_id is null or h.milestone_id=p_milestone_id)
    and not exists (
      select 1 from public.milestones m
      cross join lateral jsonb_array_elements(coalesce(m.sources,'[]'::jsonb)) e
      where m.id=h.milestone_id and m.duplicate_of_id is null
        and public.canonical_milestone_source_url(e->>'url')=h.canonical_url
    );
  return v_count;
end;
$$;

-- Remove legacy rows once and refresh formerly unknown official domains.
delete from public.milestone_source_health h using public.milestones m
where h.milestone_id=m.id and m.duplicate_of_id is not null;

update public.milestone_source_health
set source_class=public.classify_milestone_source(canonical_url),updated_at=now()
where source_class='unknown'
  and public.classify_milestone_source(canonical_url)<>'unknown';

commit;
;
