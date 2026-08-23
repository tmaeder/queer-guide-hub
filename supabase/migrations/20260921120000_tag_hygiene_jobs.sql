-- Tag DQ — wire up the two Phase 2/3 jobs, and run them once.
--
-- 20260921100000 and 20260921110000 shipped run_tag_image_provenance_sync() and
-- run_tag_thin_page_reindex() as FUNCTIONS WITH NO CALLER. Verified on prod
-- after they applied: both functions present, and 869 thin pages still indexed,
-- 4 Commons images still unlicensed. Nothing had changed.
--
-- That is the exact failure this codebase has hit before — resolve_tag_slug()
-- sat anon-granted with zero callers from 2026-08-02 until PR #2828 found it,
-- while 144 merged tags soft-404'd the whole time. A function is not a fix
-- until something calls it.
--
-- Registry row FIRST in both cases: admin_automations is the record of record,
-- and sync_automations_to_cron() recreates any enabled row whose job is
-- missing. Retiring either of these means disabling the row, never deleting it.

-- ---------------------------------------------------------------------------
-- Thin-page reindex. Daily, because it is the sweep that keeps a newly-created
-- description-less tag out of sitemap-tags.xml, and new tags arrive daily from
-- the profession pipeline.
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('tag_thin_page_reindex', 'Tag thin-page reindex',
        'Daily: deindexes active tags with no description (thin pages advertised in sitemap-tags.xml) and re-indexes them once they gain prose. Mirrors the city-stub treatment in 20260821051221; never reverses a sensitivity deindex.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"run_tag_thin_page_reindex"}'::jsonb, '20 4 * * *')
on conflict (slug) do update set schedule = excluded.schedule, enabled = excluded.enabled,
  description = excluded.description, name = excluded.name, action = excluded.action,
  trigger = excluded.trigger;

select cron.schedule('tag_thin_page_reindex', '20 4 * * *',
  $cron$ select public.run_tag_thin_page_reindex(400); $cron$);

-- ---------------------------------------------------------------------------
-- Commons provenance. Weekly is the right resolution: the population only
-- changes when someone adds a Commons-hosted tag image, and the upstream
-- licenses change on the order of never.
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('tag_image_provenance_sync', 'Tag image provenance',
        'Weekly: recovers license/attribution/source/alt for tag images hosted on Wikimedia Commons via the imageinfo API. Self-hosted images are out of scope — their provenance was never captured and cannot be recovered (see 20260921100000).',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"run_tag_image_provenance_sync"}'::jsonb, '40 5 * * 2')
on conflict (slug) do update set schedule = excluded.schedule, enabled = excluded.enabled,
  description = excluded.description, name = excluded.name, action = excluded.action,
  trigger = excluded.trigger;

select cron.schedule('tag_image_provenance_sync', '40 5 * * 2',
  $cron$ select public.run_tag_image_provenance_sync(200); $cron$);

-- ---------------------------------------------------------------------------
-- Initial sweeps. Without these the first thin-page deindex waits until 04:20
-- tomorrow and the first provenance pass until Tuesday, leaving 869 thin pages
-- advertised in the sitemap in the meantime.
--
-- Batched at 400 per call for the reindex: unified_tags carries an unscoped
-- audit trigger plus a column-scoped search trigger, and the 869 backlog needs
-- three passes rather than one 869-row statement.
do $$
declare r record; i int := 0; v_off int := 0; v_on int := 0;
begin
  loop
    i := i + 1;
    select * into r from public.run_tag_thin_page_reindex(400);
    v_off := v_off + r.deindexed; v_on := v_on + r.reindexed;
    exit when (r.deindexed = 0 and r.reindexed = 0) or i >= 8;
  end loop;
  raise notice 'initial thin-page sweep: % deindexed, % reindexed over % pass(es)', v_off, v_on, i;
end $$;

do $$
declare r record;
begin
  select * into r from public.run_tag_image_provenance_sync(400);
  raise notice 'initial commons provenance: considered=% updated=% api_errors=% unmatched=%',
    r.considered, r.updated, r.api_errors, r.unmatched;
end $$;
