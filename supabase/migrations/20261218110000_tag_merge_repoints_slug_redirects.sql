-- Tag merges leave their inbound slug redirects pointing at the retired row.
--
-- `log_unified_tag_merge_redirect()` (20260802111403) mints ONE redirect when a
-- tag is merged: the duplicate's own slug -> the canonical, with tag_id set to
-- the canonical. That is correct and stays. What it never did is repoint the
-- redirects that ALREADY pointed at the duplicate.
--
-- Measured on prod 2026-09-03: three such rows, all from the German
-- diacritic-repair cohort. `m-nchen` was minted when `München`'s lossy slug was
-- repaired to `munchen`; `munchen` was then merged into `munich`, and the
-- `m-nchen` row kept tag_id = munchen. Same shape for `nonbin-r` -> `nonbinar`
-- (-> `non-binary`) and `b-hne` -> `buhne` (-> `stage`).
--
-- Why this matters even though nothing is publicly broken: the edge filters
-- redirect targets on `status = 'active'` (functions/_lib/detail.ts, and
-- resolve_tag_slug() joins the same condition), which is load-bearing — it turns
-- what would be a 301-into-404 into a clean one-hop 404. So the rows are inert,
-- not harmful. But inert is not the job: /tags/m-nchen SHOULD land on
-- /tags/munich, and today it 404s. Every future merge of a tag that carries
-- redirects adds another one.
--
-- This is deliberately NOT re-gating anything. `redirect_to_non_canonical` was
-- demoted to advisory in #3344 because it oscillates (reviving a deprecated tag
-- re-mints its redirects), and that reasoning is sound — a level counter is the
-- wrong instrument. This migration removes a CAUSE of the movement; it does not
-- ask for the gate back.

-- 1) Terminal canonical resolver. Merges can chain (A -> B -> C): merge_tag_concept
--    walks the canonical to its terminal before writing, but nothing forces other
--    writers to, and the backfill below has to cope with chains already in the data.
--    Bounded at 10 hops for the same reason merge_tag_concept bounds its loop —
--    a cycle must not spin forever.
create or replace function public.tag_terminal_canonical(p_id uuid)
returns uuid
language plpgsql
stable
set search_path = public
as $fn$
declare v_id uuid := p_id; v_next uuid; v_hops int := 0;
begin
  while v_hops < 10 loop
    select merged_into_id into v_next
      from public.unified_tags
     where id = v_id and status = 'merged' and merged_into_id is not null;
    exit when v_next is null;
    v_id := v_next;
    v_hops := v_hops + 1;
  end loop;
  return v_id;
end $fn$;

comment on function public.tag_terminal_canonical(uuid) is
  'Follows unified_tags.merged_into_id to the terminal row (max 10 hops). Returns the input id when it is not merged.';

-- 2) The trigger now also repoints inbound redirects at the terminal canonical.
create or replace function public.log_unified_tag_merge_redirect()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare v_target text; v_terminal uuid;
begin
  if NEW.status = 'merged' and NEW.merged_into_id is not null
     and (OLD.status is distinct from NEW.status
          or OLD.merged_into_id is distinct from NEW.merged_into_id) then

    v_terminal := public.tag_terminal_canonical(NEW.merged_into_id);
    select slug into v_target from public.unified_tags
     where id = v_terminal and status = 'active';

    if v_target is not null and v_target <> NEW.slug then
      -- unchanged: mint the duplicate's own slug -> canonical
      insert into public.tag_slug_redirects (old_slug, new_slug, tag_id)
      values (NEW.slug, v_target, v_terminal)
      on conflict (old_slug) do update
        set new_slug = excluded.new_slug, tag_id = excluded.tag_id;

      -- NEW: carry the redirects that pointed at this row forward to the
      -- canonical, so they keep resolving instead of going inert. The
      -- old_slug <> v_target guard prevents minting a self-redirect.
      update public.tag_slug_redirects
         set new_slug = v_target, tag_id = v_terminal
       where tag_id = NEW.id
         and old_slug <> v_target;
    end if;
  end if;
  return NEW;
end $fn$;

-- 3) Backfill the rows already stranded by past merges.
update public.tag_slug_redirects r
   set tag_id = c.id, new_slug = c.slug
  from public.unified_tags d
  join public.unified_tags c
    on c.id = public.tag_terminal_canonical(d.merged_into_id)
 where r.tag_id = d.id
   and d.status = 'merged'
   and d.merged_into_id is not null
   and c.status = 'active'
   and r.old_slug <> c.slug;

-- 4) Postcondition. Deprecated-but-unmerged rows are NOT in scope here — those
--    are the ~58-row retired-concept residue that correctly resolves to a 404
--    and has no canonical to point at. Only the merged cohort is fixable.
do $do$
declare v_stranded int;
begin
  select count(*) into v_stranded
    from public.tag_slug_redirects r
    join public.unified_tags d on d.id = r.tag_id
   where d.status = 'merged' and d.merged_into_id is not null
     and exists (select 1 from public.unified_tags c
                  where c.id = public.tag_terminal_canonical(d.merged_into_id)
                    and c.status = 'active' and c.slug <> r.old_slug);
  if v_stranded > 0 then
    raise exception 'tag_slug_redirects: % row(s) still point at a merged tag with a live canonical', v_stranded;
  end if;
  raise notice 'tag merge redirects: no rows left pointing at a merged tag with a live canonical';
end $do$;
