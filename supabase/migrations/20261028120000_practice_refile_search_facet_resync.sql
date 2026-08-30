-- The 20 practice re-files moved the page and left the search facet behind.
--
-- WHAT WENT WRONG, IN ONE SENTENCE
--
-- `20261016095000_practices_are_not_fetishes` wrote
--
--     update unified_tags set category_id = v_cat, updated_at = now() ...
--
-- and `trg_search_documents_tag` is COLUMN-SCOPED on `category` — the
-- denormalised TEXT column. A column-scoped trigger fires on the columns named
-- in the UPDATE STATEMENT, not on what a BEFORE trigger mutated. The BEFORE
-- trigger duly derived `category` from the new `category_id`, but `category` was
-- never named in the statement, so search was never told.
--
-- Measured on prod afterwards, all 20 rows: `unified_tags.category` and the
-- page read "Practices & Play" while `search_documents.facets->>'category'`
-- still read "Fetishes". /tags/anal-sex said one thing and the search facet
-- said the other — the precise disagreement class 20261006110000 repaired
-- corpus-wide and that this programme has now produced twice.
--
-- THIS WAS DOCUMENTED AND I STILL DID IT
--
-- `20261007160000`'s header says "BOTH COLUMNS MUST BE IN THE UPDATE STATEMENT"
-- and explains this exact trigger. `20260829120625` says "`category` is named in
-- the UPDATE alongside category_id on purpose". Both were read the same day the
-- defect was written. Knowing the rule and applying it are different acts, which
-- is why the fix here ends with an assertion on the FACET rather than on the
-- column — a guard that reads what the writer already believes cannot catch the
-- writer's mistake.
--
-- THE FIX
--
-- Re-state `category` at its already-correct value. That is a no-op to the data
-- and the whole point to the trigger: naming the column is what fires it.
-- Verified in a rolled-back transaction on prod — 20 rows in, exactly 20
-- `search_reindex_queue` entries out.
--
-- Since the P1 overhaul that queue is drained by `search_reindex_drain(1000)`
-- every minute, so 20 rows land well inside one cycle; this does not index
-- inline.
--
-- Per-row, because one statement must not touch a single unified_tags tuple
-- twice — the 27000 pair that 20260919100000 split these triggers to escape.

set local statement_timeout = '120s';

select set_config('app.actor', 'migration:practice_refile_search_facet_resync', true);

do $mig$
declare
  r     record;
  v_n   int := 0;
begin
  for r in
    select u.id, u.slug, c.name as cat_name
      from public.unified_tags u
      join public.tag_categories c on c.id = u.category_id
     where u.slug = any (array[
             'anal-sex','oral-sex','oral','blowjob','rimming','deepthroat',
             'handjob','felching','snowballing','tribbing','masturbation',
             'masturbating','mutual-masturbation','threesome','orgy','group-sex',
             '69','doggy-style','making-out','sexting'])
       and u.status = 'active'
       and u.merged_into_id is null
     order by u.slug
  loop
    -- `category` named explicitly. Removing it from this SET list restores the
    -- bug this migration exists to fix.
    update public.unified_tags
       set category   = r.cat_name,
           updated_at = now()
     where id = r.id;
    v_n := v_n + 1;
  end loop;
  raise notice 'facet resync: % row(s) re-stated', v_n;
end $mig$;

-- ---------------------------------------------------------------------------
-- A redirect left pointing at a tag that has since been merged.
--
-- `party-and-play` was merged into `chemsex` by a concurrent session. The merge
-- created `party-and-play -> chemsex` correctly, but did NOT repoint the
-- PRE-EXISTING `party-play -> party-and-play` row, so that chain now ends on a
-- merged tag. The resolver does not follow a redirect whose target is merged:
-- measured on prod, /tags/party-play returns **404** while /tags/party-and-play
-- 301s to /tags/chemsex. A URL that worked yesterday is dead, and a correct
-- destination exists.
--
-- Scoped by PREDICATE, not by slug: any redirect whose target is merged and
-- whose canonical is active gets repointed at the canonical. Exactly ONE row
-- matches today, but written this way it also covers the next merge that
-- forgets a redirect, which is how this one happened.
--
-- The other 57 rows in `redirect_to_non_canonical` are NOT touched. They point
-- at DEPRECATED tags with no `merged_into_id`, so there is no canonical to
-- follow — a different, pre-existing class, and the one the baseline of 58
-- describes. Fixing them means deciding a destination per row, which is not
-- this migration's business.
-- ---------------------------------------------------------------------------
update public.tag_slug_redirects r
   set tag_id = t.merged_into_id
  from public.unified_tags t, public.unified_tags c
 where t.id = r.tag_id
   and t.merged_into_id is not null
   and c.id = t.merged_into_id
   and c.status = 'active'
   and c.merged_into_id is null;

-- Asserts the FACET, not the column. The column was already right — believing
-- it was the whole story is what produced the defect.
do $verify$
declare
  v_bad text;
  v_n   int;
begin
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
