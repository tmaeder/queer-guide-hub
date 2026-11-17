-- Recover the exact already-applied production migration; do not replay.
-- Recorded statement MD5: 24169b73e4bc583656ab83675cb84bcf

-- Local venue research checks whether a supplied name is a geographic place.
-- Keep its exact normalization and eligibility predicates: merged cities are
-- excluded, while the existing village guard includes every village row.
-- Without these expression indexes, each unmatched name scans the catalogue
-- and recomputes normalize_name for ~20k cities during a 100-case refresh.
set local lock_timeout = '2s';

create index cities_review_geographic_name_idx
on public.cities (public.normalize_name(name))
where duplicate_of_id is null;

create index queer_villages_review_geographic_name_idx
on public.queer_villages (public.normalize_name(name));


