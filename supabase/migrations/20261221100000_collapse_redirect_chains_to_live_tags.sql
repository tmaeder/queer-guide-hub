-- Collapse tag_slug_redirects whose target was itself later merged away.
--
-- Found by an end-to-end probe of production, not by SQL: /tags/b-hne,
-- /tags/m-nchen and /tags/nonbin-r all return 404 with noindex, and all three
-- served a live page before the tag language work. Every database-side check
-- was green — the redirect rows exist and point somewhere real — because the
-- defect is in the SECOND hop.
--
-- HOW THE CHAIN FORMED. Two correct changes composed into a broken URL:
--
--   20261211120000  repaired the lossy slug   b-hne  -> buhne   (redirect minted)
--   20261211120100  merged the German tag     buhne  -> stage   (redirect minted)
--
-- so the live chain is b-hne -> buhne -> stage. `resolve_tag_slug` and the edge
-- lookup follow ONE hop and require the target to be active (PR #2828, which
-- made a redirect-into-404 return a clean 404 instead). `buhne` is `merged`, so
-- the first hop is filtered and the URL 404s even though `stage` is live and one
-- hop further on.
--
-- WHY REPOINT THE DATA RATHER THAN TEACH THE RESOLVER TO FOLLOW CHAINS. The
-- resolver's one-hop-and-active rule is deliberate and is what stops a redirect
-- landing on a dead page; changing it touches every tag URL on the site to fix
-- three. A redirect row is supposed to name the slug that is live NOW, so a
-- stale target is a data defect, and repointing keeps the shared read path
-- untouched.
--
-- WRITTEN AS THE CLASS, NOT AS THREE SLUGS. Any future repair-then-merge makes
-- the same shape, and the recursive resolve is the same length either way.
--
-- DELIBERATELY NARROW. It only repoints a redirect whose target is `merged` and
-- whose chain ends on an ACTIVE tag. The other 58 non-active targets on prod
-- are the pre-existing accent-folding pairs (alex-j-rgen -> alex-jurgen, …)
-- aimed at DEPRECATED tags with no onward hop: a deprecated tag has no live page
-- to reach, so those must keep returning a clean 404 rather than be repointed
-- anywhere. Touching them is how this migration would turn a documented,
-- correct 404 into a wrong redirect.

do $$
declare
  v_n int;
begin
  perform set_config('app.actor', 'admin:collapse-redirect-chains', false);

  create temp table _chain on commit drop as
  with recursive walk(old_slug, cur_id, cur_slug, cur_status, depth) as (
    select r.old_slug, t.id, t.slug, t.status, 0
      from public.tag_slug_redirects r
      join public.unified_tags t on t.slug = r.new_slug
     where t.status = 'merged' and t.merged_into_id is not null
    union all
    select w.old_slug, m.id, m.slug, m.status, w.depth + 1
      from walk w
      join public.unified_tags t on t.id = w.cur_id
      join public.unified_tags m on m.id = t.merged_into_id
     where w.cur_status = 'merged' and w.depth < 8   -- cycle/runaway stop
  )
  select old_slug, cur_slug as final_slug
    from walk
   where cur_status = 'active';

  select count(*) into v_n from _chain;

  -- Measured at 3 immediately before writing this (b-hne, m-nchen, nonbin-r).
  -- A large number would mean redirect chains are forming routinely, which is a
  -- different problem than three rows and should stop for a human.
  if v_n > 25 then
    raise exception 'redirect chains: % rows resolve through a merged target — investigate before repointing', v_n;
  end if;

  update public.tag_slug_redirects r
     set new_slug = c.final_slug
    from _chain c
   where r.old_slug = c.old_slug
     and r.new_slug is distinct from c.final_slug;

  -- No redirect may still point at a merged tag that has a live canonical.
  -- Redirects onto DEPRECATED targets are untouched and expected to remain.
  if exists (
    select 1 from public.tag_slug_redirects r
      join public.unified_tags t on t.slug = r.new_slug
     where t.status = 'merged' and t.merged_into_id is not null
  ) then
    raise exception 'redirect chains: a redirect still targets a merged tag';
  end if;

  raise notice 'redirect chains: repointed % redirect(s) to their live canonical', v_n;
end $$;
