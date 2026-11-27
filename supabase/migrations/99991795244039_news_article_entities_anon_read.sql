-- news_article_entities: let signed-out visitors read the links they can see.
--
-- The table links news articles to the cities, countries, organisations and
-- personalities they mention. It was created (20260721123829) with RLS and a
-- "Public can read" SELECT policy, but anon never got a table-level SELECT
-- grant. New tables in this project need one explicitly, so every
-- /personalities/:slug visit by a signed-out reader got a 401 on the
-- related-news query (src/hooks/usePersonalityRelated.ts) and an empty
-- "In the news" section.
--
-- 1. Grant anon SELECT.
-- 2. Narrow the read policy from `true` to links whose ends the caller may
--    see. The article must be visible under news_articles' own policy
--    (published, not archived). A personality link needs a visible
--    personality (visibility = 'public' for anon), and an organisation link
--    a visible organisation (active, not safety-gated for anon). City and
--    country pages are public. The EXISTS subqueries run as the caller, so
--    each referenced table's own RLS decides; nothing is restated here.
--    The page's query already inner-joins news_articles, so this mainly
--    stops the junction from listing ids of draft personalities or
--    safety-gated organisations.
-- 3. Revoke anon INSERT/UPDATE/DELETE. They came from the schema's default
--    privileges, no policy ever allowed them, and the only writer is
--    apply_entity_link(), which is SECURITY DEFINER.

grant select on public.news_article_entities to anon;
revoke insert, update, delete on public.news_article_entities from anon;

drop policy if exists "Public can read news article entities" on public.news_article_entities;
create policy "Public can read news article entities"
  on public.news_article_entities for select
  using (
    exists (select 1 from public.news_articles a where a.id = news_article_entities.article_id)
    and case news_article_entities.entity_type
      when 'personality' then
        exists (select 1 from public.personalities p where p.id = news_article_entities.entity_id)
      when 'organisation' then
        exists (select 1 from public.organizations o where o.id = news_article_entities.entity_id)
      else true
    end
  );

do $verify$
declare
  v_bad int;
begin
  if not has_table_privilege('anon', 'public.news_article_entities', 'SELECT') then
    raise exception 'anon still cannot SELECT news_article_entities';
  end if;
  if has_table_privilege('anon', 'public.news_article_entities', 'INSERT')
     or has_table_privilege('anon', 'public.news_article_entities', 'UPDATE')
     or has_table_privilege('anon', 'public.news_article_entities', 'DELETE') then
    raise exception 'anon still holds a write privilege on news_article_entities';
  end if;
  select count(*) into v_bad
    from pg_policies
   where schemaname = 'public' and tablename = 'news_article_entities' and cmd = 'SELECT'
     and qual = 'true';
  if v_bad <> 0 then
    raise exception 'news_article_entities still has an unconditional read policy';
  end if;
end
$verify$;
