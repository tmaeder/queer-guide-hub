-- A merged tag only gets a redirect row if its canonical was ALREADY active.
--
-- `log_unified_tag_merge_redirect` (20260802111403) fires on the DUPLICATE's
-- status flip and reads the canonical's slug at that instant. Its companion
-- backfill was likewise scoped `where c.status = 'active'`. Neither one ever
-- looks again. So when a canonical is later REVIVED — deprecated → active —
-- every tag already merged into it stays without a redirect row, permanently,
-- and nothing reports it.
--
-- Measured on prod 2026-08-16, three tags in exactly that state:
--
--     psilocybin-magic-mushrooms -> psilocybin
--     mdma-ecstasy               -> mdma
--     lsd-acid                   -> lsd
--
-- All three were merged 2026-02-18, months before the trigger existed, so the
-- 2026-08-02 backfill was their only chance — and on that date their canonicals
-- were still deprecated, so the `c.status = 'active'` filter skipped them. The
-- saferparty import (20260907100000) then revived `lsd`/`mdma`/`psilocybin`
-- with `status = 'active'`, which is an UPDATE on the canonical and therefore
-- invisible to a trigger watching duplicates.
--
-- This matters now because the edge learned to 301 merged tag slugs
-- (functions/_lib/detail.ts, SLUG_REDIRECT_KINDS): tag_slug_redirects is the
-- ONLY input to that decision, so a missing row is the difference between
-- /tags/mdma-ecstasy redirecting to MDMA and it hard-404ing.
--
-- Two parts: close the hole going forward, then backfill what it already ate.

---------------------------------------------------------------------------
-- 1. Revival trigger — the mirror image of the merge trigger.
--
--    Merge trigger: "a tag became merged, point its slug at the canonical."
--    This one:      "a tag became active, adopt the slugs already pointed at it."
---------------------------------------------------------------------------
create or replace function public.log_unified_tag_revival_redirects()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if NEW.status = 'active' and OLD.status is distinct from 'active' then
    insert into public.tag_slug_redirects (old_slug, new_slug, tag_id)
    select d.slug, NEW.slug, NEW.id
      from public.unified_tags d
     where d.status = 'merged'
       and d.merged_into_id = NEW.id
       and d.slug <> NEW.slug
    -- DO UPDATE for the same reason the merge trigger uses it: a slug can be
    -- merged, unmerged and re-merged elsewhere, and a stale row would route to
    -- the wrong tag. Any existing row for a slug that is currently `merged`
    -- into NEW is by definition out of date.
    on conflict (old_slug) do update
      set new_slug = excluded.new_slug, tag_id = excluded.tag_id;
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists trg_unified_tags_revival_redirect on public.unified_tags;
create trigger trg_unified_tags_revival_redirect
  after update of status on public.unified_tags
  for each row execute function public.log_unified_tag_revival_redirects();

---------------------------------------------------------------------------
-- 2. Backfill. Identical predicate to the 20260802111403 backfill — re-running
--    it is the fix, because the rows it skipped then are eligible now.
--
--    DO NOTHING, not DO UPDATE: a slug may already carry a hand-made or
--    rename-derived redirect, and a bulk repair is not the place to overrule
--    one. The three rows this targets have no row at all.
---------------------------------------------------------------------------
insert into public.tag_slug_redirects (old_slug, new_slug, tag_id)
select d.slug, c.slug, c.id
  from public.unified_tags d
  join public.unified_tags c on c.id = d.merged_into_id
 where d.status = 'merged' and c.status = 'active' and c.slug <> d.slug
on conflict (old_slug) do nothing;

---------------------------------------------------------------------------
-- 3. Repair the denormalized new_slug where it disagrees with the tag it
--    points at. Prod has one: `m-nchen` still reads `munchen` while the tag was
--    since renamed to `munich`. Nothing reads new_slug today — resolve_tag_slug
--    and the edge resolver both join through tag_id, deliberately — but a
--    column that lies is a trap for whoever reads it next.
---------------------------------------------------------------------------
update public.tag_slug_redirects r
   set new_slug = t.slug
  from public.unified_tags t
 where t.id = r.tag_id and r.new_slug is distinct from t.slug;

---------------------------------------------------------------------------
-- 4. Assert the three actually resolve now. resolve_tag_slug() is the shared
--    resolver the SPA calls and the edge mirrors, so proving it here proves
--    both surfaces.
---------------------------------------------------------------------------
do $do$
declare
  v_slug text;
  v_got  text;
begin
  foreach v_slug in array array['mdma-ecstasy','lsd-acid','psilocybin-magic-mushrooms'] loop
    select slug into v_got from public.resolve_tag_slug(v_slug);
    if v_got is null then
      raise exception 'resolve_tag_slug(%) still returns nothing', v_slug;
    end if;
  end loop;

  -- And that no merged tag with a live canonical is left without a route.
  if exists (
    select 1
      from public.unified_tags d
      join public.unified_tags c on c.id = d.merged_into_id
     where d.status = 'merged' and c.status = 'active' and c.slug <> d.slug
       and not exists (select 1 from public.tag_slug_redirects r where r.old_slug = d.slug)
  ) then
    raise exception 'a merged tag with an active canonical still has no redirect row';
  end if;
end $do$;
