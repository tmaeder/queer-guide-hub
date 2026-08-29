-- Tag taxonomy recategorization, PR A (2/2): widen the is_adult recompute to
-- the UNION of the outgoing and incoming adult category names.
--
-- `unified_tags_recompute_is_adult()` (20260919100000) hardcodes the v2 adult
-- category NAMES. The taxonomy swap (PR B of the 2026-08-29 program) renames
-- the kink line "Sexuality & Kink" -> "Sex & Kink" and its stops
-- ("BDSM & Power Exchange" -> "Dynamics & Roles", "Fetishes & Interests" ->
-- "Fetishes", "Gear & Aesthetics" -> "Gear", + new "Kink Community & Scenes").
-- If any junction row moved into a renamed/new kink category BEFORE this
-- union is live, the recompute would flip is_adult=false on a live adult tag
-- — under-moderation, the worst failure class here. So this migration MUST be
-- applied before any re-parent/re-file migration runs, and the frontend
-- ADULT_CATEGORY_NAMES union ships in the same PR.
--
-- The parent arm (`tcp.name in (...)`) is what makes the new tree
-- rename-proof: every stop under either kink parent is adult regardless of
-- its own name, so the child-name list only has to carry the OLD names (whose
-- parents may be dropped mid-swap) plus direct-to-parent assignments.
-- PR E trims the old names back out after the old tree is deleted.
--
-- Keeps the `is_adult is distinct from` guard — src/lib/__tests__/
-- tagCategoryTriggers.test.ts pins it (latest-definition scan).

create or replace function public.unified_tags_recompute_is_adult()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
declare
  v_tag_id uuid := coalesce(new.tag_id, old.tag_id);
  v_is_adult boolean;
begin
  if v_tag_id is null then return coalesce(new, old); end if;
  select exists (
    select 1 from public.tag_category_assignments tca
    join public.tag_categories tc on tc.id = tca.category_id
    left join public.tag_categories tcp on tcp.id = tc.parent_id
    where tca.tag_id = v_tag_id
      and (tc.name in ('Sexuality & Kink','Sexual Roles','BDSM & Power Exchange',
                       'Fetishes & Interests','Practices & Play','Gear & Aesthetics',
                       'Body Types & Archetypes',
                       -- incoming tree (PR B): parent + its stops
                       'Sex & Kink','Dynamics & Roles','Fetishes','Gear',
                       'Kink Community & Scenes')
           or tcp.name in ('Sexuality & Kink','Sex & Kink'))
  ) into v_is_adult;
  update public.unified_tags
     set is_adult = v_is_adult
   where id = v_tag_id and is_adult is distinct from v_is_adult;
  return coalesce(new, old);
end;
$fn$;
