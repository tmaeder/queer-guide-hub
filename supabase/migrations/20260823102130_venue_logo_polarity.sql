-- Venue logo tiles flip with the theme, so BOTH polarities break — measured.
--
-- A contained venue logo renders on `bg-muted`, which is a THEME token:
-- rgb(234,234,222) in light and rgb(28,28,25) in dark (read off prod, not from
-- the stylesheet). So a dark wordmark vanishes in dark mode and a white one
-- vanishes in light mode. That is strictly worse than the marketplace plate,
-- which is pinned to paper and therefore only ever loses the white marks.
--
-- Measured over 344 readable venue logos:
--
--   either ground   277  (80.5%)
--   needs PAPER      46  (13.4%)  — all-dark marks: Sundeck, Colony Club, …
--   needs INK        21  ( 6.1%)  — no dark pixels: Boiler, The Gage, …
--   neither           0
--
-- So ~19.5% are invisible in one theme or the other today; against the ~7.7k
-- logos the working logo.dev token makes reachable that is ~1,500 dead tiles.
--
-- The fix is the same shape as the brand plate: pin the tile to a FIXED ground
-- and pick which one per logo. One boolean covers all three measured buckets,
-- because "either" is legible on paper by definition — so paper is the default
-- and `logo_on_ink` is the exception, exactly as on marketplace_brands. Reusing
-- the column name and its semantics keeps one concept, not two.
--
-- Written by `enrich-logos` from the mirrored bytes (`_shared/png-luminance.ts`)
-- in the same UPDATE as the url it describes. Defaults false: an unmeasured or
-- undecodable logo stays on paper, because a wrong ink plate erases a dark
-- wordmark completely.

alter table public.venues
  add column if not exists logo_on_ink boolean not null default false;

comment on column public.venues.logo_on_ink is
  'True when logo_url has no dark pixels and would be invisible on the paper tile. Written by enrich-logos from the mirrored bytes. Pins the tile to a mode-independent ground so the logo cannot be erased by a theme switch.';
