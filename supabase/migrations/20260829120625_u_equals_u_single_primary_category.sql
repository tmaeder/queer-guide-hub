-- U=U held two primary category assignments; db push has been stuck on it.
--
-- 20261007160000_tag_category_id_backfill_from_junction fills category_id from
-- the primary junction where the column is NULL, then asserts that NO row
-- disagrees with its junction. The fill and the assertion cover different sets:
-- a row whose category_id is already non-null and already disagrees is never
-- touched by the loop, and the assertion catches it anyway. One row was in that
-- state, so the migration failed and took the whole queue with it.
--
-- The row is `u-equals-u`, and it had TWO is_primary rows:
--   Orientation    (sexual-orientation)  created 2026-04-11
--   Sexual Health  (sexual-health)       created 2026-08-16
-- with unified_tags.category_id pointing at Sexual Health and the denormalized
-- `category` text still reading "Orientation".
--
-- U=U is "Undetectable = Untransmittable" — the fact that sustained HIV viral
-- suppression means the virus is not sexually transmitted. It is a clinical
-- fact about transmission, not a sexual orientation. The orientation assignment
-- predates the sexual-health vocabulary that placed it correctly, and it is
-- removed rather than demoted: left as a secondary it would still list U=U on
-- the Sexual Orientation category page, which is the same wrong claim with less
-- visibility. The row's content is recoverable from this migration.
--
-- Corpus-wide there is exactly ONE tag with multiple primaries, so this is a
-- single stale row and not a missing constraint.
--
-- `category` is named in the UPDATE alongside category_id on purpose:
-- trg_search_documents_tag is scoped to the TEXT column, and a column-scoped
-- trigger fires on the columns named in the statement, not on what a BEFORE
-- trigger mutated. Without it search would keep serving "Orientation".
--
-- The assertions below are scoped to this one tag. An assertion that ranges
-- wider than what the migration repairs is what produced this outage.

do $mig$
declare
  v_tag  uuid;
  v_sh   uuid;
  v_n    int;
begin
  perform set_config('app.actor', 'migration:u-equals-u-single-primary', true);

  select id into v_tag from public.unified_tags where slug = 'u-equals-u';
  select id into v_sh  from public.tag_categories where slug = 'sexual-health';
  if v_tag is null or v_sh is null then
    raise notice 'u-equals-u or sexual-health missing; nothing to do';
    return;
  end if;

  delete from public.tag_category_assignments ca
   using public.tag_categories c
   where ca.tag_id = v_tag
     and c.id = ca.category_id
     and c.slug = 'sexual-orientation';

  update public.tag_category_assignments
     set is_primary = true
   where tag_id = v_tag and category_id = v_sh;

  update public.unified_tags
     set category_id = v_sh,
         category    = 'Sexual Health',
         updated_at  = now()
   where id = v_tag
     and (category_id is distinct from v_sh or category is distinct from 'Sexual Health');

  -- Exactly one primary, and the column agrees with it.
  select count(*) into v_n
    from public.tag_category_assignments where tag_id = v_tag and is_primary;
  if v_n <> 1 then
    raise exception 'u-equals-u: % primary assignment(s), expected exactly 1', v_n;
  end if;

  select count(*) into v_n
    from public.unified_tags t
    join public.tag_category_assignments ca
      on ca.tag_id = t.id and ca.is_primary
   where t.id = v_tag and t.category_id is distinct from ca.category_id;
  if v_n > 0 then
    raise exception 'u-equals-u: column still disagrees with its junction';
  end if;

  raise notice 'u-equals-u: single primary is now sexual-health';
end
$mig$;
