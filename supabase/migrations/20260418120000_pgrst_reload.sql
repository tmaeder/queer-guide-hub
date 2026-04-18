-- Force PostgREST to reload its schema cache.
-- Guards against 404s on PATCH /rest/v1/profiles after schema-modifying
-- migrations land before the cache refreshes (same class of bug as the
-- inbox_orphan_count_v 404s fixed in #32).
NOTIFY pgrst, 'reload schema';
