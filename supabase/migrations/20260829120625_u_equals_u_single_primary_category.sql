-- U=U held two primary category assignments; `db push` has been stuck on it.
--
-- APPLIED TO PROD FIRST, VIA MCP, AND COMMITTED AT THE STAMPED VERSION. That is
-- the CLAUDE.md early-apply convention and it is required here rather than
-- optional: this is a PRECONDITION for 20261007160000, which is unapplied, and
-- `db push` applies in version order. A fix stamped above the migration that
-- needs it would never run in time. check-migration-versions exempts a version
-- already in remote history, which is what makes the low stamp legal.
--
-- WHY THE QUEUE WAS BLOCKED
--
-- 20261007160000_tag_category_id_backfill_from_junction fills category_id from
-- the primary junction WHERE THE COLUMN IS NULL, then asserts that NO row
-- disagrees with its junction. Those two sets are not the same. A row whose
-- category_id is already non-null and already disagrees is never touched by the
-- loop, and the assertion catches it regardless — so the migration fails on
-- state it declines to repair. Exactly one row was in that state, and it took
-- every merged migration behind it down with it, including four tag-category
-- repairs and the German synonym activation from #3106.
--
-- That is the same defect this program has now hit three times: an assertion
-- ranging wider than the repair beneath it. 20261003110400 did it (fixed by
-- 20260829063509), and this migration does it again one file later.
--
-- THE ROW
--
-- `u-equals-u` carried TWO is_primary rows:
--     Orientation    (sexual-orientation)   created 2026-04-11
--     Sexual Health  (sexual-health)        created 2026-08-16
-- with unified_tags.category_id pointing at Sexual Health and the denormalized
-- `category` text still reading "Orientation" — so the join produced two rows,
-- one of which disagreed with the column.
--
-- U=U is "Undetectable = Untransmittable": sustained HIV viral suppression
-- means the virus is not sexually transmitted. It is a clinical fact about
-- transmission, not a sexual orientation. The orientation assignment predates
-- the sexual-health vocabulary that placed it correctly, and it is REMOVED
-- rather than demoted — left as a secondary it would still list U=U on the
-- Sexual Orientation category page, which is the same wrong claim with less
-- visibility. The deleted row is recoverable from this file.
--
-- Measured corpus-wide before the fix: exactly ONE tag had multiple primaries.
-- This is a single stale row, not a missing constraint, so no constraint is
-- added here.
--
-- `category` is named in the UPDATE alongside category_id deliberately.
-- trg_search_documents_tag is scoped to the TEXT column, and a column-scoped
-- trigger fires on the columns named in the STATEMENT, not on what a BEFORE
-- trigger mutated. Without naming it, search would keep serving "Orientation".
--
-- Every assertion below is scoped to this one tag. An assertion that ranges
-- wider than what the migration repairs is the thing that caused this outage.

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
