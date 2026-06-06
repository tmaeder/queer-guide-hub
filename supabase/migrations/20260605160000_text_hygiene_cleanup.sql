-- L-1 / L-2 / L-3 (audit 2026-06-05) — one-time cleanup of existing bad rows.
-- The forward-looking guards ship with the edge functions: cleanText() now
-- NFKC-normalizes + strips zero-width on ingest (L-2), the marketplace validator
-- rejects a <=0 price that isn't price_type='free' (L-1), and the venue validator
-- flags mojibake names W_MOJIBAKE (L-3). This migration fixes what's already in.

begin;

-- L-2 — strip invisible zero-width codepoints (ZWSP/ZWNJ/ZWJ/BOM) from titles/names.
update public.news_articles
   set title = regexp_replace(title, '[' || U&'\200B\200C\200D\FEFF' || ']', '', 'g')
 where title ~ ('[' || U&'\200B\200C\200D\FEFF' || ']');

update public.venues
   set name = regexp_replace(name, '[' || U&'\200B\200C\200D\FEFF' || ']', '', 'g')
 where name ~ ('[' || U&'\200B\200C\200D\FEFF' || ']');

update public.personalities
   set name = regexp_replace(name, '[' || U&'\200B\200C\200D\FEFF' || ']', '', 'g')
 where name ~ ('[' || U&'\200B\200C\200D\FEFF' || ']');

-- L-1 — a marketplace listing priced <= 0 that isn't free is a feed glitch.
-- Deactivate so it can't surface a "€0" product; left visible to admins.
update public.marketplace_listings
   set status = 'inactive'
 where price <= 0
   and price_type is distinct from 'free'
   and status is distinct from 'inactive';

-- L-3 — flag mojibake venue names for human re-decode (never auto-guess bytes).
update public.venues
   set needs_attention = true
 where coalesce(needs_attention, false) = false
   and name ~ '(Ã[\x80-\xbf©¶¤¨ ]|â€|Ã¢â‚¬)';

commit;
