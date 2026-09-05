-- Aliases and search synonyms left pointing at merged tags: repoint all of them
-- at the surviving row, following merge chains to the end.
--
-- WHY THIS EXISTS. `merge_tag_concept` does not move `tag_aliases`, so every
-- merge that does not hand-repoint them afterwards leaves its aliases parented to
-- a tombstone. Each pass has treated its own leftovers and nobody has swept the
-- accumulation: 20270601200000's own comment records "217 aliases already sit on
-- merged tags from earlier work", scopes its assertion around them, and measured
-- 2026-09-05 the number is 378. That comment is the honest note of a corpus-wide
-- invariant being deferred; this is the sweep it was deferred to.
--
-- The immediate trigger: 20270601200000 shipped with four of its nine merges
-- already done by a sibling session, and resolved that by DELETING those four
-- from its merge list. That unblocked db push, correctly, but the four never got
-- their alias re-parent — 26 of the 378 are exactly those (ecstasy 18, priligy 5,
-- prozac 3).
--
-- MEASURED FIRST, 2026-09-05 on prod. 378 aliases over 50 tombstones:
--
--   resolve to an ACTIVE terminal winner              378   (0 unresolvable)
--   multi-hop chains                                    1   night-clubs -> night-club -> nightclub
--   would become a self-alias                           0
--   would collide with an alias already on the winner   0   (structural — see below)
--   would shadow a different active tag                 0
--   alias_name would equal the winner's own name        1   consensual-non-consent-(cnc)
--
-- So 377 re-parent and 1 is deleted. The deleted one is not a judgement call:
-- `Consensual Non-Consent (CNC)` aliasing the tag whose name is
-- `Consensual Non-Consent (CNC)` is the `alias_equals_name` zero-invariant this
-- repo already enforces, and the alias carries nothing the winner does not.
--
-- TWO THINGS CHECKED AGAINST THE CATALOG RATHER THAN ASSUMED.
--
--  1. `tag_aliases_alias_slug_key` is UNIQUE on `alias_slug` ALONE, not on
--     (canonical_tag_id, alias_slug). Re-parenting changes only
--     `canonical_tag_id`, so a unique violation is structurally impossible here
--     — the measured 0 collisions is a property of the schema, not luck.
--
--  2. `trg_tag_alias_reject_shadow` fires on UPDATE OF canonical_tag_id, so it
--     runs on all 377. Its predicate is
--       lower(u.slug)=lower(NEW.alias_slug) AND u.status='active' AND u.id<>NEW.canonical_tag_id
--     and the precondition below is written with that predicate verbatim, against
--     the TERMINAL winner. A guard measured with a looser predicate than the
--     trigger uses is not a measurement of the trigger.
--
-- THE SYNONYM HALF, which an alias-only sweep would miss entirely.
-- `search_synonyms` carries its own `tag_id` beside `tag_alias_id`, and
-- `tag_alias_sync_search_synonym` is AFTER **INSERT** only — nothing propagates a
-- re-parent into it. So the rewrite keeps pointing at the tombstone even after
-- the alias is fixed. Measured: 4 approved live rows whose `tag_id` is a merged
-- tag, and 3 whose `replacements` name a merged slug. One of the 4
-- (`hate-crime`) has NO `tag_alias_id` at all, so it is reachable only by looking
-- at the synonym table directly. This is the arm with actual user-visible harm —
-- a live query rewrite aimed at a page that redirects.
--
-- Chain-following is required in all three arms, not just the alias one:
-- `nightclubs -> night-clubs` resolves through `night-club`, which is itself
-- merged, to `nightclub`.
--
-- ARM C IS SCOPED TO `tag_id IS NOT NULL`, AND THAT IS LOAD-BEARING.
-- `search_synonyms.replacements` is TEXT, and it holds two different kinds of
-- thing. A tag-derived row points at a tag and its replacement is that tag's
-- slug. A hand-authored multilingual row is query expansion, and a term in it may
-- COINCIDE with a tag slug without referring to it. Measured, six live rows have
-- a replacement naming a merged tag, and only three are the first kind:
--
--   tag_id + tag_alias_id set, locale '*'   neurodiversity, nightclubs, night-clubs
--   both NULL,                 locale 'en'  gay, queer, lesbian
--
-- The second three expand to `schwul` / `lesbisch` — German for gay and lesbian —
-- which are also merged tag slugs. Rewriting them would have turned
-- `gay -> [queer, lgbt, lgbtq, schwul]` into `gay -> [queer, lgbt, lgbtq, gay]`:
-- the term expanding to itself, and the German expansion silently deleted, so a
-- search for `gay` stops matching German-labelled content.
--
-- The unscoped version of this would NOT have been caught by the assertion below,
-- because rewriting all six also drives that count to zero. It would have shipped
-- green. `source` is 'imported' on all six and is no help; `tag_id` is the field
-- where a row declares it is about a tag, so that is the scope.

do $mig$
declare
  v_orphans   int;
  v_reparent  int := 0;
  v_deleted   int := 0;
  v_syn_tag   int := 0;
  v_syn_repl  int := 0;
  v_synonyms  int := 0;
  v_bad       int;
  v_list      text;
begin
  -- Several rows here are human_reviewed and log_unified_tag_change() refuses a
  -- `system:%` actor on those. Declared inside the block: db push makes no
  -- promise that a bare statement before a `do` block shares its transaction.
  perform set_config('app.actor', 'migration:alias-tombstone-reparent', true);

  -- Terminal winner for every merged row. Depth-capped so a cycle cannot spin;
  -- a row that does not reach an active tag within the cap is simply absent from
  -- this table and is caught by the precondition rather than silently skipped.
  create temp table _terminal as
  with recursive chain(start_id, cur_id, depth) as (
      select t.id, t.id, 0
        from public.unified_tags t
       where t.status = 'merged'
    union all
      select c.start_id, t.merged_into_id, c.depth + 1
        from chain c
        join public.unified_tags t on t.id = c.cur_id
       where t.status = 'merged' and t.merged_into_id is not null and c.depth < 10
  )
  select c.start_id, c.cur_id as final_id, c.depth
    from chain c
    join public.unified_tags w on w.id = c.cur_id and w.status = 'active';

  ---------------------------------------------------------------- preconditions
  -- An orphan with no reachable active winner has no defensible destination, and
  -- guessing one is worse than stopping. Names them rather than reporting a count.
  select count(*), string_agg(distinct l.slug, ', ' order by l.slug)
    into v_bad, v_list
    from public.tag_aliases a
    join public.unified_tags l on l.id = a.canonical_tag_id and l.status = 'merged'
   where not exists (select 1 from _terminal te where te.start_id = l.id);
  if v_bad > 0 then
    raise exception 'alias tombstone sweep: % alias(es) sit on tombstone(s) with no active winner within 10 hops (%) — resolve the merge chain first',
      v_bad, v_list;
  end if;

  -- The trigger's own predicate, against the TERMINAL winner. Anything here would
  -- abort mid-sweep with a shadow error, so it stops before writing instead.
  select count(*) into v_bad
    from public.tag_aliases a
    join public.unified_tags l on l.id = a.canonical_tag_id and l.status = 'merged'
    join _terminal te on te.start_id = l.id
   where exists (select 1 from public.unified_tags u
                  where lower(u.slug) = lower(a.alias_slug)
                    and u.status = 'active' and u.id <> te.final_id);
  if v_bad > 0 then
    raise exception 'alias tombstone sweep: % alias(es) would shadow a live tag once re-parented — re-read before applying', v_bad;
  end if;

  select count(*) into v_orphans
    from public.tag_aliases a
    join public.unified_tags l on l.id = a.canonical_tag_id and l.status = 'merged';

  ------------------------------------------------- part A1: aliases that must go
  -- An alias equal to the winner's own name or slug carries nothing and violates
  -- an invariant the corpus already asserts. Synonyms are deleted FIRST: the FK
  -- is ON DELETE SET NULL, so a synonym row SURVIVES its alias and keeps
  -- rewriting — deleting the alias first orphans the rewrite instead of removing
  -- it. (Measured today the one row here has no synonym; the ordering is kept
  -- because the next run of this sweep may not be so lucky.)
  create temp table _drop as
  select a.id
    from public.tag_aliases a
    join public.unified_tags l on l.id = a.canonical_tag_id and l.status = 'merged'
    join _terminal te on te.start_id = l.id
    join public.unified_tags w on w.id = te.final_id
   where lower(a.alias_name) = lower(w.name)
      or lower(a.alias_slug) = lower(w.slug);

  delete from public.search_synonyms s using _drop d where s.tag_alias_id = d.id;
  get diagnostics v_synonyms = row_count;

  delete from public.tag_aliases a using _drop d where a.id = d.id;
  get diagnostics v_deleted = row_count;

  --------------------------------------------------- part A2: re-parent the rest
  update public.tag_aliases a
     set canonical_tag_id = te.final_id
    from public.unified_tags l, _terminal te
   where l.id = a.canonical_tag_id and l.status = 'merged' and te.start_id = l.id;
  get diagnostics v_reparent = row_count;

  if v_reparent + v_deleted <> v_orphans then
    raise exception 'alias tombstone sweep: accounted for % of % orphaned aliases (% re-parented, % deleted)',
      v_reparent + v_deleted, v_orphans, v_reparent, v_deleted;
  end if;

  ------------------------------------------- part B: synonym tag_id -> the winner
  -- Independent of part A on purpose: one of these rows has no tag_alias_id, so
  -- an alias-driven fix would leave it rewriting toward a tombstone forever.
  update public.search_synonyms s
     set tag_id = te.final_id
    from public.unified_tags l, _terminal te
   where l.id = s.tag_id and l.status = 'merged' and te.start_id = l.id;
  get diagnostics v_syn_tag = row_count;

  ------------------------------- part C: synonym replacements -> the winner's slug
  -- `replacements` is text, so this rewrites the SLUG rather than an id, and only
  -- the elements that name a merged tag. Case is preserved for everything else by
  -- rebuilding the array element-wise instead of replacing it wholesale.
  with fix as (
    select s.id,
           array_agg(coalesce(w.slug, rp) order by ord) as new_repl
      from public.search_synonyms s
      cross join lateral unnest(s.replacements) with ordinality as u(rp, ord)
      left join public.unified_tags t on lower(t.slug) = lower(u.rp) and t.status = 'merged'
      left join _terminal te on te.start_id = t.id
      left join public.unified_tags w on w.id = te.final_id
     where s.archived_at is null
       and s.tag_id is not null          -- tag pointer, not a multilingual expansion
       and exists (select 1 from unnest(s.replacements) r2
                   join public.unified_tags t2 on lower(t2.slug) = lower(r2)
                   where t2.status = 'merged')
     group by s.id
  )
  update public.search_synonyms s
     set replacements = f.new_repl
    from fix f
   where f.id = s.id and s.replacements is distinct from f.new_repl;
  get diagnostics v_syn_repl = row_count;

  ------------------------------------------------------------------ assertions
  -- The point of the sweep.
  select count(*) into v_bad
    from public.tag_aliases a join public.unified_tags t on t.id = a.canonical_tag_id
   where t.status = 'merged';
  if v_bad > 0 then
    raise exception 'alias tombstone sweep: % alias(es) still parented to a merged tag', v_bad;
  end if;

  select count(*) into v_bad
    from public.search_synonyms s join public.unified_tags t on t.id = s.tag_id
   where t.status = 'merged' and s.archived_at is null;
  if v_bad > 0 then
    raise exception 'alias tombstone sweep: % live synonym(s) still point at a merged tag', v_bad;
  end if;

  -- Same scope as the fix. A wider assertion would fail on the three multilingual
  -- rows this deliberately leaves alone; a wider FIX would pass it by breaking them.
  select count(*) into v_bad from public.search_synonyms s
   where s.archived_at is null and s.tag_id is not null
     and exists (select 1 from unnest(s.replacements) rp
                 join public.unified_tags t on lower(t.slug) = lower(rp)
                 where t.status = 'merged');
  if v_bad > 0 then
    raise exception 'alias tombstone sweep: % tag-derived synonym(s) still REWRITE toward a merged slug', v_bad;
  end if;

  -- Zero-invariants this sweep could plausibly have moved.
  select count(*) into v_bad from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where lower(a.alias_name) = lower(t.name);
  if v_bad > 0 then
    raise exception 'alias tombstone sweep: % alias(es) now equal their own tag name', v_bad;
  end if;

  select count(*) into v_bad from public.tag_aliases a
    join public.unified_tags t on lower(t.slug) = lower(a.alias_slug)
   where t.status = 'active' and t.id <> a.canonical_tag_id;
  if v_bad > 0 then
    raise exception 'alias tombstone sweep: % shadowing alias(es) exist — the sweep created one', v_bad;
  end if;

  -- A synonym whose alias was deleted must not survive as a dangling rewrite.
  select count(*) into v_bad from public.search_synonyms s
   where s.tag_alias_id is not null
     and not exists (select 1 from public.tag_aliases a where a.id = s.tag_alias_id);
  if v_bad > 0 then
    raise exception 'alias tombstone sweep: % synonym(s) reference a deleted alias', v_bad;
  end if;

  drop table _terminal;
  drop table _drop;

  raise notice 'alias tombstone sweep: % aliases re-parented, % deleted (% synonyms removed with them), % synonym tag_ids repointed, % synonym replacement lists rewritten',
    v_reparent, v_deleted, v_synonyms, v_syn_tag, v_syn_repl;
end
$mig$;
