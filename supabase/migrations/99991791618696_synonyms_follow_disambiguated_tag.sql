-- Six approved search synonyms rewrite a German term to a bare English word that now
-- belongs to a DIFFERENT live tag, so the search lands on the wrong concept.
--
-- HOW IT HAPPENED, in three steps by two other sessions:
--   1. 20261010054315 deleted 41 aliases whose alias_name had become equal to their tag's
--      name. `search_synonyms.tag_alias_id` is FK ON DELETE **SET NULL**, not CASCADE, so
--      the linked synonym rows were orphaned rather than removed (34 of them).
--   2. 20261010054416's synonym-delete arm ran a minute later and matched NOTHING, because
--      the alias ids it keyed on were already gone. Its guard still passed.
--   3. 20261010054303 then renamed the German tags to DISAMBIGUATED labels
--      ("Anonymous Testing", "French Fries", "Community Networking"), while each orphaned
--      synonym kept rewriting to the old bare word -- which by then was another tag's name.
--
-- Measured now, all six land on a genuinely different ACTIVE tag:
--
--   term                   own tag (correct)                      rewrite lands on
--   anonym                 Anonymous Testing  Safety & Consent    Anonymous   FETISHES
--   pommes                 French Fries       Gear                FRIES       Consent & Negotiation
--   arzt/ärztin            Medical Doctor     Sex & Kink          Doctor      Dynamics & Roles
--   vernetzung             Community Networking Relationship St.  Networking  Slang & Language
--   entfesselungskunstler  Escapologist       Sex & Kink          Escape Artist Dynamics & Roles
--   kriegerin              Female Warrior     Sex & Kink          Warrior     Positions
--
-- `anonym` is the one that matters: 102 assignments, and a German search for anonymity is
-- rewritten onto a FETISHES tag. `pommes` is the same shape -- potato fries rewritten onto
-- FRIES, the consent acronym (Freely given, Reversible, Informed, Enthusiastic, Specific).
--
-- Those two pairs are exactly the collisions an earlier pass refused to merge on the
-- grounds that they are different concepts. The disambiguating renames confirmed that
-- reading; this fixes the synonyms that were still pointing across the boundary.
--
-- RE-POINT, NOT DROP. A German synonym should route to ITS OWN tag. Dropping the rows
-- would silently remove German-language search coverage (anonym alone is a 102-assignment
-- tag), which is a product regression, not a cleanup. Re-pointing preserves the coverage
-- and removes the misroute, and it is the pattern 20261010054303's own merge block already
-- uses (`update search_synonyms set replacements = ARRAY[lower(c.name)]`).
--
-- THE OTHER 28 ORPHANS ARE DELIBERATELY LEFT ALONE. They are `tag_alias_id IS NULL` too,
-- but their replacement still equals their own tag's current name, so they route correctly
-- and only their provenance link is lost. Re-linking them means re-creating 28 alias rows,
-- which is the work the alias cleanup deliberately undid -- a different decision, and not
-- one to smuggle in behind a misroute fix.
--
-- SCOPED POSTCONDITIONS. P1/P2 assert only these six rows. A corpus-wide "no synonym
-- disagrees with its tag" invariant would abort `db push` repo-wide the moment another
-- session renames a tag, and sessions are actively renaming tags today.
--
-- `search_synonyms` has no `updated_at`, and `unified_tags.updated_at` is NOT maintained on
-- the rename path (it read 05:01 while tag_change_log showed writes at 05:25) -- so nothing
-- here judges recency from a timestamp. Rows are selected by the structural condition.

begin;

create temp table _syn_fix as
select s.id,
       s.terms[1]                  as term,
       s.replacements[1]           as old_replacement,
       lower(btrim(t.name))        as new_replacement,
       t.slug                      as own_slug,
       t.name                      as own_name
from search_synonyms s
join unified_tags t on t.id = s.tag_id
where s.tag_alias_id is null
  and s.status = 'approved'
  and lower(s.replacements[1]) <> lower(btrim(t.name))
  -- Only the rows whose rewrite actually resolves to a DIFFERENT live tag. A replacement
  -- that matches nothing is merely stale, not a misroute, and is left for its own pass.
  and exists (
    select 1 from unified_tags o
     where o.status = 'active'
       and o.id <> s.tag_id
       and lower(btrim(o.name)) = lower(s.replacements[1])
  );

do $fix$
declare v_n int;
begin
  select count(*) into v_n from _syn_fix;
  if v_n = 0 then
    raise notice 'nothing to fix -- already resolved upstream';
    return;
  end if;
  if v_n > 20 then
    raise exception 'refusing: % rows match, far beyond the 6 measured. Re-read the set before sweeping.', v_n;
  end if;

  update search_synonyms s
     set replacements = array[f.new_replacement],
         notes = coalesce(s.notes || ' | ', '')
               || format('re-pointed %s -> %s on 99991791618696: the tag was disambiguated to %L while this synonym still rewrote to %L, which is another live tag',
                         f.old_replacement, f.new_replacement, f.own_name, f.old_replacement)
    from _syn_fix f
   where s.id = f.id;

  raise notice 're-pointed % synonym(s)', v_n;
end
$fix$;

-- ---------------------------------------------------------------------------
-- P1. Every row this migration selected now rewrites to its own tag's name.
--     Scoped to that set, so a concurrent rename elsewhere cannot fail this.
-- ---------------------------------------------------------------------------
do $p1$
declare v_bad text; v_total int;
begin
  select count(*) into v_total from _syn_fix;
  if v_total = 0 then raise notice 'P1 skipped: empty set'; return; end if;

  select string_agg(f.term || ' -> ' || s.replacements[1] || ' (want ' || f.new_replacement || ')', ', ')
    into v_bad
  from _syn_fix f
  join search_synonyms s on s.id = f.id
  join unified_tags t on t.id = s.tag_id
  where lower(s.replacements[1]) <> lower(btrim(t.name));

  if v_bad is not null then
    raise exception 'P1 failed: still disagreeing with its own tag: %', v_bad;
  end if;
  raise notice 'P1 ok: all % rewrite to their own tag', v_total;
end
$p1$;

-- ---------------------------------------------------------------------------
-- P2. The rewrite no longer resolves to a different live tag -- the actual defect.
--     P1 alone would pass if a rename coincidentally made the old word correct.
-- ---------------------------------------------------------------------------
do $p2$
declare v_bad text;
begin
  select string_agg(f.term || ' still lands on ' || o.slug, ', ') into v_bad
  from _syn_fix f
  join search_synonyms s on s.id = f.id
  join unified_tags o
    on o.status = 'active' and o.id <> s.tag_id
   and lower(btrim(o.name)) = lower(s.replacements[1]);

  if v_bad is not null then
    raise exception 'P2 failed: rewrite still resolves to a different tag: %', v_bad;
  end if;
  raise notice 'P2 ok: no rewrite resolves to a foreign tag';
end
$p2$;

-- ---------------------------------------------------------------------------
-- P3. The term itself is untouched -- this fixes where a search GOES, never what a
--     user typed. Rewriting `terms` would silently drop German search coverage.
-- ---------------------------------------------------------------------------
do $p3$
declare v_bad text;
begin
  select string_agg(f.term || ' -> ' || s.terms[1], ', ') into v_bad
  from _syn_fix f join search_synonyms s on s.id = f.id
  where s.terms[1] is distinct from f.term;

  if v_bad is not null then
    raise exception 'P3 failed: a search term was altered: %', v_bad;
  end if;
  raise notice 'P3 ok: every German term preserved';
end
$p3$;

-- ---------------------------------------------------------------------------
-- P4. Nothing was deleted and nothing was approved or unapproved. The row count and
--     status mix are unchanged -- this is a re-point, not a cull.
-- ---------------------------------------------------------------------------
do $p4$
declare v_missing int; v_unapproved int;
begin
  select count(*) into v_missing
  from _syn_fix f where not exists (select 1 from search_synonyms s where s.id = f.id);
  if v_missing > 0 then
    raise exception 'P4 failed: % selected row(s) no longer exist -- this migration must not delete', v_missing;
  end if;

  select count(*) into v_unapproved
  from _syn_fix f join search_synonyms s on s.id = f.id where s.status <> 'approved';
  if v_unapproved > 0 then
    raise exception 'P4 failed: % row(s) left the approved state', v_unapproved;
  end if;
  raise notice 'P4 ok: no deletions, no status changes';
end
$p4$;

-- ---------------------------------------------------------------------------
-- P5. The 28 correctly-routing orphans are untouched. They share the
--     `tag_alias_id IS NULL` shape, so a careless predicate would have swept them.
-- ---------------------------------------------------------------------------
do $p5$
declare v_ok int;
begin
  select count(*) into v_ok
  from search_synonyms s join unified_tags t on t.id = s.tag_id
  where s.tag_alias_id is null and s.status = 'approved'
    and lower(s.replacements[1]) = lower(btrim(t.name))
    and not exists (select 1 from _syn_fix f where f.id = s.id);

  if v_ok = 0 then
    raise exception 'P5 failed: the correctly-routing orphan cohort is empty -- it held 28 rows, so a sweep took rows it should not have';
  end if;
  raise notice 'P5 ok: % correctly-routing orphan(s) left alone', v_ok;
end
$p5$;

drop table if exists _syn_fix;

commit;
