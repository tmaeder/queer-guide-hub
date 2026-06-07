-- Content hygiene for the personalities content-quality remediation
-- (docs/plans/2026-06-07-personalities-content-quality-design.md).
--
-- ~4,316 name-only personalities (no real bio, no image, no description) were
-- seo_indexable=true — thin-content pages leaking into the sitemap / crawl, bad
-- for SEO and a poor landing experience. A page with neither a bio, an image, nor
-- a description has nothing to show and should not be indexed until it is
-- enriched.
--
-- Forward-looking trigger + one-time backfill, mirroring the outing-guard pattern
-- (demote, don't raise). visibility is left untouched — this only governs the
-- public crawl/SEO surface, and the row stays available for admin curation.

begin;

create or replace function public.personalities_thin_not_indexable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.seo_indexable
     and (new.bio is null or length(trim(new.bio)) < 40)
     and new.image_url is null
     and (new.description is null or length(trim(new.description)) < 40)
  then
    new.seo_indexable := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_personalities_thin_not_indexable on public.personalities;
create trigger trg_personalities_thin_not_indexable
  before insert or update of seo_indexable, bio, image_url, description
  on public.personalities
  for each row
  execute function public.personalities_thin_not_indexable();

-- One-time backfill (idempotent).
update public.personalities
   set seo_indexable = false, updated_at = now()
 where duplicate_of_id is null and review_status <> 'archived'
   and seo_indexable = true
   and (bio is null or length(trim(bio)) < 40)
   and image_url is null
   and (description is null or length(trim(description)) < 40);

commit;
