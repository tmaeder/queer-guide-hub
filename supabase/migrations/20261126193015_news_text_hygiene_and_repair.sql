-- Exact pre-cleanup snapshots and a cursor for the recurring bounded janitor.
create table if not exists api_private.news_text_cleanup_backups (
  article_id uuid not null,
  version text not null,
  original jsonb not null,
  cleaned jsonb not null,
  captured_at timestamptz not null default now(),
  primary key (article_id, version)
);
alter table api_private.news_text_cleanup_backups enable row level security;
revoke all on api_private.news_text_cleanup_backups from public, anon, authenticated;
grant select, insert on api_private.news_text_cleanup_backups to service_role;
create table if not exists api_private.news_text_cleanup_progress (
  singleton boolean primary key default true check(singleton),
  cursor_id uuid,
  updated_at timestamptz not null default now()
);
alter table api_private.news_text_cleanup_progress enable row level security;
revoke all on api_private.news_text_cleanup_progress from public, anon, authenticated;
grant select, insert, update on api_private.news_text_cleanup_progress to service_role;
insert into api_private.news_text_cleanup_progress(singleton) values(true) on conflict do nothing;

create or replace function public.news_text_cleanup_cursor(p_write boolean default false, p_cursor uuid default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
  if p_write then
    update api_private.news_text_cleanup_progress set cursor_id=p_cursor, updated_at=now() where singleton;
  end if;
  select cursor_id into result from api_private.news_text_cleanup_progress where singleton;
  return result;
end $$;
revoke all on function public.news_text_cleanup_cursor(boolean,uuid) from public,anon,authenticated;
grant execute on function public.news_text_cleanup_cursor(boolean,uuid) to service_role;

-- Lock, compare the text read by the worker, snapshot, and update in one transaction.
-- A snapshot failure aborts the write; concurrent editor changes are skipped.
create or replace function public.news_apply_text_cleanup(p_patches jsonb, p_version text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare patch jsonb; current_text jsonb; changed integer := 0;
begin
  if jsonb_typeof(p_patches) <> 'array' or jsonb_array_length(p_patches)>1000 then
    raise exception 'Expected at most 1000 patches';
  end if;
  for patch in select value from jsonb_array_elements(p_patches) loop
    select jsonb_build_object('title',a.title,'content',a.content,'excerpt',a.excerpt,'author',a.author)
      into current_text from public.news_articles a where a.id=(patch->>'id')::uuid for update;
    if current_text is null or current_text is distinct from patch->'expected' then continue; end if;
    if current_text = patch->'cleaned' and coalesce(jsonb_array_length(patch->'issues'),0)=0 then continue; end if;
    if not (patch->'cleaned' ?& array['title','content','excerpt','author']) then raise exception 'Incomplete cleanup patch'; end if;
    insert into api_private.news_text_cleanup_backups(article_id,version,original,cleaned)
      values((patch->>'id')::uuid,p_version,current_text,patch->'cleaned')
      on conflict(article_id,version) do nothing;
    update public.news_articles set
      title=patch->'cleaned'->>'title', content=patch->'cleaned'->>'content',
      excerpt=patch->'cleaned'->>'excerpt', author=patch->'cleaned'->>'author',
      needs_attention=case when jsonb_array_length(coalesce(patch->'issues','[]'::jsonb))>0 then true else needs_attention end,
      auto_publish_blocked_reasons=case when jsonb_array_length(coalesce(patch->'issues','[]'::jsonb))>0 then array_append(array_remove(coalesce(auto_publish_blocked_reasons,'{}'::text[]),'text_hygiene'),'text_hygiene') else auto_publish_blocked_reasons end,
      seo_indexable=case when jsonb_array_length(coalesce(patch->'issues','[]'::jsonb))>0 then false else seo_indexable end,
      quality_status=case when jsonb_array_length(coalesce(patch->'issues','[]'::jsonb))>0 and quality_status='passed' then 'review' else quality_status end
      where id=(patch->>'id')::uuid;
    changed := changed + 1;
  end loop;
  return changed;
end $$;
revoke all on function public.news_apply_text_cleanup(jsonb,text) from public,anon,authenticated;
grant execute on function public.news_apply_text_cleanup(jsonb,text) to service_role;

-- Last line of defense for alternate writers: flag recognizable markup and known
-- widget residue. Do not delete uncertain text or auto-promote a reviewed article.
create or replace function api_private.guard_news_text_hygiene()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare dirty boolean;
begin
  dirty := coalesce(NEW.content,'') || E'\n' || coalesce(NEW.excerpt,'') ~*
    '(<[/]?(p|div|script|style|iframe|figure|span)([[:space:]>])|\m(class|srcset|fetchpriority|decoding)=["'']|Subscribe to our Newsletter today)';
  if dirty then
    NEW.needs_attention := true;
    if not ('text_hygiene'=any(coalesce(NEW.auto_publish_blocked_reasons,'{}'::text[]))) then
      NEW.auto_publish_blocked_reasons := array_append(coalesce(NEW.auto_publish_blocked_reasons,'{}'::text[]),'text_hygiene');
    end if;
    if NEW.quality_status='passed' then NEW.quality_status := 'review'; NEW.seo_indexable := false; end if;
  end if;
  return NEW;
end $$;
revoke all on function api_private.guard_news_text_hygiene() from public,anon,authenticated;
drop trigger if exists news_articles_zzzz_text_hygiene on public.news_articles;
create trigger news_articles_zzzz_text_hygiene before insert or update of content,excerpt,quality_status
  on public.news_articles for each row execute function api_private.guard_news_text_hygiene();
