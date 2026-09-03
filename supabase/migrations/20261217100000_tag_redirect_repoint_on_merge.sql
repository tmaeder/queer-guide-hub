-- A redirect whose TARGET is later merged away is never repointed, so the URL
-- dies one hop short of a canonical that exists.
--
-- WHAT BREAKS. `tag_slug_redirects` is old_slug -> tag_id. The merge trigger
-- `log_unified_tag_merge_redirect` mints a row for the merged tag's OWN slug
-- (old_slug = NEW.slug) and nothing else. A redirect that already pointed AT
-- that tag -- a rename trail, `m-nchen` -> `munchen` from the 2026-08-02
-- diacritic repair -- keeps pointing at it after the merge. The edge resolver
-- filters redirect targets on status=eq.active (functions/_lib/detail.ts,
-- entityFilter), correctly, so the row resolves to nothing:
--
--     /tags/m-nchen   404      tag_id -> munchen  (merged into munich, active)
--     /tags/b-hne     404      tag_id -> buhne    (merged into stage)
--     /tags/nonbin-r  404      tag_id -> nonbinar (merged into non-binary)
--
--   while the second hop is live and reachable:
--     /tags/munchen   301 -> /tags/munich        (measured on prod 2026-09-03)
--
-- 404 is the right answer for a RETIRED concept and the wrong answer here: the
-- concept was re-homed, not retired, and the redirect exists precisely to carry
-- the reader across that. `tag_hygiene_stats().redirect_to_non_canonical` counts
-- both shapes together, which is how these surfaced.
--
-- WHY 20260830011607 DID NOT ALREADY FIX THIS. That migration repaired the same
-- class and repaired the WRONG COLUMN: it sets `new_slug` and never `tag_id`.
-- Nothing reads `new_slug` -- not the edge resolver (which comments, in so many
-- words, that the id is durable and the denormalized slug is not), not
-- `resolve_tag_slug`, not the hygiene metric, which joins `t.id = r.tag_id`. Its
-- closing assertion joins `t.slug = r.new_slug` as well, so it verified the
-- column it had just written and could not see the one that matters. Both
-- columns are set below, and the assertions read `tag_id`.
--
-- THIS IS THE THIRD OCCURRENCE, and the first two were repaired as bare one-shot
-- statements that were never folded into a writer. 20260830011607 is one;
-- 20261027100000's step is the other, and its own header says it was written
-- predicate-scoped so it "also covers the next merge that forgets a redirect,
-- which is how this one happened". A one-shot cannot cover a future merge. The
-- fix below is in the TRIGGER, which is where 20260802111403 already put this
-- responsibility and for the reason it gives: there are several merge callers
-- (admin approval, the dedup sweep, the diacritic repair, a bare UPDATE) and
-- patching one leaves the rest.
--
-- SCOPE. Only redirects whose target chain terminates on an ACTIVE tag. The 57
-- rows pointing at a merely `deprecated` tag with no successor are deliberately
-- untouched, for the reason 20260830011607 gives: there is nowhere correct to
-- send them, and inventing a destination is worse than the 404. This takes
-- redirect_to_non_canonical 60 -> 57, all of the remainder being that cohort.
-- The counter is NOT re-baselined -- an improvement never fails the ratchet, and
-- ratcheting a documented oscillator onto a trough manufactures the next red.
--
-- MEASURED, not predicted: simulated against live prod rows on 2026-09-03 before
-- this was written -- 302 redirects in, exactly 3 repointed, 0 self-redirects
-- deleted, 0 created, 0 resolvable rows left behind, 60 -> 57.
--
-- TWO THINGS THE SIMULATION FOUND THAT THIS DELIBERATELY DOES NOT TOUCH.
--   * One redirect has a genuinely dangling tag_id: `jalape-o-poppers` ->
--     `jalapeno-poppers`, tag_id afc50973-…, and NEITHER slug exists in
--     unified_tags any more (both 404 on prod). It is invisible to the metric
--     and to the resolver, which both inner-join, so it is a tombstone with no
--     destination and 404 is the right answer. tag_terminal_canonical returns
--     NULL for it and every statement below skips it.
--   * Branch (a) still resolves a SINGLE hop, unchanged. Chain-following there
--     would also change what happens when the walk ends off-active, which is a
--     coverage decision, not this defect. merge_tag_concept() flattens the
--     canonical up front (20260802141407), so the single hop is correct for
--     every caller that goes through it.

-- ---------------------------------------------------------------------------
-- 1. One definition of "where does this tag actually live now", shared by the
--    repair and the trigger so the two cannot drift into disagreeing.
--    Cycle-safe and depth-capped, the idiom 20260802141407 established.
--    Returns NULL when the walk does not land on an active tag -- the caller
--    then leaves the row alone rather than inventing a destination.
-- ---------------------------------------------------------------------------
create or replace function public.tag_terminal_canonical(p_tag_id uuid)
returns uuid
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_id uuid := p_tag_id;
  v_status text;
  v_next uuid;
  v_hops int := 0;
begin
  loop
    select status, merged_into_id into v_status, v_next
      from public.unified_tags where id = v_id;
    if v_status is null then return null; end if;      -- no such row
    if v_status = 'active' then return v_id; end if;
    exit when v_next is null or v_next = v_id or v_hops >= 10;
    v_id := v_next;
    v_hops := v_hops + 1;
  end loop;
  return null;                                          -- terminated off-active
end;
$fn$;

comment on function public.tag_terminal_canonical(uuid) is
  'Walks merged_into_id to the terminal ACTIVE tag, or NULL if the chain ends on a deprecated/merged row. Shared by log_unified_tag_merge_redirect and the redirect repairs so producer and repair agree on one definition.';

-- ---------------------------------------------------------------------------
-- 2. Seal the producer. When a tag flips to merged, carry every redirect that
--    already pointed AT it across to the surviving concept -- not just the row
--    for the tag's own slug.
--
--    A trigger rather than a patch to merge_tag_concept(), for the reason this
--    trigger exists at all (20260802111403): there are several merge callers --
--    admin approval, the dedup sweep, the diacritic repair, a plain UPDATE --
--    and patching one leaves the rest. The seam is the status flip.
-- ---------------------------------------------------------------------------
create or replace function public.log_unified_tag_merge_redirect()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_target text;
  v_canon_id uuid;
  v_canon_slug text;
begin
  if NEW.status = 'merged' and NEW.merged_into_id is not null
     and (OLD.status is distinct from NEW.status
          or OLD.merged_into_id is distinct from NEW.merged_into_id) then

    -- (a) Unchanged: the merged tag's own slug keeps resolving.
    select slug into v_target from public.unified_tags where id = NEW.merged_into_id;
    if v_target is not null and v_target <> NEW.slug then
      insert into public.tag_slug_redirects (old_slug, new_slug, tag_id)
      values (NEW.slug, v_target, NEW.merged_into_id)
      -- DO UPDATE, not DO NOTHING: a slug can be merged, unmerged, then merged
      -- into a different canonical, and a stale row would route to the wrong tag.
      on conflict (old_slug) do update
        set new_slug = excluded.new_slug, tag_id = excluded.tag_id;
    end if;

    -- (b) NEW: rows that already pointed at this tag now point one hop short.
    --     Resolve the whole chain, not NEW.merged_into_id, because the canonical
    --     can itself be merged when the flip arrives from a bare UPDATE rather
    --     than through merge_tag_concept()'s up-front flattening.
    v_canon_id := public.tag_terminal_canonical(NEW.merged_into_id);
    if v_canon_id is not null then
      select slug into v_canon_slug from public.unified_tags where id = v_canon_id;

      -- A redirect FROM the canonical's own slug would become a self-redirect.
      -- The slug is canonical again, so the row has nothing left to do -- the
      -- disposition 20260830011607 settled for the same shape.
      delete from public.tag_slug_redirects
       where tag_id = NEW.id and old_slug = v_canon_slug;

      update public.tag_slug_redirects
         set tag_id = v_canon_id, new_slug = v_canon_slug
       where tag_id = NEW.id
         and old_slug <> v_canon_slug;
    end if;
  end if;
  return NEW;
end;
$fn$;

-- Trigger definition unchanged (after update of status, merged_into_id); the
-- function is replaced in place, so it is not re-created here.

-- ---------------------------------------------------------------------------
-- 3. Repair the rows already in that state, by the same walk.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_self int;
  v_moved int;
  v_left int;
  v_before int;
begin
  perform set_config('app.actor', 'admin:tag-redirect-repoint-on-merge', true);

  select count(*) into v_before
    from public.tag_slug_redirects r
    join public.unified_tags t on t.id = r.tag_id
   where t.status <> 'active' or t.merged_into_id is not null;

  -- Self-redirects first: the surviving canonical IS this row's old_slug.
  delete from public.tag_slug_redirects r
   using public.unified_tags c
   where c.id = public.tag_terminal_canonical(r.tag_id)
     and c.id is distinct from r.tag_id
     and c.slug = r.old_slug;
  get diagnostics v_self = row_count;

  update public.tag_slug_redirects r
     set tag_id = c.id, new_slug = c.slug
    from public.unified_tags c
   where c.id = public.tag_terminal_canonical(r.tag_id)
     and c.id is distinct from r.tag_id
     and c.slug <> r.old_slug;
  get diagnostics v_moved = row_count;

  -- Assertions. Read tag_id -- the column the edge and the metric read -- not
  -- new_slug, which is what let the previous repair pass while still broken.
  if exists (
    select 1 from public.tag_slug_redirects r
     where public.tag_terminal_canonical(r.tag_id) is not null
       and public.tag_terminal_canonical(r.tag_id) is distinct from r.tag_id
  ) then
    raise exception 'redirect repoint: a redirect still points one hop short of an active canonical';
  end if;

  if exists (select 1 from public.tag_slug_redirects where old_slug = new_slug) then
    raise exception 'redirect repoint: a self-redirect was created';
  end if;

  select count(*) into v_left
    from public.tag_slug_redirects r
    join public.unified_tags t on t.id = r.tag_id
   where t.status <> 'active' or t.merged_into_id is not null;

  -- Every survivor must be the deprecated-with-no-successor cohort, which is
  -- the one shape this migration deliberately does not touch.
  if exists (
    select 1 from public.tag_slug_redirects r
    join public.unified_tags t on t.id = r.tag_id
   where (t.status <> 'active' or t.merged_into_id is not null)
     and public.tag_terminal_canonical(r.tag_id) is not null
  ) then
    raise exception 'redirect repoint: a resolvable redirect was left behind';
  end if;

  raise notice 'redirect repoint: % self-redirect(s) deleted, % repointed; redirect_to_non_canonical % -> %',
    v_self, v_moved, v_before, v_left;
end
$mig$;
