-- Give hotels, news_articles and community_groups an archived state.
--
-- WHY: 20261019100000 shipped archive/restore/delete across the registry-driven
-- admin, but four types raised `unsupported_type` because they had no column
-- that could express "archived" — only `seo_indexable`, which governs crawlers
-- and the sitemap and does NOT remove a row from the site or from search. An
-- Archive button wired to that would deindex without hiding, which is the exact
-- defect 20261016110000 was written to remove.
--
-- Three of the four get a real archived state here. The fourth does not:
--
-- COUNTRIES ARE DELIBERATELY LEFT OUT, and the reason is measured, not
-- aesthetic. `countries` is not a leaf: 5,757 cities, 30,887 venues and 48,741
-- events carry a country_id, and every child page embeds the parent
-- (`countries(name,code)`) for its name, flag and legal status. Hiding a
-- country row does not hide a country — it blanks that embed on tens of
-- thousands of pages, and `location_is_high_risk()` resolves the safety gate
-- through the same row, so an archived country would silently un-gate content
-- in a criminalizing jurisdiction. Measured on prod: 246 of 250 countries have
-- dependent content, so the button would refuse 98% of the time even with a
-- guard. Countries already have the lever they actually need — `seo_indexable`
-- for a thin territory page, and `shell_status` ('real' | 'territory') for what
-- kind of entity it is. archive_entity keeps refusing 'country', but now says
-- why and names the dependent count rather than reporting a generic
-- unsupported_type.
--
-- WHY A NEW COLUMN HERE AND NOT ELSEWHERE: the 11 types that already archive do
-- so through three incompatible conventions that each mean something
-- (`presumed_closed` is a live business we believe has shut; `ghost` is not a
-- place at all; `review_status='archived'` is an editorial judgement).
-- Collapsing those would lose meaning and require re-teaching every read path.
-- These three tables have NO existing convention, so a column is additive
-- rather than lossy — and `archived_at` carries when, which a status enum
-- cannot.

alter table public.hotels
  add column if not exists archived_at     timestamptz,
  add column if not exists archived_reason text;

alter table public.news_articles
  add column if not exists archived_at     timestamptz,
  add column if not exists archived_reason text;

alter table public.community_groups
  add column if not exists archived_at     timestamptz,
  add column if not exists archived_reason text;

-- Partial indexes: every public read adds `archived_at is null`, and the
-- archived set is by design a rounding error next to the live set (news alone
-- is 45k rows), so indexing the archived rows is what keeps the admin Trash
-- view cheap without paying for the common case.
create index if not exists idx_hotels_archived_at
  on public.hotels (archived_at) where archived_at is not null;
create index if not exists idx_news_articles_archived_at
  on public.news_articles (archived_at) where archived_at is not null;
create index if not exists idx_community_groups_archived_at
  on public.community_groups (archived_at) where archived_at is not null;

comment on column public.hotels.archived_at is
  'Set by archive_entity(''hotel'', …). Non-null hides the row from every non-admin read via RLS. Cleared by restore_entity.';
comment on column public.news_articles.archived_at is
  'Set by archive_entity(''news'', …). Non-null hides the row from every non-admin read via RLS. Cleared by restore_entity.';
comment on column public.community_groups.archived_at is
  'Set by archive_entity(''group'', …). Non-null hides the row from every non-admin read via RLS. Cleared by restore_entity.';

-- ---------------------------------------------------------------------------
-- Enforcement is RLS, not per-call-site filters.
--
-- These three tables are read from ~65 distinct call sites in src/hooks alone.
-- Filtering each one is a losing game: one missed hook and the "archived" row
-- is still on the site, which is precisely the failure this whole line of work
-- exists to remove. Each table has exactly ONE select policy, so the policy is
-- the chokepoint that covers every PostgREST read regardless of which hook
-- wrote the query. Same shape as the marketplace_listings policy in
-- 20261016110000.
--
-- What RLS does NOT cover, handled in the next migration: SECURITY DEFINER
-- RPCs, and the Cloudflare Pages Functions, which read with the service role.
--
-- Each policy keeps its existing predicate EXACTLY and only adds the archived
-- clause, nested so that admins regain the archived rows without also widening
-- anything else. Note news stays `published_at is not null` even for admins —
-- that is today's behaviour and this migration is not the place to change it.
-- ---------------------------------------------------------------------------

drop policy if exists "Public read hotels" on public.hotels;
create policy "Public read hotels" on public.hotels
  for select using (
    ((not safety_gated) or (select auth.uid()) is not null)
    and (
      archived_at is null
      or public.has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])
    )
  );

drop policy if exists "Public can view published news articles" on public.news_articles;
create policy "Public can view published news articles" on public.news_articles
  for select using (
    published_at is not null
    and (
      archived_at is null
      or public.has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])
    )
  );

drop policy if exists "Public read access for community_groups" on public.community_groups;
create policy "Public read access for community_groups" on public.community_groups
  for select using (
    archived_at is null
    or public.has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role, 'editor'::app_role])
  );
