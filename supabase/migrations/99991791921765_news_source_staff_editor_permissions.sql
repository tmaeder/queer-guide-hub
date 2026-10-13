-- Preserve moderator feed operations; publisher identity/link changes stay admin-only.
create or replace function public.admin_news_sources_browse(
  p_search text default '', p_state text default 'all', p_organization_id uuid default null,
  p_unlinked boolean default false, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  perform public.assert_admin_or_internal();
  if p_state not in ('all','active','inactive','paused','error') then
    raise exception 'Invalid source status.' using errcode='22023';
  end if;
  with matching as (
    select s.*, o.name as publisher_name, o.status as publisher_status
    from public.news_sources s left join public.organizations o on o.id=s.organization_id
    where (p_organization_id is null or s.organization_id=p_organization_id)
      and (not coalesce(p_unlinked,false) or s.organization_id is null)
      and (p_state='all' or (p_state='active' and s.is_active and not s.auto_paused)
        or (p_state='inactive' and not s.is_active) or (p_state='paused' and s.auto_paused)
        or (p_state='error' and (s.consecutive_failures > 0 or s.auto_paused)))
      and (strpos(lower(s.name),lower(coalesce(p_search,''))) > 0
        or strpos(lower(s.url),lower(coalesce(p_search,''))) > 0
        or strpos(lower(coalesce(o.name,'')),lower(coalesce(p_search,''))) > 0)
  ), page as (
    select m.*, (select count(*) from public.news_articles a where a.source_id=m.id) as article_count
    from matching m order by name collate "C",id
    limit 50 offset greatest(coalesce(p_offset,0),0)
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page) order by name collate "C",id) from page),'[]'::jsonb),
      'total',(select count(*) from matching)) into result;
  return result;
end $$;

create or replace function public.admin_news_source_save(p_id uuid,p_data jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old_row public.news_sources; saved public.news_sources; publisher_id uuid;
  source_name text := btrim(p_data->>'name'); source_url text := btrim(p_data->>'url');
  source_category text := btrim(p_data->>'category'); source_kind text := p_data->>'source_type';
  feed_kind text := coalesce(p_data->>'feed_type','news'); frequency integer;
  source_keywords text[];
begin
  perform public.assert_admin_or_internal();
  if jsonb_typeof(p_data) is distinct from 'object'
    or jsonb_typeof(p_data->'name') is distinct from 'string'
    or jsonb_typeof(p_data->'url') is distinct from 'string'
    or jsonb_typeof(p_data->'category') is distinct from 'string'
    or not (p_data ? 'organization_id') or length(source_name) not between 2 and 255
    or source_name is null or source_url is null or source_url !~ '^https?://[^[:space:]/?#@]+([/?#]|$)'
    or source_url ~ '[[:space:]]' or length(source_url)>2048
    or source_category is null or length(source_category) not between 1 and 100
    or source_kind is null or source_kind not in ('rss','api','news_api','wikimedia','social','manual')
    or feed_kind not in ('news','podcast')
    or jsonb_typeof(p_data->'is_active') is distinct from 'boolean'
    or jsonb_typeof(p_data->'auto_publish') is distinct from 'boolean'
    or jsonb_typeof(p_data->'keywords') is distinct from 'array' then
    raise exception 'Check the source name, HTTP(S) URL, category, type and settings.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_data->'keywords') k where jsonb_typeof(k) <> 'string') then
    raise exception 'Keywords must be text values.' using errcode='22023';
  end if;
  begin
    frequency := (p_data->>'fetch_frequency')::integer;
    publisher_id := nullif(p_data->>'organization_id','')::uuid;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid frequency or publisher.' using errcode='22023';
  end;
  if frequency is null or frequency not between 30 and 10080 then
    raise exception 'Fetch frequency must be between 30 and 10080 minutes.' using errcode='22023';
  end if;
  if p_id is not null then
    select * into old_row from public.news_sources where id=p_id for update;
    if not found then raise exception 'Source no longer exists. Refresh the list.' using errcode='22023'; end if;
    if p_expected_updated_at is null or old_row.updated_at is distinct from p_expected_updated_at then
      raise exception 'Source changed. Close the editor and refresh before saving.' using errcode='40001';
    end if;
  end if;
  if publisher_id is distinct from old_row.organization_id then
    perform public.assert_news_source_admin();
  end if;
  if publisher_id is not null and (p_id is null or publisher_id is distinct from old_row.organization_id) then
    perform 1 from public.organizations where id=publisher_id and 'publisher'=any(roles)
      and duplicate_of_id is null and status <> 'archived' for share;
    if not found then
      raise exception 'Choose an existing, non-archived Organisation with the Publisher role.' using errcode='22023';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(source_url,0));
  if (p_id is null or source_url is distinct from old_row.url) and exists(
    select 1 from public.news_sources where btrim(url)=source_url and (p_id is null or id<>p_id)
  ) then raise exception 'That feed URL already exists. Edit its existing source.' using errcode='23505'; end if;
  select coalesce(array_agg(distinct btrim(v)) filter(where btrim(v)<>''),'{}'::text[])
    into source_keywords from jsonb_array_elements_text(p_data->'keywords') v;
  if p_id is null then
    insert into public.news_sources(name,url,category,source_type,feed_type,fetch_frequency,is_active,auto_publish,keywords,organization_id,auto_publish_since)
    values(source_name,source_url,source_category,source_kind,feed_kind,frequency,(p_data->>'is_active')::boolean,
      (p_data->>'auto_publish')::boolean,source_keywords,publisher_id,case when (p_data->>'auto_publish')::boolean then clock_timestamp() else null end) returning * into saved;
  else
    update public.news_sources set name=source_name,url=source_url,category=source_category,source_type=source_kind,
      feed_type=feed_kind,fetch_frequency=frequency,is_active=(p_data->>'is_active')::boolean,
      auto_publish=(p_data->>'auto_publish')::boolean,keywords=source_keywords,organization_id=publisher_id,updated_at=clock_timestamp()
    where id=p_id returning * into saved;
  end if;
  return to_jsonb(saved);
end $$;

create or replace function public.admin_news_source_resume(p_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.news_sources;
begin
  perform public.assert_admin_or_internal();
  update public.news_sources set is_active=true,auto_paused=false,auto_paused_reason=null,
    consecutive_failures=0,consecutive_empty_fetches=0,backoff_until=null,status='active',updated_at=clock_timestamp()
  where id=p_id and updated_at=p_expected_updated_at returning * into saved;
  if not found then raise exception 'Source changed or no longer exists. Refresh before resuming.' using errcode='40001'; end if;
  return to_jsonb(saved);
end $$;

create or replace function public.admin_news_source_articles(p_source_id uuid,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.assert_admin_or_internal();
  return jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(a) order by published_at desc nulls last,id) from (
    select id,title,published_at,quality_status,publisher_name from public.news_articles where source_id=p_source_id
    order by published_at desc nulls last,id limit 50 offset greatest(coalesce(p_offset,0),0)
  ) a),'[]'::jsonb),'total',(select count(*) from public.news_articles where source_id=p_source_id));
end $$;

-- Preserve the existing source delete operation, with an explicit cascade preview.
create or replace function public.admin_news_source_delete(p_id uuid,p_expected_updated_at timestamptz,p_expected_article_count bigint)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare source_row public.news_sources; article_count bigint;
begin
 perform public.assert_admin_or_internal();
 select * into source_row from public.news_sources where id=p_id for update;
 if not found or p_expected_updated_at is null or source_row.updated_at is distinct from p_expected_updated_at then
   raise exception 'Source changed or no longer exists. Refresh before deleting.' using errcode='40001';
 end if;
 select count(*) into article_count from public.news_articles where source_id=p_id;
 if p_expected_article_count is null or article_count is distinct from p_expected_article_count then
   raise exception 'The imported article count changed. Refresh and review the deletion again.' using errcode='40001';
 end if;
 delete from public.news_sources where id=p_id;
 return p_id;
end $$;
revoke all on function public.admin_news_source_delete(uuid,timestamptz,bigint) from public,anon;
grant execute on function public.admin_news_source_delete(uuid,timestamptz,bigint) to authenticated,service_role;

-- Enforce publisher-link ownership for every write path, including direct
-- PostgREST table writes allowed by the legacy moderator source policies.
create or replace function public.guard_news_source_publisher_link()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if TG_OP='UPDATE' then
    if NEW.organization_id is not distinct from OLD.organization_id then return NEW; end if;
  elsif NEW.organization_id is null then
    return NEW;
  end if;
  perform public.assert_news_source_admin();
  if NEW.organization_id is not null then
    perform 1 from public.organizations
    where id=NEW.organization_id and 'publisher'=any(roles)
      and duplicate_of_id is null and status<>'archived' for share;
    if not found then
      raise exception 'Choose an existing, non-archived Organisation with the Publisher role.' using errcode='22023';
    end if;
  end if;
  return NEW;
end $$;
revoke all on function public.guard_news_source_publisher_link() from public,anon,authenticated;
drop trigger if exists news_sources_guard_publisher_link on public.news_sources;
create trigger news_sources_guard_publisher_link before insert or update of organization_id
on public.news_sources for each row execute function public.guard_news_source_publisher_link();
