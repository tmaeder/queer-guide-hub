-- Merge the two Essen district placeholders into the real city of Essen.
--
-- /city and search carried THREE Essen rows: "Essen" (real, 48 venues, 5 events)
-- plus "Rüttenscheid, Essen" and "Freisenbruch, Essen" -- both Stadtteile, both
-- shell_status='placeholder', seo_indexable=false, tmp- slug, zero venues/events/
-- hotels/news. Their only reason for existing is one personalities.city_id link
-- each (Karl Rothschild, birth_place 'Freisenbruch, Essen (DE)'; Emanuel Friedrich
-- Karl Christian Schumacher, 'Rüttenscheid, Essen (DE)'). A city district is not a
-- city on this platform, so the rows are noise in every city surface.
--
-- They are legacy debris from the person-import minter (20260510150000 ->
-- 20260606001000): it stripped only the parenthetical off birth_place and inserted
-- the whole comma-joined string as a city with slug 'tmp-'||gen_random_uuid().
-- That path was replaced by city_resolve_queue in 20260811100100, so nothing live
-- re-creates these rows -- this is a pure data repair, no code change needed.
--
-- merge_cities does the work and two of its side effects are the point here:
-- the persons keep their district precision in personalities.birth_place (prose is
-- untouched, only city_id is repointed), and the dropped name is registered as a
-- city_alias of Essen -- so a future import of 'Rüttenscheid, Essen' resolves to
-- Essen via match_personality_city()'s alias step instead of minting a new stub.
--
-- Same-country pair, so the cross-country guard never fires. Reversible via
-- unmerge_cities + city_merge_audit. auth.uid() is null in a migration, which is
-- the branch merge_cities' admin check deliberately allows.
--
-- Scope is Essen only. ~115 more "District, City" placeholders exist platform-wide,
-- but that set is NOT bulk-mergeable: 'Stolberg, Aachen', 'Meerane, Chemnitz' and
-- 'Blackburn, Lancashire' are independent places, not districts. Curated pass later.

do $$
declare
  pairs uuid[][] := array[
    -- keep (Essen)                                drop (district placeholder)
    array['ad1f17ac-c22e-4cb7-aeb8-b3ec2c47ce68','08e0667e-bc75-439a-af10-d48a273e2739'], -- Essen ← Rüttenscheid, Essen
    array['ad1f17ac-c22e-4cb7-aeb8-b3ec2c47ce68','6f5354a0-65dc-4827-986c-ce04b859ef21']  -- Essen ← Freisenbruch, Essen
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    -- idempotent: skip pairs already merged (safe to re-apply this migration)
    if exists (select 1 from public.cities where id = pairs[i][2] and duplicate_of_id is null) then
      perform public.merge_cities(pairs[i][1], pairs[i][2]);
    end if;
  end loop;
end $$;
