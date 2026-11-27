-- Optional detail fields, editor-entered only. Every row starts NULL: nothing
-- generates, infers or backfills these values.
--
-- Exposure: venues / organizations / hotels / marketplace_listings all carry
-- table-level SELECT for anon + authenticated (no column allowlist), the
-- detail pages read select('*'), and api_private.get_organization returns
-- to_jsonb(o) — so new columns reach the detail pages with no grant, view or
-- RPC change. They are deliberately NOT added to search indexing.
--
-- Books: marketplace_listings.attributes jsonb holds only colour/material as
-- structured keys; book format is inferred from title text by the dedup
-- engine and never stored, and no source writes publisher or language. So
-- these get real columns.

alter table public.venues
  add column if not exists audience text[],
  add column if not exists languages text[];

alter table public.venues
  add constraint venues_audience_known check (
    audience is null or audience <@ array[
      'women','men','trans','nonbinary','queer_youth','seniors','bipoc','everyone'
    ]::text[]
  ),
  add constraint venues_languages_iso639_1 check (
    languages is null or cardinality(languages) = 0 or array_to_string(languages, ',') ~ '^([a-z]{2})(,[a-z]{2})*$'
  );

alter table public.organizations
  add column if not exists eligibility text,
  add column if not exists cost text;

alter table public.hotels
  add column if not exists room_count integer check (room_count > 0),
  add column if not exists max_guests integer check (max_guests > 0);

alter table public.marketplace_listings
  add column if not exists book_format text,
  add column if not exists book_language text check (book_language ~ '^[a-z]{2}$'),
  add column if not exists publisher text;

comment on column public.venues.audience is 'Who the venue is for. Editor-entered; closed vocabulary (venues_audience_known).';
comment on column public.venues.languages is 'ISO 639-1 codes of languages spoken/served. Editor-entered.';
comment on column public.organizations.eligibility is 'Who a service is for. Editor-entered free text.';
comment on column public.organizations.cost is 'Cost of the service, e.g. Free, Sliding scale. Editor-entered free text.';
comment on column public.hotels.room_count is 'Number of rooms. Editor-entered.';
comment on column public.hotels.max_guests is 'Maximum guests. Editor-entered.';
comment on column public.marketplace_listings.book_format is 'Book format, e.g. Paperback. Editor-entered.';
comment on column public.marketplace_listings.book_language is 'ISO 639-1 code of the book language. Editor-entered.';
comment on column public.marketplace_listings.publisher is 'Book publisher. Editor-entered.';
