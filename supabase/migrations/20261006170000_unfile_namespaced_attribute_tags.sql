-- 92 marketplace attribute tags are filed in the glossary tree, and they are
-- the loudest rows in it.
--
-- The namespace rule is established (20260926100300 and the vocabulary
-- readers it repaired): a tag whose slug carries a marketplace prefix —
-- mat-/vibe-/occ-/dept-/attr-/own-/rating-/color-/size-/genre-/fit- — is a
-- product facet, not a glossary term, and belongs to NO glossary category.
-- Filing them is what once made Cotton and Silicone `is_adult`, and keying a
-- lookup on `category` instead of the prefix is what silently emptied five
-- attribute-vocabulary readers.
--
-- The rule was never enforced on the rows themselves. Measured after the v3
-- swap: 92 of 98 active namespaced tags hold a glossary assignment, spread
-- over 25 stops, and because their usage counts are the highest in the
-- corpus they OWN the head of the stops they landed in — `mat-spandex`
-- (3,044), `vibe-bold` (2,984), `vibe-elegant` (2,410), `mat-cotton`
-- (2,203) are the top four terms under Identity → Expression & Style, a
-- stop that exists for butch/femme/androgyny.
--
-- 20261006140100 unfiled the UN-prefixed twins (Spandex, Lace) and left the
-- prefixed originals, which is backwards: the twins are the small rows and
-- the originals carry the traffic.
--
-- entity_kind is already 'attribute' on all of them (same migration), so
-- this only removes the filing: junction rows, both mirrors. Nothing about
-- the tags' marketplace function changes — the tag→entity links in
-- `unified_tag_assignments` and every prefix-keyed reader are untouched,
-- which is the point of the prefix being the key. That invariant is
-- asserted rather than asserted-by-comment, because the two junction tables
-- differ by one word and deleting from the wrong one would silently unlink
-- 48k marketplace listings.

set local statement_timeout = '600s';

do $$
declare
  v_prefix constant text := '^(mat|vibe|occ|dept|attr|own|rating|color|size|genre|fit)-';
  v_rows int;
  v_left int;
  v_assignments_before int;
begin
  perform set_config('app.actor', 'migration:20261006170000_unfile_namespaced_attribute_tags', true);

  select count(*) into v_assignments_before
  from unified_tag_assignments a
  join unified_tags t on t.id = a.tag_id
  where t.slug ~ v_prefix;

  delete from tag_category_assignments a
  using unified_tags t
  where t.id = a.tag_id and t.slug ~ v_prefix;
  get diagnostics v_rows = row_count;

  -- Both mirrors. `category` is written explicitly so the column-scoped
  -- search trigger fires and the stale facet key leaves search_documents.
  update unified_tags
     set category_id = null, category = null
   where slug ~ v_prefix and (category_id is not null or category is not null);

  -- Post-conditions.
  select count(*) into v_left
  from unified_tags t
  where t.slug ~ v_prefix and t.status = 'active'
    and (t.category_id is not null or t.category is not null
         or exists (select 1 from tag_category_assignments a where a.tag_id = t.id));
  if v_left > 0 then
    raise exception 'namespaced unfile: % namespaced tags are still filed', v_left;
  end if;

  -- The marketplace side must be untouched — this migration removes a
  -- glossary FILING, not a product facet. `tag_category_assignments` (tag →
  -- category) and `unified_tag_assignments` (tag → entity) are one word
  -- apart; deleting from the wrong one would silently unlink every tagged
  -- listing, so the count is asserted.
  if (select count(*) from unified_tag_assignments a
        join unified_tags t on t.id = a.tag_id
       where t.slug ~ v_prefix) <> v_assignments_before then
    raise exception 'namespaced unfile: tag→entity assignments changed — wrong table touched';
  end if;

  raise notice 'namespaced unfile: removed % glossary assignments', v_rows;
end $$;
