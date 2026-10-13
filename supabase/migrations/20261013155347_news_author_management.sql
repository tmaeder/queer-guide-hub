-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261013155347 with no repo file — the signature of
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
-- Editorial byline management; public news_authors_with_articles stays unchanged.
create or replace function public.admin_news_authors(p_search text default '', p_offset integer default 0)
returns table(author text, article_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin_or_internal();
  return query
    select n.author, count(*) from public.news_articles n
    where n.author is not null and btrim(n.author) <> ''
      and strpos(lower(n.author), lower(coalesce(p_search, ''))) > 0
    group by n.author order by count(*) desc, n.author collate "C"
    limit 51 offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_news_author_change(
  p_source text, p_target text, p_merge boolean, p_expected_count bigint
)
returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_target text := btrim(public.news_decode_entities(p_target));
  v_count bigint;
begin
  perform public.assert_admin_or_internal();
  if p_source is null or btrim(p_source) = '' or v_target is null or v_target = ''
     or length(v_target) > 255 or v_target ~ '[;[:cntrl:]]'
     or v_target ilike '/u/%' or v_target ilike '/r/%'
     or v_target ~ '^/[a-z0-9_-]+$'
     or lower(v_target) in ('none', 'null', 'undefined', 'unknown') then
    raise exception 'Enter a valid author name.' using errcode = '22023';
  end if;
  if v_target = p_source then
    raise exception 'Choose a different author name.' using errcode = '22023';
  end if;
  -- Serialize management and ingestion while checking the preview and applying it.
  lock table public.news_articles in share row exclusive mode;
  select count(*) into v_count from public.news_articles where author = p_source;
  if v_count = 0 then
    raise exception 'This author no longer has articles. Refresh the list.' using errcode = '22023';
  end if;
  if p_expected_count is null or v_count <> p_expected_count then
    raise exception 'The article count changed. Refresh the list before confirming.' using errcode = '40001';
  end if;
  if p_merge is null then
    raise exception 'Choose rename or merge.' using errcode = '22023';
  end if;
  if p_merge and not exists(select 1 from public.news_articles where author = v_target) then
    raise exception 'Choose an existing author to merge into.' using errcode = '22023';
  elsif not p_merge and exists(select 1 from public.news_articles where author = v_target) then
    raise exception 'That author already exists. Use Merge instead.' using errcode = '22023';
  end if;
  update public.news_articles set author = v_target where author = p_source;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_news_authors(text, integer) from public, anon;
revoke all on function public.admin_news_author_change(text, text, boolean, bigint) from public, anon;
grant execute on function public.admin_news_authors(text, integer) to authenticated, service_role;
grant execute on function public.admin_news_author_change(text, text, boolean, bigint) to authenticated, service_role;
;
