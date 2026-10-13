-- Run only against an isolated PostgreSQL database: first load
-- fixtures/news_author_management.sql, then the news_author_management migration.
begin;
insert into public.news_articles (author, title) values ('Alex', 'First'), ('Alex', 'Second'), ('Sam', 'Third'), (null, 'Missing'), ('', 'Blank');
do $$
declare n bigint;
begin
  select article_count into n from public.admin_news_authors('lex', 0) where author='Alex';
  assert n = 2, 'Search must include all articles';
  assert (select count(*) from public.admin_news_authors('', 0)) = 2, 'Exclude empty bylines';
  assert exists(select 1 from public.admin_news_authors('', 0) where author='Sam'), 'Include single article authors';
  begin
    perform public.admin_news_author_change('Alex','Sam',false,2);
    raise exception 'Collision accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.admin_news_author_change('Alex','Missing',true,2);
    raise exception 'Nonexistent merge target accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.admin_news_author_change('Alex','New name',false,1);
    raise exception 'Stale count accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.admin_news_author_change('Alex','unknown',false,2);
    raise exception 'Invalid byline accepted';
  exception when invalid_parameter_value then null; end;
  assert public.admin_news_author_change('Alex',' Alex Smith ',false,2)=2, 'Rename count';
  assert (select count(*) from public.news_articles where author='Alex Smith')=2, 'Rename all articles';
  assert public.admin_news_author_change('Alex Smith','Sam',true,2)=2, 'Merge count';
  assert (select count(*) from public.news_articles where author='Sam')=3, 'Merge all articles';
end;
$$;
insert into public.news_articles(author,title) select 'Author '||i, 'Pagination' from generate_series(1,60) i;
do $$ begin
  assert (select count(*) from public.admin_news_authors('Author ',0))=51, 'Fetch next-page sentinel';
  assert (select count(*) from public.admin_news_authors('Author ',50))=10, 'Page all authors';
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ begin
  begin perform public.admin_news_authors('',0); raise exception 'Nonstaff read accepted'; exception when insufficient_privilege then null; end;
  begin perform public.admin_news_author_change('Sam','New',false,3); raise exception 'Nonstaff write accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon','public.admin_news_authors(text,integer)','execute'), 'Anonymous cannot list';
  assert not has_function_privilege('anon','public.admin_news_author_change(text,text,boolean,bigint)','execute'), 'Anonymous cannot mutate';
end $$;
rollback;
