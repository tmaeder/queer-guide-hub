-- Six venue descriptors stayed age-gated after being moved out of the kink
-- line, and the reason is a gap in the move that did it.
--
-- `20261006140100` (deterministic re-filing) moved Sauna, Bathhouse,
-- Clothing-Optional, Nudist and Adult-Oriented from kink stops to Venue
-- Types / Venue Features & Policies. It promoted the new primary and demoted
-- the old one — but it only DELETED junction rows pointing at old-tree ROOTS
-- and at the five stops v3 dissolved. `bdsm-power-exchange` and
-- `fetishes-interests` survived the swap (renamed to Dynamics & Roles and
-- Fetishes), so for those tags the old row survived as a non-primary
-- assignment.
--
-- That is not cosmetic, because `unified_tags_recompute_is_adult()` matches
-- ANY assignment, not the primary one. So the six kept `is_adult = true`:
-- measured on prod after the swap, Sauna (1,370 uses), Clothing-Optional
-- (1,690), Nudist (571), Adult-Oriented (128), Bathhouse (6) and Metal are
-- behind the 18+ affirmation and carry noindex — as venue descriptors. The
-- move existed precisely to say they are not kink concepts, and the residue
-- reversed its only visible consequence.
--
-- The general shape, rather than a name list: a tag whose PRIMARY filing is
-- a descriptor stop has no business carrying a kink assignment it did not
-- earn. Cruising is the one deliberate exception — `20261006140100` added
-- its Practices & Play cross-listing on purpose (it is a venue feature AND a
-- sexual practice), and gating it is correct — so it is excluded by name and
-- the exclusion is asserted, not assumed.
--
-- Deleting the junction row is enough: the AFTER trigger on
-- tag_category_assignments recomputes is_adult per row. No manual flag write.

set local statement_timeout = '600s';

do $$
declare
  v_removed int;
  v_still_gated int;
begin
  perform set_config('app.actor', 'migration:20261006160000_descriptor_kink_residue_unfile', true);

  with descriptor_primary as (
    select a.tag_id
    from tag_category_assignments a
    join tag_categories c on c.id = a.category_id
    join unified_tags t on t.id = a.tag_id
    where a.is_primary
      and t.status = 'active' and t.merged_into_id is null
      and c.slug in ('venues-nightlife','safe-spaces','audiences','vibe-crowd',
                     'travel-destinations','support-services','accommodation',
                     'sports-recreation','events-scene')
      and lower(t.name) <> 'cruising'
  )
  delete from tag_category_assignments a
  using descriptor_primary d, tag_categories c, tag_categories p
  where a.tag_id = d.tag_id
    and c.id = a.category_id
    and p.id = c.parent_id
    and p.slug = 'sex-kink'
    and not a.is_primary;
  get diagnostics v_removed = row_count;

  -- Post-condition: no descriptor-primary tag is adult any more, except the
  -- deliberate exception. A non-zero count here means another writer of
  -- is_adult exists, or a second residue shape this delete does not cover.
  select count(*) into v_still_gated
  from unified_tags t
  join tag_category_assignments a on a.tag_id = t.id and a.is_primary
  join tag_categories c on c.id = a.category_id
  where t.status = 'active' and t.merged_into_id is null and t.is_adult
    and c.slug in ('venues-nightlife','safe-spaces','audiences','vibe-crowd',
                   'travel-destinations','support-services','accommodation',
                   'sports-recreation','events-scene')
    and lower(t.name) <> 'cruising';
  if v_still_gated > 0 then
    raise exception 'descriptor residue: % descriptor-primary tags are still is_adult after the unfile', v_still_gated;
  end if;

  -- The exception must still BE the exception: if Cruising lost its kink
  -- cross-listing, this migration deleted something it was told not to.
  if not exists (
    select 1 from unified_tags t
    join tag_category_assignments a on a.tag_id = t.id
    join tag_categories c on c.id = a.category_id
    join tag_categories p on p.id = c.parent_id and p.slug = 'sex-kink'
    where lower(t.name) = 'cruising' and t.status = 'active') then
    raise exception 'descriptor residue: cruising lost its deliberate kink cross-listing';
  end if;

  raise notice 'descriptor residue: removed % stale kink assignments', v_removed;
end $$;
