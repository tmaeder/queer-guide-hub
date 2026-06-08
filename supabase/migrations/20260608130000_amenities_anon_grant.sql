-- The amenities vocabulary is public reference data (the frontend reads it for
-- labels + icons via useAmenityVocabulary). The legacy table had an RLS
-- "Public read access" policy but no table-level GRANT to anon, so anon SELECT hit
-- permission-denied and the UI fell back to humanized slugs / Tag icons. Grant read.
GRANT SELECT ON public.amenities TO anon, authenticated;
