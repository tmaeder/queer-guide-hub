-- SUPERSEDED. This migration's work was applied under 20261027120000; what is
-- left here is a deliberate no-op that exists only to keep the version in the
-- queue and let `db push` past it.
--
-- WHY THE FILE IS STILL HERE RATHER THAN DELETED. `check-migration-drift.mjs`
-- has a merge-base arm that treats any version present on origin/main and
-- missing from the working tree as "already in remote history — you deleted or
-- renamed it", and refuses the push. That inference is normally right and is
-- wrong here, because it assumes merged-to-main implies applied-to-prod. This
-- version is the counterexample: it merged and never applied. Deleting the file
-- is therefore the correct end state and is currently unpushable, so the file
-- stays and its body goes away instead.
--
-- WHAT HAPPENED, IN ORDER
--
--   #3194  shipped the facet resync.
--   #3224  lifted it to 20261028120000 so it would sort above the remote max
--          and apply.
--   (hand) it was applied to prod at 20261027120000 instead, with its final
--          assertion relaxed.
--   #3227  committed the recovery file at 20261027120000 — but left this copy
--          in place, so the repo carried the same migration twice.
--
-- THE STRICT COPY THEN FAILED ITS OWN ASSERTION, and because `db push` stops at
-- the first failure and takes everything behind it, every later migration
-- silently stopped applying. Measured on the deploy for #3228:
--
--     Applying migration 20261028120000_practice_refile_search_facet_resync.sql...
--     ERROR: facet resync: a row left Practices & Play:
--            69=Positions, doggy-style=Positions (SQLSTATE P0001)
--
-- The assertion is not defending anything any more: the sex-positions import
-- deliberately moved `69` and `doggy-style` into the new Positions stop. Where
-- a row LIVES is not this migration's business — the relaxed 20261027120000
-- version says exactly that, and this file predates that correction.
--
-- EMPTYING IT IS LOSSLESS, MEASURED RATHER THAN ASSUMED, on prod before writing
-- this:
--
--     20261028120000 in schema_migrations ......... 0   (never applied)
--     20261027120000 in schema_migrations ......... 1   (applied)
--     facet/column mismatches among the 20 tags ... 0   (the work is done)
--
-- So the effect this migration exists to produce is already in production under
-- the other version. Re-running it would be harmless but pointless; asserting
-- over it is what breaks.
--
-- DO NOT "restore" this body. If you want the resync logic, it is at
-- 20261027120000, which is the version prod actually ran.

do $$
begin
  raise notice
    'practice_refile_search_facet_resync: superseded by 20261027120000, no-op';
end $$;
  -- Every row is queued for reindex (or already drained, if the cron ran
  -- between the loop and here — hence the OR).
  select count(*) into v_n
  from public.unified_tags u
  where u.slug = any (array[
          'anal-sex','oral-sex','oral','blowjob','rimming','deepthroat',
          'handjob','felching','snowballing','tribbing','masturbation',
          'masturbating','mutual-masturbation','threesome','orgy','group-sex',
          '69','doggy-style','making-out','sexting'])
    and u.status = 'active' and u.merged_into_id is null
    and not exists (
      select 1 from public.search_reindex_queue q
       where q.entity_id = u.id and q.entity_type = 'tag')
    and exists (
      select 1 from public.search_documents d
       where d.entity_id = u.id and d.entity_type = 'tag'
         and d.facets->>'category' is distinct from u.category);
  if v_n > 0 then
    raise exception
      'facet resync: % row(s) neither queued nor already correct in search_documents', v_n;
  end if;

  -- The column still agrees with the junction. That — and only that — is what
  -- this migration writes: it re-states `category` from the primary junction so
  -- the column-scoped search trigger fires. It does not choose a destination.
  --
  -- AN EARLIER VERSION ALSO REQUIRED c.slug = 'practices-play', AND THAT KILLED
  -- THE DEPLOY. Between the practice re-file and this migration reaching prod, a
  -- concurrent session added a `Positions` stop and moved `69` and `doggy-style`
  -- into it — more accurate than Practices & Play, since those two are positions
  -- rather than acts. This migration did its own job correctly (20 rows
  -- re-stated, notice in the log) and then failed its own assertion on someone
  -- else's better filing:
  --
  --   ERROR: facet resync: a row left Practices & Play:
  --          69=Positions, doggy-style=Positions
  --
  -- db push aborted, so nothing applied. Same class as 20261007160000 earlier in
  -- this programme: an assertion wider than the repair reports another session's
  -- later write as this migration's defect. A guard may only cover what its own
  -- migration changed — here, column-vs-junction agreement, whatever category
  -- the junction names.
  select string_agg(u.slug || ' text=' || coalesce(u.category, 'NULL') ||
                    ' junction=' || coalesce(c.name, 'NULL'), ', ') into v_bad
  from public.unified_tags u
  join public.tag_category_assignments a on a.tag_id = u.id and a.is_primary
  join public.tag_categories c on c.id = a.category_id
  where u.slug = any (array[
          'anal-sex','oral-sex','oral','blowjob','rimming','deepthroat',
          'handjob','felching','snowballing','tribbing','masturbation',
          'masturbating','mutual-masturbation','threesome','orgy','group-sex',
          '69','doggy-style','making-out','sexting'])
    and u.status = 'active' and u.merged_into_id is null
    and u.category is distinct from c.name;
  if v_bad is not null then
    raise exception 'facet resync: column disagrees with its junction: %', v_bad;
  end if;

  -- No redirect points at a merged tag any more. Deliberately NOT asserting
  -- zero on the whole `redirect_to_non_canonical` class: 57 rows point at
  -- deprecated tags with no canonical to follow, they are the baseline, and an
  -- assertion wider than the repair is what took db push down earlier today.
  select count(*) into v_n
  from public.tag_slug_redirects r
  join public.unified_tags t on t.id = r.tag_id
  where t.merged_into_id is not null;
  if v_n > 0 then
    raise exception 'facet resync: % redirect(s) still target a merged tag', v_n;
  end if;
end $verify$;
