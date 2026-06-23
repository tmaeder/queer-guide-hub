-- RPC: authors with at least 2 passed articles for the author filter combobox.
create or replace function public.news_authors_with_articles()
returns table (author text, article_count bigint)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select author, count(*) as article_count
  from public.news_articles
  where author is not null
    and author <> ''
    and quality_status = 'passed'
    and duplicate_of_id is null
  group by author
  having count(*) >= 2
  order by article_count desc
  limit 200;
$$;

grant execute on function public.news_authors_with_articles() to anon, authenticated;;
