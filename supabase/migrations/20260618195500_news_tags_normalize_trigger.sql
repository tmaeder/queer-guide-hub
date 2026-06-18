-- ============================================================================
-- Durable: normalize news_articles.tags on write
-- ----------------------------------------------------------------------------
-- The one-time backfill (20260618195000 + batched data pass) cleaned existing
-- rows, but the enrichment LLM keeps emitting variant/duplicate tags hourly.
-- A BEFORE INSERT OR UPDATE OF tags trigger applies normalize_news_tags() at
-- the single chokepoint, covering every write path (news_commit_staging_batch,
-- ingest, admin edits) without rewriting the large commit RPC. Idempotent:
-- normalizing already-normalized tags is a no-op, so re-saves don't churn.
-- ============================================================================
create or replace function public.trg_normalize_news_tags()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tags is not null then
    new.tags := public.normalize_news_tags(new.tags);
  end if;
  return new;
end;
$$;

alter function public.trg_normalize_news_tags() owner to postgres;

drop trigger if exists trg_normalize_news_tags on public.news_articles;
create trigger trg_normalize_news_tags
  before insert or update of tags on public.news_articles
  for each row execute function public.trg_normalize_news_tags();
