-- Hotels: give the accessibility fields somewhere to land.
--
-- The hotel admin editor has offered `accessibility_attributes` and
-- `accessibility_notes` for a long time, but `hotels` has only `amenities` —
-- so everything an admin typed into those boxes was silently discarded on
-- save, and the hotel detail page rendered no accessibility block at all.
-- Venues and events both carry these columns already; this makes hotels match.
--
-- This project treats a wrong or missing access claim as real-world harm, so
-- the fix is to store the data rather than to remove the inputs.
--
-- Types mirror venues/events exactly: text[] for the controlled-vocabulary
-- slugs (kind='accessibility' in public.amenities), free text for the note.

alter table public.hotels
  add column if not exists accessibility_attributes text[],
  add column if not exists accessibility_notes text;

comment on column public.hotels.accessibility_attributes is
  'Controlled-vocabulary accessibility slugs (public.amenities where kind=''accessibility''). Mirrors venues.accessibility_attributes; rendered by AmenityDisplay on the hotel detail page.';

comment on column public.hotels.accessibility_notes is
  'Free-text accessibility detail that does not fit the controlled vocabulary. Mirrors venues.accessibility_notes.';

-- Deliberately NOT backfilled from `amenities`: the existing amenity values are
-- uncontrolled scrape residue for hotels, and inferring an access claim from
-- them would manufacture exactly the kind of wrong claim this column exists to
-- avoid. These start empty and are filled by admins or the amenity engine.
