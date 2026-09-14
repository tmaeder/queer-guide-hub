-- The sentinel 50400101100100 promised and did not ship.
--
-- That migration's header says the merge-target invariant "is added as a
-- reported signal rather than left to the next person who trips over it". It
-- was not: the file repairs seven rows and asserts its own postconditions, and
-- nothing watches the corpus afterwards. This is precisely the failure that
-- file's own sibling (50400101100200) was written to avoid — a change that
-- reports success while being wired to nothing — so it is corrected here rather
-- than left as a comment that outlived its truth.
--
-- THE INVARIANT: a merge mints a redirect from the loser's slug to the winner's
-- page, so a winner that is not ACTIVE is a redirect to a page that does not
-- render. Measured before the repair: of 289 merges, 8 pointed at a deprecated
-- row and 5 at another merged row. Found by following one term (`hpv`), which
-- is the argument for a counter rather than another hand-audit.
--
-- IT IS A STANDALONE RPC, NOT A KEY ON `tag_hygiene_stats()`. That body is 210
-- lines and restating it to add a counter is a merge-collision surface — the
-- reason `glossary_link_signals`, `news_image_signals`, `event_dup_signals` and
-- `venue_dup_signals` are all separate functions.
--
-- NOTHING EXISTING COVERS THIS, which was checked rather than assumed. The two
-- nearby metrics on `tag_hygiene_stats()` measure different things:
--
--   redirect_to_non_canonical   reads `tag_slug_redirects`, i.e. the REDIRECT
--                               TABLE, not the merge graph on `unified_tags`.
--   merged_but_not_status_merged  reads the LOSER's own status, never the
--                               target's.
--
-- WHY THE SPLIT INTO FOUR COUNTS RATHER THAN ONE. `target_merged`,
-- `target_missing` and `self_merged` are structural: a chain, a dangling uuid
-- and a row that redirects to itself are never correct, they are driven to zero
-- by 50400101100100, and they gate. `target_deprecated` is an editorial state —
-- someone deprecated a row that happens to be a merge target — and it stands at
-- SIX by design, each one named in 50400101100100's header because each needs a
-- decision on a row outside that pass's subject. Collapsing the four into one
-- number would make the gate red on arrival, which is the cry-wolf shape this
-- repo removed once already from the dedup backlog rule.
--
-- `merges_total` is reported for the reason `glossary_link_signals` reports its
-- coverage counts: a probe that returns four zeroes because the corpus has no
-- merges at all must not read as a clean merge graph.

set local statement_timeout = '600s';

create or replace function public.tag_merge_graph_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with m as (
    select t.id, t.slug, t.merged_into_id, w.id as target_id, w.status as target_status
      from public.unified_tags t
      left join public.unified_tags w on w.id = t.merged_into_id
     where t.merged_into_id is not null
  )
  select jsonb_build_object(
    -- Coverage first, so four zeroes from an empty corpus cannot be read as a
    -- clean merge graph.
    'merges_total', (select count(*) from m),

    -- Editorial, and non-zero BY DESIGN: six targets are deprecated rows that
    -- each need their own decision (named in 50400101100100). Warns.
    'target_deprecated', (select count(*) from m where target_status = 'deprecated'),

    -- Structural, all three zero-invariants after 50400101100100.
    'target_merged',  (select count(*) from m where target_status = 'merged'),
    'target_missing', (select count(*) from m where target_id is null),
    'self_merged',    (select count(*) from m where target_id = id),

    -- Named residue, so the warn count can be read without a second query and
    -- a NEW deprecated target is distinguishable from the six known ones.
    'deprecated_examples', (
      select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
        from (select slug || ' -> ' || (select w.slug from public.unified_tags w where w.id = m.merged_into_id) as x
                from m where target_status = 'deprecated' limit 20) s(x))
  );
$$;

comment on function public.tag_merge_graph_signals() is
  'Merge-graph integrity for unified_tags. A merge mints a redirect, so a target that is not active is a redirect to a page that does not render. target_merged/target_missing/self_merged are zero-invariants; target_deprecated is editorial and non-zero by design. See 50400101100100 and 50400101100300.';

revoke all on function public.tag_merge_graph_signals() from public;
grant execute on function public.tag_merge_graph_signals() to service_role;

do $verify$
declare
  v jsonb;
begin
  -- The function must actually answer, and must agree with a direct count —
  -- a sentinel first exercised in CI on real drift is not a sentinel.
  select public.tag_merge_graph_signals() into v;
  if v is null then
    raise exception 'verify: tag_merge_graph_signals() returned null';
  end if;
  if (v->>'merges_total')::int <> (select count(*) from public.unified_tags where merged_into_id is not null) then
    raise exception 'verify: merges_total disagrees with a direct count';
  end if;
  if (v->>'target_merged')::int <> 0 then
    raise exception 'verify: % merge chain(s) still point at a merged row', v->>'target_merged';
  end if;
  if (v->>'target_missing')::int <> 0 or (v->>'self_merged')::int <> 0 then
    raise exception 'verify: dangling or self-referential merge target';
  end if;
end $verify$;
