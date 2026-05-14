-- Pin search_path on city_canonical_key (advisor rule 0011).

ALTER FUNCTION public.city_canonical_key(text)
  SET search_path = public, pg_catalog;
