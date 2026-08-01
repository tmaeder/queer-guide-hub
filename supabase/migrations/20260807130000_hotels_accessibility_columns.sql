-- Hotels: give the accessibility fields somewhere to land.
--
-- `src/config/contentTypes/hotel.ts` has offered "Accessibility" and
-- "Accessibility Notes" inputs for a long time, but `public.hotels` has only
-- `amenities` — so everything an admin typed into those two boxes was silently
-- discarded on save (useCMSEditor strips nothing here; PostgREST just ignores
-- unknown keys). `venues` and `events` both carry these columns already.
--
-- This project treats a wrong or missing access claim as real-world harm, so the
-- fix is to STORE the data rather than to delete the inputs. Types mirror
-- venues/events exactly: text[] of controlled-vocabulary slugs, free-text note.

alter table public.hotels
  add column if not exists accessibility_attributes text[],
  add column if not exists accessibility_notes text;

comment on column public.hotels.accessibility_attributes is
  'Controlled-vocabulary accessibility slugs (public.amenities where kind=''accessibility''). Mirrors venues.accessibility_attributes; rendered in its own block by AmenityDisplay on the hotel detail page.';

comment on column public.hotels.accessibility_notes is
  'Free-text accessibility detail that does not fit the controlled vocabulary. Mirrors venues.accessibility_notes.';

-- ── Backfill: re-file accessibility terms that are sitting in `amenities` ─────
--
-- The venue path (`_shared/amenity-normalize.ts`) is category-aware and routes
-- accessibility terms to their own column. The hotel ingest path is NOT: it still
-- uses the older flat `normalizeAmenities` in `_shared/hotel-pipeline-utils.ts`,
-- which slugifies every term into one `amenities` bucket with no notion of kind.
-- So accessibility terms on hotels have always sat in `amenities`, where
-- AmenityDisplay renders them in the generic amenity grid rather than the
-- prominent accessibility block. This re-files the ones already there.
--
-- DELIBERATELY EXACT-MATCH ONLY, against the vocabulary itself. It re-files terms
-- that are already a kind='accessibility' slug; it does not INFER an access claim
-- from anything else. In particular the normalizer's `elevator` -> `step-free-entrance`
-- alias is NOT applied here: a lift inside a building is not a step-free entrance,
-- and inventing that claim for the 8 hotels carrying a bare `elevator` is exactly
-- the wrong-claim harm these columns exist to avoid. (No venue carries a
-- step-free-entrance today either, so this diverges from nothing in practice.)
-- Those terms stay in `amenities`, where they are honest.
--
-- Naturally idempotent: after one pass no amenity term matches the vocabulary, so
-- the HAVING clause selects no rows on re-run.
with split as (
  select
    h.id,
    array_agg(distinct term order by term) filter (where v.slug is not null) as access_terms,
    array_agg(distinct term order by term) filter (where v.slug is null)     as keep_terms,
    count(*) filter (where v.slug is not null)                               as n_access
  from public.hotels h
  cross join lateral unnest(h.amenities) as u(term)
  left join public.amenities v
    on v.slug = u.term
   and v.kind = 'accessibility'
   and coalesce(v.is_active, true)
  where h.amenities is not null
  group by h.id
  having count(*) filter (where v.slug is not null) > 0
)
update public.hotels h
set
  accessibility_attributes = (
    select array_agg(distinct m.term order by m.term)
    from unnest(coalesce(h.accessibility_attributes, '{}') || s.access_terms) as m(term)
  ),
  amenities = coalesce(s.keep_terms, '{}')
from split s
where s.id = h.id
  and s.n_access > 0;
