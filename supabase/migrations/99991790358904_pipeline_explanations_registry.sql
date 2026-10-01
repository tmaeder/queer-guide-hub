-- Pipeline explanations — plain language for every automated decision.
--
-- WHY THIS EXISTS. The ingest machine records its reasons as machine codes:
-- `W_NO_COORDS`, `despaced_exact`, `accessibility_coverage`. Today the only
-- thing that turns those into words for an editor is
-- `TriageDetailPanel.humanize()`, a regex that renders `W_NO_COORDS` as
-- "W No Coords". That is not an explanation, and — the point of this file —
-- it is INDISTINGUISHABLE from an explanation nobody ever wrote. A prettified
-- key looks like content, so a missing one can never be counted.
--
-- THE LOAD-BEARING RULE: an unregistered key must be VISIBLE, never
-- prettified. This table is read with a LEFT JOIN; an unmatched key yields
-- NULL title and NULL body and a status of 'unregistered', and the renderer
-- shows the raw key in monospace with an "unexplained" chip. A missing
-- explanation must look broken, because it is. Do NOT add a
-- `coalesce(title, prettify(key))` anywhere downstream — that is the whole
-- defect, reintroduced one layer up.
--
-- SEEDED FROM CODE, NOT FROM MEMORY. Every key below was harvested
-- mechanically from the deployed source on 2026-09-25:
--   * 107 validation codes  — `'[EW]_[A-Z0-9_]+'` string literals under
--     supabase/functions/ (pipeline-validate, _shared/{venue,hotel,
--     marketplace}-pipeline-utils.ts, _shared/personality-contract.ts)
--   * 10 dedup match types  — `match_type: '<x>'` in pipeline-deduplicate
--   * 24 signal types       — the UNION of the seven live
--     `*_quality_signals` CHECK constraints, read from `pg_constraint`
--   * consensus / merge / audit keys — from the functions that emit them
--
-- A NARROW GREP IS THE TRAP HERE, AND IT ALREADY FIRED. The obvious harvest
-- pattern is `(errors|warnings)\.push\('CODE'\)`. Run against the tree it
-- returns 106 codes; the superset pattern returns 107. The one it misses is
-- `E_VALIDATOR_CRASH`, which is written as an ARRAY LITERAL
-- (`ai_validation_result: { errors: ['E_VALIDATOR_CRASH'], ... }`,
-- pipeline-validate/index.ts:403) rather than pushed. 106 and 107 look
-- equally complete from the inside. scripts/check-explanation-keys.mjs uses
-- the superset pattern for exactly this reason, and carries a positive
-- control so that an empty match set cannot pass as "everything registered".
--
-- WHAT IS DELIBERATELY NOT HERE. No prose is invented for a condition that
-- was not read. Every body below is derived from the validator's own
-- predicate — `W_SHORT_DESCRIPTION` says under 20 characters because
-- venue-pipeline-utils.ts:288 tests `desc.length < 20`. Where a threshold
-- differs per entity the body says so rather than quoting one of them as if
-- it were universal.

create table if not exists public.pipeline_explanations (
  key         text primary key
              check (key ~ '^[a-z0-9_-]+:[A-Za-z0-9_.-]+$'),
  -- Generated, not stored duplicates: the producer half can never drift from
  -- the key, and grouping "which producer has unexplained codes" is free.
  producer    text generated always as (split_part(key, ':', 1)) stored,
  code        text generated always as (split_part(key, ':', 2)) stored,
  title       text not null check (length(btrim(title)) between 3 and 60),
  -- A one-word body is not an explanation. The floor is what stops this table
  -- being seeded with the code's own name a second time.
  body        text not null check (length(btrim(body)) >= 20),
  -- What an editor can actually DO. Null is honest for the many codes where
  -- the answer is "nothing, the source simply does not carry this".
  what_now    text,
  severity    text not null check (severity in ('info', 'warning', 'blocking')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.pipeline_explanations is
  'Plain-language text for machine keys emitted by the ingest pipeline. Read via LEFT JOIN: an unmatched key must surface as explanation_status=''unregistered'' with NULL prose, never as a prettified derivation of the key itself.';
comment on column public.pipeline_explanations.key is
  '<producer>:<code>, e.g. pipeline-validate:W_NO_COORDS. Producer is the edge function, SQL routine or subsystem that emits the code.';
comment on column public.pipeline_explanations.what_now is
  'Actionable next step for an editor, or NULL when there genuinely is none (most source-gap warnings).';

create index if not exists pipeline_explanations_producer_idx
  on public.pipeline_explanations (producer);

alter table public.pipeline_explanations enable row level security;

drop policy if exists pipeline_explanations_read on public.pipeline_explanations;
create policy pipeline_explanations_read on public.pipeline_explanations
  for select using (public.has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]));

drop policy if exists pipeline_explanations_write on public.pipeline_explanations;
create policy pipeline_explanations_write on public.pipeline_explanations
  for all using (public.has_any_role_jwt(array['admin'::app_role]))
  with check (public.has_any_role_jwt(array['admin'::app_role]));

revoke all on public.pipeline_explanations from anon;
grant select on public.pipeline_explanations to authenticated;
grant select, insert, update, delete on public.pipeline_explanations to service_role;

-- ON CONFLICT DO NOTHING throughout: this table holds editor-facing copy, and
-- a later migration re-running a seed must never clobber a human rewrite.
-- A deliberate correction uses an explicit DO UPDATE guarded on the exact old
-- text, the pattern 99991789904650 established.

-- ---------------------------------------------------------------------------
-- pipeline-validate — 107 codes. Severity: E_* blocking, W_* warning.
-- ---------------------------------------------------------------------------
insert into public.pipeline_explanations (key, title, body, what_now, severity) values

-- Identity and naming
('pipeline-validate:E_MISSING_NAME', 'No usable name',
 'The record arrived with a name shorter than two characters, so there is nothing to publish it under. Every entity type rejects this outright.',
 'Check the source page — if it has a real name the extractor is reading the wrong element.', 'blocking'),
('pipeline-validate:E_NAME_TOO_LONG', 'Name over 150 characters',
 'The name field is longer than 150 characters, which usually means a whole sentence or a page title was captured instead of the name itself.',
 'Trim to the actual name; the rest usually belongs in the description.', 'blocking'),
('pipeline-validate:W_NAME_UNUSUALLY_LONG', 'Name over 200 characters',
 'A personality name longer than 200 characters is almost always a scraped heading rather than a person''s name. Kept, but flagged.',
 'Read the name and shorten it if it carries a title or a role as well.', 'warning'),
('pipeline-validate:E_MISSING_TITLE', 'No usable title',
 'A marketplace listing arrived with a title shorter than two characters, so there is nothing to show a shopper.',
 null, 'blocking'),
('pipeline-validate:E_TITLE_TOO_SHORT', 'Title too short',
 'The title is below the minimum length for its type — six characters for an article, three for an event, two for a podcast episode.',
 null, 'blocking'),
('pipeline-validate:E_TITLE_NOT_INFORMATIVE', 'Title is a single short word',
 'The title is under fifteen characters and contains no spaces, so it is one word with no context — not something a reader can recognise.',
 null, 'blocking'),
('pipeline-validate:E_TITLE_PLACEHOLDER', 'Title is a placeholder',
 'The title starts with a placeholder word such as untitled, unnamed, test, no title, undefined or null. The source published a stub.',
 null, 'blocking'),
('pipeline-validate:E_TITLE_EMOJI_ONLY', 'Title is only emoji',
 'The title contains nothing but emoji and symbols, so it carries no searchable or readable text at all.',
 null, 'blocking'),
('pipeline-validate:W_TITLE_TRUNCATED', 'Title looks truncated',
 'The title is over the length the source normally publishes — 500 characters for an article, 300 for an event — which usually means body text was captured with it.',
 'Check the end of the title for a sentence that belongs in the description.', 'warning'),
('pipeline-validate:W_TITLE_VERY_LONG', 'Listing title over 300 characters',
 'A marketplace title this long is usually the seller stuffing keywords, or a product description captured as the title.',
 null, 'warning'),
('pipeline-validate:W_MOJIBAKE', 'Garbled characters in the name',
 'The name contains byte sequences that indicate a text-encoding error — typically UTF-8 read as Latin-1, which turns an accented letter into two symbols.',
 'Retype the affected characters; the source is usually correct and the transfer was not.', 'warning'),
('pipeline-validate:W_MISSING_BUSINESS_NAME', 'No seller or brand name',
 'The listing does not say who sells it, so it cannot be attributed to a brand or routed to a merchant record.',
 null, 'warning'),

-- Location and geography
('pipeline-validate:W_NO_COORDS', 'No coordinates',
 'The record has no latitude and longitude, so it cannot be placed on a map or matched to nearby places. This is the single most common gap in venue and event data.',
 'Add coordinates if the source has an address; the nightly geocoder also fills these over time.', 'warning'),
('pipeline-validate:E_BAD_COORDS', 'Coordinates out of range',
 'Latitude or longitude falls outside the valid range, so the point does not exist on Earth. Usually a swapped pair or a parsing error.',
 'Check whether latitude and longitude have been transposed.', 'blocking'),
('pipeline-validate:E_GEO_OUT_OF_RANGE', 'Event coordinates out of range',
 'The event carries a latitude outside -90 to 90 or a longitude outside -180 to 180, so the location is not a real point.',
 null, 'blocking'),
('pipeline-validate:E_NO_LOCATION', 'No location of any kind',
 'The event names no venue, no city and no coordinates, so there is no way to say where it happens.',
 null, 'blocking'),
('pipeline-validate:W_NO_GEO', 'No venue and no coordinates',
 'The event has a city but neither a named venue nor a map point, so it can be listed for the city and not placed within it.',
 null, 'warning'),
('pipeline-validate:W_NO_CITY', 'No city',
 'The record does not say which city it is in, so it will not appear on any city page until one is resolved.',
 'The nightly city linker resolves many of these from the address.', 'warning'),
('pipeline-validate:W_NO_COUNTRY', 'No country',
 'The record does not name a country. Country drives the legal and safety layer, so this also means no safety note can be composed.',
 null, 'warning'),
('pipeline-validate:E_MISSING_COUNTRY', 'No country on a required type',
 'Cities and hotels must name a country — it determines the legal context and the safety gate. The record does not.',
 null, 'blocking'),
('pipeline-validate:W_NO_ADDRESS', 'No street address',
 'There is no street address. The record can still publish, but it cannot be verified against another source by address, which is the strongest duplicate signal we have.',
 null, 'warning'),
('pipeline-validate:E_BAD_ISO_CODE', 'Country code is not valid ISO',
 'The country code is not a recognised two-letter ISO 3166-1 code, so it cannot be resolved to a country record.',
 null, 'blocking'),
('pipeline-validate:W_BAD_COUNTRY_CODE', 'Country code not recognised',
 'The country code does not match the ISO list. The country name was used instead where one was present.',
 'Note that several US state codes are also valid country codes — AL, CA, DE, MA and others.', 'warning'),
('pipeline-validate:W_NO_ISO_CODE', 'No country code',
 'The country record has no ISO code, which is the key nearly every other table uses to join to it.',
 null, 'warning'),
('pipeline-validate:E_INVALID_WIKIDATA_QID', 'Wikidata ID malformed',
 'The Wikidata identifier does not match the required Q-number format, so it cannot be resolved to an entity.',
 null, 'blocking'),
('pipeline-validate:W_NO_WIKIDATA_QID', 'No Wikidata identifier',
 'Without a Wikidata ID this record cannot be corroborated against the public knowledge graph, and the weekly fact refresh will skip it.',
 null, 'warning'),

-- Population, area, elevation
('pipeline-validate:E_BAD_POPULATION', 'Population is not a number',
 'The population value is negative or not numeric, so it cannot be stored or compared.',
 null, 'blocking'),
('pipeline-validate:W_NO_POPULATION', 'No population figure',
 'The record carries no population. It is used for ranking and for deciding which of two same-named places is meant.',
 null, 'warning'),
('pipeline-validate:W_IMPLAUSIBLE_POPULATION', 'Population over 50 million',
 'A city population above fifty million exceeds any real city, so the figure is likely a metro region, a country total, or a parsing error.',
 'Check whether the source figure is for the city or for a wider region.', 'warning'),
('pipeline-validate:W_IMPLAUSIBLE_AREA', 'Area outside plausible range',
 'The area is zero, negative, or larger than the biggest country on Earth. Usually a unit mix-up between square kilometres and square metres.',
 null, 'warning'),
('pipeline-validate:W_IMPLAUSIBLE_ELEVATION', 'Elevation outside plausible range',
 'The elevation is below the lowest land point or above the highest summit, so the unit or the sign is probably wrong.',
 null, 'warning'),
('pipeline-validate:W_IMPLAUSIBLE_DENSITY', 'Population density implausible',
 'Population divided by area gives a density no real settlement reaches. One of the two figures is wrong, or they describe different boundaries.',
 null, 'warning'),
('pipeline-validate:W_NO_CAPITAL', 'No capital named',
 'The country record does not name its capital city.',
 null, 'warning'),
('pipeline-validate:W_NO_CURRENCY', 'No currency',
 'The country record does not name a currency, which the price and marketplace layers use to convert and display amounts.',
 null, 'warning'),

-- Contact details
('pipeline-validate:W_NO_CONTACT', 'No way to make contact',
 'The record carries no phone, no email and no website, so a reader who wants to get in touch has nothing to use.',
 null, 'warning'),
('pipeline-validate:W_INVALID_PHONE', 'Phone number unreadable',
 'The phone number could not be normalised to a dialable form, usually because it is missing a country prefix or contains extra text.',
 'Add the international prefix, or move any opening-hours text out of the phone field.', 'warning'),
('pipeline-validate:W_INVALID_EMAIL', 'Email address unreadable',
 'The email address does not parse. Often an obfuscated address such as "name at example dot com" that was captured literally.',
 null, 'warning'),
('pipeline-validate:W_INVALID_URL', 'Link does not parse',
 'A URL on this record is not a valid web address, so it has not been stored as a link.',
 null, 'warning'),
('pipeline-validate:E_INVALID_URL', 'Article link does not parse',
 'The article URL is not a valid web address, and an article without a working link cannot be published.',
 null, 'blocking'),
('pipeline-validate:E_INVALID_URL_SCHEME', 'Link is not http or https',
 'The URL uses a protocol other than http or https. Anything else is either unusable in a browser or a security risk.',
 null, 'blocking'),
('pipeline-validate:W_URL_SCHEME', 'Event link is not http or https',
 'A URL on this event uses a protocol other than http or https, so it has not been stored as a link.',
 null, 'warning'),
('pipeline-validate:E_INVALID_WEBSITE', 'Website address does not parse',
 'The website field is not a valid web address.',
 null, 'blocking'),
('pipeline-validate:E_WEBSITE_SCHEME', 'Website is not http or https',
 'The website URL uses a protocol other than http or https.',
 null, 'blocking'),
('pipeline-validate:E_MISSING_URL', 'Article has no link',
 'The article carries no URL at all. Without one there is nothing to link a reader to and no stable identity for deduplication.',
 null, 'blocking'),
('pipeline-validate:E_NO_URL', 'Listing has no link',
 'The marketplace listing has no URL, so there is nowhere to send a shopper.',
 null, 'blocking'),
('pipeline-validate:E_MISSING_SOURCE', 'No source identifier',
 'The article does not identify which feed it came from, so it cannot be attributed or tracked back for corrections.',
 null, 'blocking'),
('pipeline-validate:W_NO_BOOKING_URL', 'Hotel has no booking link',
 'There is no booking URL, which is the main action a reader takes on a hotel page.',
 null, 'warning'),
('pipeline-validate:W_INVALID_BOOKING_URL', 'Booking link does not parse',
 'The booking URL is not a valid web address, so the booking button would lead nowhere.',
 null, 'warning'),

-- Descriptions and body text
('pipeline-validate:W_NO_DESCRIPTION', 'No description',
 'The record has no descriptive text at all, so its page would show only structured fields.',
 'The enrichment engines write descriptions for some types; others need an editor.', 'warning'),
('pipeline-validate:W_SHORT_DESCRIPTION', 'Description very short',
 'The description is below the minimum useful length for its type — 20 characters for a venue, 40 for a hotel.',
 null, 'warning'),
('pipeline-validate:W_DESCRIPTION_THIN', 'Description thin',
 'The description is under the threshold for its type — 30 characters for an event, 40 for a marketplace listing — which is usually one fragment rather than a description.',
 null, 'warning'),
('pipeline-validate:E_NO_CONTENT', 'Article body is empty',
 'After stripping markup the article has no text at all. The fetch returned a page shell, a redirect, or an error page.',
 'Check whether the source requires a subscription or blocks automated readers.', 'blocking'),
('pipeline-validate:W_CONTENT_THIN', 'Article body very short',
 'The article body is below the minimum length, which usually means only the teaser was captured rather than the article.',
 null, 'warning'),
('pipeline-validate:W_PAYWALL_SUSPECTED', 'Paywall suspected',
 'The opening of the body contains subscribe, sign in to read, paywall or register to continue — so what we captured is likely the gate, not the article.',
 null, 'warning'),
('pipeline-validate:W_HTML_RESIDUE', 'Markup left in the text',
 'The cleaned text still contains HTML tags or entities, so the sanitizer did not fully handle this source''s markup.',
 null, 'warning'),
('pipeline-validate:W_SUMMARY_TOO_SHORT', 'Summary under 120 characters',
 'A personality summary shorter than 120 characters usually does not say enough to distinguish the person.',
 null, 'warning'),
('pipeline-validate:W_SUMMARY_TOO_LONG', 'Summary over 240 characters',
 'The summary is longer than the space it renders in, so it will be cut off mid-sentence on the page.',
 null, 'warning'),
('pipeline-validate:E_SUMMARY_EQUALS_BIO', 'Summary and biography identical',
 'The short summary and the long biography are the same text, so the page would print it twice.',
 'Write a one-line summary, or clear it and let the biography stand alone.', 'blocking'),

-- Dates and time
('pipeline-validate:E_MISSING_START_DATE', 'Event has no start date',
 'An event without a start date cannot be placed in a calendar, a city page, or any upcoming list.',
 null, 'blocking'),
('pipeline-validate:E_INVALID_START_DATE', 'Start date unreadable',
 'The start date could not be parsed. Usually an unusual format, or a date range captured as a single value.',
 null, 'blocking'),
('pipeline-validate:E_INVALID_END_DATE', 'End date unreadable',
 'The end date could not be parsed.',
 null, 'blocking'),
('pipeline-validate:E_END_BEFORE_START', 'Event ends before it starts',
 'The end date is earlier than the start date. Usually the two are transposed, or an overnight event was given the same date twice.',
 null, 'blocking'),
('pipeline-validate:W_EVENT_IN_PAST', 'Event is over a year past',
 'The start date is more than a year ago. Note that a past date is NOT a defect in this corpus — roughly 36,500 historical events were imported deliberately.',
 null, 'warning'),
('pipeline-validate:W_EVENT_TOO_FAR_FUTURE', 'Event is over five years out',
 'The start date is more than five years away, which usually means a year was mis-parsed rather than an event genuinely being scheduled that far ahead.',
 null, 'warning'),
('pipeline-validate:W_PRIDE_TIME_WINDOW', 'Pride event outside daytime hours',
 'A pride march or festival is timed before 10:00 or after 15:00. Most are daytime events, so this often means a time was defaulted rather than read.',
 'Check the source for the real start time; midnight usually means no time was published.', 'warning'),
('pipeline-validate:W_PRIDE_NOT_SATURDAY', 'Pride event not on a Saturday',
 'A pride march or festival falls on a day other than Saturday. Legitimate for many events, but a common signature of a mis-parsed date.',
 null, 'warning'),
('pipeline-validate:W_INVALID_DATE', 'Publication date unreadable',
 'The published-at value could not be parsed into a date.',
 null, 'warning'),
('pipeline-validate:W_FUTURE_DATE', 'Publication date in the future',
 'The article claims to be published more than a day from now, which usually indicates a timezone error at the source.',
 null, 'warning'),
('pipeline-validate:W_VERY_OLD', 'Article over five years old',
 'The publication date is more than five years ago. Legitimate for an archive import, otherwise usually a mis-parsed date.',
 null, 'warning'),
('pipeline-validate:W_NO_PUBLISHED_AT', 'No publication date',
 'The article does not say when it was published, so it cannot be ordered correctly against other coverage.',
 null, 'warning'),
('pipeline-validate:E_INVALID_BIRTH_DATE', 'Birth date malformed',
 'The birth date is not in YYYY-MM-DD form, so it cannot be stored as a date.',
 null, 'blocking'),
('pipeline-validate:E_INVALID_DEATH_DATE', 'Death date malformed',
 'The death date is not in YYYY-MM-DD form.',
 null, 'blocking'),
('pipeline-validate:E_BIRTH_AFTER_DEATH', 'Born after they died',
 'The birth date is later than the death date, so at least one of the two is wrong.',
 null, 'blocking'),
('pipeline-validate:E_LIVING_WITH_DEATH_DATE', 'Marked living but has a death date',
 'The record is flagged as a living person and also carries a death date. One of the two statements is false, and publishing either wrongly is a real harm.',
 'Check an independent source before deciding which is right.', 'blocking'),
('pipeline-validate:W_BIRTH_YEAR_IMPLAUSIBLE', 'Birth year implausible',
 'The birth year is before 1000 or in the future, so it is almost certainly a parsing error rather than a fact.',
 null, 'warning'),

-- Images and media
('pipeline-validate:W_NO_IMAGE', 'No image',
 'The record has no image, so its cards and its social preview will fall back to a generic placeholder.',
 null, 'warning'),
('pipeline-validate:W_NO_IMAGES', 'Listing has no images',
 'A marketplace listing with no images converts far worse and looks broken on the grid.',
 null, 'warning'),
('pipeline-validate:W_NO_PHOTOS', 'Hotel has no photos',
 'The hotel carries no photographs.',
 null, 'warning'),
('pipeline-validate:W_INVALID_IMAGE_URL', 'Image link does not parse',
 'An image URL is not a valid web address, or does not use http or https, so it has not been stored.',
 null, 'warning'),
('pipeline-validate:E_IMAGE_URL_SCHEME', 'Image link is not http or https',
 'The image URL uses a protocol other than http or https and cannot be loaded by a browser.',
 null, 'blocking'),
('pipeline-validate:E_PLACEHOLDER_IMAGE', 'Image is a known placeholder',
 'The image URL matches a placeholder this pipeline has seen before — a generic avatar or a "no photo" graphic — so storing it would publish a false portrait.',
 null, 'blocking'),

-- Price and commerce
('pipeline-validate:E_INVALID_PRICE', 'Price is not a number',
 'The price could not be read as a number, usually because a currency symbol or a range was captured with it.',
 null, 'blocking'),
('pipeline-validate:E_NEGATIVE_PRICE', 'Price is negative',
 'The listing carries a negative price, which is not a thing that can be sold.',
 null, 'blocking'),
('pipeline-validate:E_ZERO_PRICE_NOT_FREE', 'Zero price but not marked free',
 'The price is zero or below while the listing is not marked as free, so either the price failed to parse or the free flag is missing.',
 null, 'blocking'),
('pipeline-validate:W_PRICE_SUSPICIOUS', 'Price over one million',
 'A price above one million is almost always a currency in minor units — cents or yen read as the major unit — rather than a genuine figure.',
 null, 'warning'),
('pipeline-validate:W_MISSING_PRICE', 'No price',
 'The listing carries no price, so it cannot be sorted or filtered on price.',
 null, 'warning'),
('pipeline-validate:W_UNKNOWN_CURRENCY', 'Currency not recognised',
 'The currency code is not in the supported list, so the price cannot be converted for comparison.',
 null, 'warning'),
('pipeline-validate:W_INVALID_PRICE_RANGE', 'Price band outside 1 to 4',
 'The hotel price band must be 1 to 4. This value is outside that range, so it cannot be rendered as a price indicator.',
 null, 'warning'),

-- Category, type and classification
('pipeline-validate:W_MISSING_CATEGORY', 'No category',
 'The listing has no category, so it will not appear under any section of the marketplace.',
 null, 'warning'),
('pipeline-validate:E_MISSING_ACCOMMODATION_TYPE', 'Hotel has no accommodation type',
 'The record does not say what kind of accommodation it is, which the dedup and display layers both depend on.',
 null, 'blocking'),
('pipeline-validate:E_INVALID_ACCOMMODATION_TYPE', 'Accommodation type not in the vocabulary',
 'The accommodation type is not one of the controlled values, so it cannot be stored or filtered.',
 null, 'blocking'),
('pipeline-validate:W_UNKNOWN_AVAILABILITY', 'Availability not recognised',
 'The availability value is outside the known set, so stock state cannot be shown.',
 null, 'warning'),
('pipeline-validate:E_ENTITY_TYPE_MISMATCH', 'Wrong kind of thing for this table',
 'The classifier read this record as a different kind of entity than the table it was staged into — for example a venue arriving in the events pipeline.',
 'Check the source; the extractor may be pointed at the wrong section of the page.', 'blocking'),
('pipeline-validate:W_ENTITY_TYPE_UNCLEAR', 'Classifier could not tell what this is',
 'The entity classifier returned unknown with zero confidence, so nothing corroborates that this record belongs where it was staged.',
 null, 'warning'),
('pipeline-validate:W_NO_PROFESSION', 'No profession',
 'The personality record does not name a profession, which is the main way people are grouped and found.',
 null, 'warning'),
('pipeline-validate:E_PROFESSION_NOT_PRIMARY', 'Several professions in one field',
 'The profession field contains a comma, semicolon, slash or pipe, so it lists several rather than naming the primary one. The field is an exact-match filter, so a list breaks it.',
 'Pick the primary profession; the others belong in the biography.', 'blocking'),
('pipeline-validate:E_INVALID_ROLE_SLUG', 'Roles are not a valid list',
 'The roles field is not an array of known role slugs, so it cannot be stored against the controlled vocabulary.',
 null, 'blocking'),
('pipeline-validate:E_FIELDS_NOT_STRING_ARRAY', 'Legacy fields in the wrong shape',
 'Fields that must be arrays of text arrived in an older shape this pipeline no longer accepts.',
 null, 'blocking'),
('pipeline-validate:W_NO_NATIONALITY', 'No nationality',
 'The personality record does not name a nationality.',
 null, 'warning'),
('pipeline-validate:W_NO_LGBTI_CONNECTION', 'No stated LGBTI connection',
 'Nothing on the record says how this person connects to LGBTI history or community, which is the reason for including them.',
 null, 'warning'),
('pipeline-validate:E_INVALID_LGBTI_CONNECTION', 'LGBTI connection not in the vocabulary',
 'The stated connection is not one of the controlled values, so it cannot be stored or filtered against.',
 null, 'blocking'),
('pipeline-validate:W_NO_LGBTQ_MARKER', 'No LGBTQ+ signal found',
 'Nothing in the hotel''s amenities or text marks it as relevant to LGBTQ+ travellers, which is the bar for listing it here at all.',
 null, 'warning'),
('pipeline-validate:E_ADULT_TAGS_NOT_SEPARATED', 'Adult record carries general tags',
 'A record flagged as adult also carries general tags. Adult and general vocabularies are kept apart deliberately so adult terms cannot leak into public tag pages.',
 null, 'blocking'),
('pipeline-validate:W_FEW_AMENITIES', 'Under three amenities',
 'The hotel lists fewer than three amenities, which is usually an extraction gap rather than a genuinely bare property.',
 null, 'warning'),
('pipeline-validate:W_INVALID_STAR_RATING', 'Star rating unreadable',
 'The star rating could not be read as a number in the expected range.',
 null, 'warning'),

-- Scoring and crash
('pipeline-validate:E_QUALITY_BELOW_THRESHOLD', 'Quality score below the reject bar',
 'The record broke no single rule but accumulated enough small deductions to fall under this source''s reject threshold.',
 'Open the record and look at the warnings above — they are the deductions that got it here.', 'blocking'),
('pipeline-validate:E_VALIDATOR_CRASH', 'The validator itself failed',
 'The validation step threw an exception rather than returning a verdict, so this record was never actually judged. The crash message is stored alongside this code.',
 'This is a bug in the validator, not a fault in the record. Absence of a verdict is not a verdict.', 'blocking')

on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- pipeline-deduplicate — 10 match types, from `match_type: '<x>'` literals.
-- ---------------------------------------------------------------------------
insert into public.pipeline_explanations (key, title, body, what_now, severity) values
('dedup:code_exact', 'Same identifier',
 'Both records carry the same external identifier from the same source, which is the strongest evidence of a duplicate available.',
 null, 'info'),
('dedup:despaced_exact', 'Same name ignoring spacing',
 'The two names are identical once spaces, punctuation and case are stripped — for example "Cafe Bar" and "cafe-bar".',
 null, 'info'),
('dedup:core_token', 'Same significant words',
 'The names share their significant words once common and city words are removed. Weaker than an exact match, so it needs a second signal before merging.',
 null, 'info'),
('dedup:name_exact_legacy', 'Same name, older rule',
 'Matched by the original name-only comparison. This arm is kept for continuity and never auto-merges on its own.',
 null, 'info'),
('dedup:name_proximity', 'Same name and close together',
 'The names match and the two points are within the distance gate for this entity type.',
 null, 'info'),
('dedup:name_proximity_country', 'Same name, same country, close together',
 'Name, country and proximity all agree. The country arm exists because a name alone crosses borders — there is a Portland in Maine and in Oregon.',
 null, 'info'),
('dedup:phone_exact', 'Same phone number',
 'Both records list the same normalised phone number, which for venues is strong corroboration.',
 null, 'info'),
('dedup:semantic', 'Similar meaning',
 'The two records score as similar on their text embeddings rather than on any exact field. Suggestive only — this arm never auto-merges.',
 null, 'info'),
('dedup:title_city_time', 'Same title, city and time',
 'Two events share a title, a city and an instant. Note that different showtimes of one production are NOT duplicates, which is why the instant must match exactly.',
 null, 'info'),
('dedup:venue_date_exact', 'Same venue and date',
 'Two events at the same venue within the date window. Checked against the start time before merging, because a pre-party and its parent share both.',
 null, 'info')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Quality signals — the 24 distinct signal_type values across the seven live
-- `*_quality_signals` CHECK constraints. The VOCABULARY comes from the
-- catalog (asserted below); the PROSE is written by a human, because a
-- constraint cannot say what a signal means to an editor.
-- ---------------------------------------------------------------------------
insert into public.pipeline_explanations (key, title, body, what_now, severity) values
('signal:completeness', 'How much of the record is filled in',
 'A weighted measure of which fields carry content. Weighted towards the fields that matter here, not towards field count — queer-specific content counts for more than trivia.',
 null, 'info'),
('signal:corroboration', 'How many sources agree',
 'Raised when an independent source confirms a field we already hold. This is what turns a single scrape into a verified fact.',
 null, 'info'),
('signal:content_density', 'How much content points at this record',
 'Counts the venues, events and articles attached to this place. A place nothing points at is usually a stub rather than a destination.',
 null, 'info'),
('signal:freshness', 'How recently this was verified',
 'Decays over time since the last check. A record that was right a year ago and has not been looked at since is not the same as one verified last week.',
 null, 'info'),
('signal:relevance', 'How relevant this is to the platform',
 'Measures how strongly the record connects to LGBTQ+ travel and community, which is the bar for carrying it at all.',
 null, 'info'),
('signal:admin_feedback', 'What a human decided',
 'Recorded when an editor approves, rejects or corrects something. Human decisions outweigh machine ones in every score that reads this.',
 null, 'info'),
('signal:enrichment', 'What the enrichment engines added',
 'Raised when an automated pass successfully filled a field from an external source.',
 null, 'info'),
('signal:safety', 'Safety-relevant state',
 'Tracks the legal and safety context, which governs whether a record is shown to signed-out visitors at all.',
 null, 'info'),
('signal:liveness', 'Whether this is still happening',
 'For events: whether the ticket link and the source page still say it is on. Catches cancellations and dead links.',
 null, 'info'),
('signal:engagement', 'How readers respond',
 'Derived from how often the record is opened, saved or shared.',
 null, 'info'),
('signal:linkage', 'How well this is connected',
 'Measures whether the record is joined to the places, people and tags it should be. An unlinked record is invisible to every surface that browses by relation.',
 null, 'info'),
('signal:verification', 'Identity verification state',
 'For people: whether the identity has been corroborated against an independent reference. The bar is higher here because naming the wrong person is a real harm.',
 null, 'info'),
('signal:link_health', 'Whether the links still work',
 'Tracks whether outbound URLs still resolve. A broken link is the most visible kind of rot.',
 null, 'info'),
('signal:amenity_coverage', 'How many amenities are known',
 'Counts amenities recorded against the controlled vocabulary. Uncontrolled scrape text does not count.',
 null, 'info'),
('signal:accessibility_coverage', 'How much accessibility detail is known',
 'Counts accessibility facts recorded. Held to a higher bar than other amenities: a wrong access claim sends someone to a door they cannot get through.',
 null, 'info'),
('signal:category_fit', 'Whether the category suits the record',
 'Measures how well the assigned category matches what the record actually is.',
 null, 'info'),
('signal:source_health', 'How reliable the source has been',
 'Tracks the track record of the feed this came from — how often it has been right, and how often it has failed.',
 null, 'info'),
('signal:editorial_quality', 'How good the writing is',
 'Assesses whether the prose reads as written for this audience rather than as generic or machine-generated filler.',
 null, 'info'),
('signal:taxonomy_fit', 'Whether the tags suit the record',
 'Measures how well the assigned tags describe what the record is about.',
 null, 'info'),
('signal:geography', 'Geographic completeness',
 'Whether the place fields resolve to real, consistent locations rather than leaving gaps or contradicting each other.',
 null, 'info'),
('signal:media', 'Image and media coverage',
 'Whether the record carries usable images.',
 null, 'info'),
('signal:duplicate_risk', 'How likely this is a duplicate',
 'Raised when the record resembles another closely enough to be worth a look, without being certain enough to merge.',
 null, 'info'),
('signal:date_evidence', 'How well the date is supported',
 'Measures whether the date is corroborated by a source or merely asserted once.',
 null, 'info'),
('signal:publication_gate', 'Whether this is ready to publish',
 'The combined check that decides whether a record can go live.',
 null, 'info')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Consensus and merge.
-- ---------------------------------------------------------------------------
insert into public.pipeline_explanations (key, title, body, what_now, severity) values
('consensus:auto_commit', 'Sources agreed, applied automatically',
 'Two or more sources gave the same value for this field, so it was written without asking anyone.',
 null, 'info'),
('consensus:triage', 'Sources disagreed, sent to a human',
 'Sources gave different values for a field where being wrong matters — name, coordinates or category — so it was queued rather than guessed.',
 'Open the review queue and pick the value the evidence supports.', 'warning'),
('consensus:review_gated', 'Held for review by policy',
 'The field is one that never auto-publishes regardless of confidence, so it waits for a person.',
 null, 'info'),
('consensus:no_change', 'Sources agreed with what we already had',
 'The new reading matched the stored value, so nothing was written. This is corroboration, not inaction.',
 null, 'info'),
('consensus:closure_flag', 'A source suggests this has closed',
 'A source reported this place as permanently closed, or its website stopped resolving. One signal flags it; two close it.',
 'Check whether the place is really gone before acting on a single signal.', 'warning'),
('consensus:skipped', 'Not assessed this pass',
 'The field was not examined in this run, usually because no new source offered a value for it.',
 null, 'info'),
('merge:merged_away', 'Merged into another record',
 'This record was judged a duplicate and folded into another. Its content, links and URL now point at the surviving record.',
 'Every merge is reversible — use Undo on the merge audit entry if this was wrong.', 'info'),
('merge:absorbed', 'Absorbed a duplicate',
 'Another record was judged a duplicate of this one and folded in. Its content and incoming links moved here.',
 null, 'info'),
('merge:unrecorded_pre_details', 'Merge predates reparenting records',
 'This merge happened before the pipeline recorded which child rows it moved, so it cannot be undone automatically. The information was never written and cannot be reconstructed.',
 'Undo will refuse this entry unless forced, and forcing it restores the link without the children.', 'warning')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Coverage gaps. These are the honest statements the timeline makes about
-- what it CANNOT show. They are rows rather than omissions because an empty
-- section and a section we cannot populate must never render identically.
-- ---------------------------------------------------------------------------
insert into public.pipeline_explanations (key, title, body, what_now, severity) values
('audit:llm_calls_unlinked', 'AI cost cannot be traced to this record',
 'The AI call log records which function ran but never which record it ran on, and the field that could carry it is empty on every row ever written. Model, token and cost attribution for this item is not possible — and must not be guessed from timing, which would invent a link that was never recorded.',
 'Nothing to do here. Fixing it means recording the record id at the point each AI call is made.', 'info'),
('audit:ingestion_events_no_entity_link', 'Some ingest steps cannot be traced back',
 'The ingest step log carries a direct link to the record for venues, cities and countries only. For events, people, articles, listings, villages and organisations the only route back is the staging row, so steps from a path that never recorded one are invisible here.',
 null, 'info'),
('audit:no_consensus_table', 'No multi-source comparison for this type',
 'Cross-source agreement is recorded for venues and cities only; five other types have no such ledger. And even for venues the ledger only records disagreements, so having none is the normal case rather than a gap in the data.',
 null, 'info'),
('audit:revisions_begin_at_enablement', 'History starts when recording was switched on',
 'Field-level change history begins when it was enabled for this table, not when the record was created. The oldest entry below is the first change we recorded, not the first change that happened.',
 null, 'info'),
('audit:provenance_undated', 'Some source facts carry no date',
 'Field provenance records where a value came from but usually not when. Those entries appear at the end as current state rather than in the timeline — dating them from the record''s last-modified time would invent a history indistinguishable from a real one.',
 null, 'info'),
('audit:no_node_timing', 'No per-step timing for this record',
 'Pipeline runs record their steps as a single snapshot rather than as timed rows, so how long each step took for this particular record cannot be reconstructed. Only the run as a whole is available.',
 null, 'info'),
('audit:no_provenance_surface', 'No source-by-source record for this type',
 'This entity type does not keep a per-field source breakdown, so the timeline can show what changed but not which of several sources each value came from.',
 null, 'info'),
('audit:automation_unlinked', 'Nightly jobs are not linked to records',
 'Automated job runs record what they examined in total but not which records they touched. A change made by a job appears here only when the job declared who it was; undeclared ones show as system with no name.',
 null, 'info'),
('audit:unregistered_explanation_keys', 'Some steps have no written explanation',
 'One or more machine codes below have no plain-language entry yet, so they show as raw codes. They are shown rather than hidden on purpose: a code nobody has explained must look unexplained, not look absent.',
 'Tell an engineer which codes appear unexplained — each one needs a written entry.', 'warning')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_missing text[];
  v_total   int;
  v_badsev  int;
begin
  select count(*) into v_total from public.pipeline_explanations;
  if v_total < 150 then
    raise exception 'pipeline_explanations seeded % rows, expected at least 150', v_total;
  end if;

  -- THE ANTI-DRIFT HALF. The signal vocabulary lives in seven CHECK
  -- constraints; this asserts every value in every one of them has prose.
  -- Without it the registry is decoration, and a new signal type added to a
  -- CHECK would render as a raw code forever with nothing reporting it.
  -- Pull every quoted literal out of the CHECK body rather than splitting on
  -- commas: the rendered form is `signal_type = ANY (ARRAY['a'::text, ...])`,
  -- and a comma split has to strip casts and quotes by hand.
  select array_agg(distinct m[1] order by m[1]) into v_missing
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral regexp_matches(
    pg_get_constraintdef(con.oid), '''([a-z_]+)''::text', 'g') as m
  where n.nspname = 'public'
    and c.relname like '%\_quality\_signals'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%signal_type%'
    and not exists (
      select 1 from public.pipeline_explanations pe
       where pe.key = 'signal:' || m[1]
    );

  if v_missing is not null and cardinality(v_missing) > 0 then
    raise exception 'signal types present in a live CHECK but unexplained: %',
      array_to_string(v_missing, ', ');
  end if;

  -- A registered key whose severity is wrong for its producer is worse than
  -- an unregistered one: it renders confidently and misleads.
  select count(*) into v_badsev
  from public.pipeline_explanations
  where producer = 'pipeline-validate'
    and ((code like 'E\_%' and severity <> 'blocking')
      or (code like 'W\_%' and severity <> 'warning'));
  if v_badsev > 0 then
    raise exception '% pipeline-validate rows carry a severity that contradicts their code prefix', v_badsev;
  end if;

  -- Anon must never read editor-facing copy about internal pipeline state.
  if has_table_privilege('anon', 'public.pipeline_explanations', 'SELECT') then
    raise exception 'pipeline_explanations is readable by anon';
  end if;

  raise notice 'pipeline_explanations: % rows, signal vocabulary fully covered', v_total;
end $verify$;
