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
