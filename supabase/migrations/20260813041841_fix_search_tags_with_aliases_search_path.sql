-- search_tags_with_aliases threw on EVERY call: `similarity(text, text) does
-- not exist`.
--
-- pg_trgm lives in the `extensions` schema (Supabase convention), and this
-- function's search_path was `public, pg_temp` — so neither `similarity()` nor
-- the `%` operator could resolve. Every sibling trigram function already gets
-- this right: search_autocomplete is `public, extensions, pg_temp` and
-- detect_near_duplicate_tags is `public, extensions`. This one was the
-- exception, which is why it sat in the schema with zero call sites: the
-- alias-aware tag search it exists to provide had never once returned a row.
--
-- Found while wiring it into /tags — the RPC was firing with the right
-- arguments and the UI was quietly rendering nothing, because the client hook
-- logs the PostgREST error and falls back to an empty list.
--
-- Verified after applying: `search_tags_with_aliases('lesbain')` → Lesbian
-- (canonical, 0.333) and `search_tags_with_aliases('nb')` → Enby (alias,
-- 1.000). Body is unchanged; only the search_path is corrected.
ALTER FUNCTION public.search_tags_with_aliases(text, integer)
  SET search_path TO 'public', 'extensions', 'pg_temp';
