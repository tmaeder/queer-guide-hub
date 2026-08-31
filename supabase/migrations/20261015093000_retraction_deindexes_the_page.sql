-- Retracting prose must deindex the page in the same breath.
--
-- 20261012090500 emptied four wrong-sense tags and left the two indexable
-- ones ADVERTISED IN THE SITEMAP WITH NOTHING ON THEM: clothing-optional and
-- furniture went `seo_indexable=true` with description, short_description and
-- long_description all null. Caught by the ratchet within minutes —
-- `tag_hygiene_stats().indexable_without_description` 0 → 2, a counter whose
-- baseline is a true zero-invariant.
--
-- `run_tag_thin_page_reindex()` would have deindexed them at 04:20, so the
-- exposure was bounded — but "a crawler may index an empty page for the next
-- fourteen hours" is not the same as "a blank is honest and gets deindexed
-- automatically", which is what the retraction was justified on. The window
-- is the defect.
--
-- The one-shot below is the smaller half. The RECURRING half is
-- `tag_prose_apply(p_retract => true)`, the mode='prose' subject judge's
-- retraction path, which empties prose on tags every two hours and would have
-- re-created this state daily, a few rows at a time, forever. It now clears
-- `seo_indexable` in the SAME UPDATE — one statement, so a page can never be
-- both empty and indexable even momentarily, and one write rather than two
-- against the spine → search chain.
--
-- Re-indexing is NOT this function's job and is deliberately left to
-- `run_tag_thin_page_reindex()`, which already restores `seo_indexable` the
-- moment real prose exists. A retraction that also re-indexed would be
-- guessing about content it just decided was wrong.

create or replace function public.tag_prose_apply(
  p_tag_id uuid,
  p_description text default null,
  p_short_description text default null,
  p_retract boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare v_row unified_tags%rowtype;
begin
  perform set_config('app.actor', 'llm:tag-prose-pass', true);
  select * into v_row from unified_tags where id = p_tag_id and status = 'active';
  if not found then return; end if;
  if v_row.is_sensitive or v_row.is_adult then
    raise exception 'tag_prose_apply: sensitive/adult tag — review path only';
  end if;

  if p_retract then
    -- Wrong subject: remove the claim, the identity it was derived from, AND
    -- the page's place in the index. The weekly medical-codes/hierarchy syncs
    -- regenerate from wikidata_id, so a wrong identifier rebuilds wrong data
    -- forever while a null one rebuilds nothing; and an empty page must not
    -- sit in the sitemap while it waits for the nightly thin-page sweep.
    update unified_tags
    set description = null, short_description = null, long_description = null,
        wikidata_id = null, wikipedia_url = null,
        seo_indexable = false,
        updated_at = now()
    where id = p_tag_id;
  else
    update unified_tags
    set description = coalesce(p_description, description),
        short_description = coalesce(p_short_description, short_description),
        updated_at = now()
    where id = p_tag_id;
  end if;
end $$;
revoke all on function public.tag_prose_apply(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.tag_prose_apply(uuid, text, text, boolean) to service_role;

-- The two rows 20261012090500 left exposed. Predicate, not an id list: any
-- other row in the same shape is the same defect and gets the same treatment.
do $$
declare v int;
begin
  perform set_config('app.actor', 'migration:20261015093000_retraction_deindexes_the_page', true);

  update public.unified_tags
  set seo_indexable = false, updated_at = now()
  where status = 'active'
    and merged_into_id is null
    and seo_indexable
    and coalesce(nullif(btrim(description), ''), short_description) is null;
  get diagnostics v = row_count;
  raise notice 'deindexed % empty-but-indexable tag page(s)', v;
end $$;

-- Zero-invariant, asserted here so the migration fails rather than shipping
-- the state it exists to remove.
do $$
declare v int;
begin
  select (public.tag_hygiene_stats()->>'indexable_without_description')::int into v;
  if v <> 0 then
    raise exception 'indexable_without_description is % after the repair, expected 0', v;
  end if;
end $$;
