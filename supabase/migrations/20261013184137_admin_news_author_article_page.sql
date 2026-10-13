-- Staff author drilldown includes undated, archived and merged articles.
create or replace function public.admin_news_author_articles(p_author text,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.assert_admin_or_internal();
  if p_author is null or btrim(p_author)='' then
    raise exception 'Choose an author.' using errcode='22023';
  end if;
  return jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(a) order by published_at desc nulls last,id) from (
    select id,title,published_at,quality_status,publisher_name,archived_at,duplicate_of_id
    from public.news_articles where author=p_author
    order by published_at desc nulls last,id limit 50 offset greatest(coalesce(p_offset,0),0)
  ) a),'[]'::jsonb),'total',(select count(*) from public.news_articles where author=p_author));
end $$;
revoke all on function public.admin_news_author_articles(text,integer) from public,anon;
grant execute on function public.admin_news_author_articles(text,integer) to authenticated,service_role;
