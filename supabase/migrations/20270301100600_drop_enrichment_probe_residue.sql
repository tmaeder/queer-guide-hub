-- The self-verifying probe in 20261220100000 left one row behind, and the row
-- it left is a MISATTRIBUTION — the exact class that migration exists to end.
--
-- Measured on prod after the deploy: the only `tag_change_log` row ever written
-- under actor 'llm:tag-enrichment-sweep' was
--
--   action_type = 'delete'
--   before_data->>'name' = 'Zz Enrichment Actor Probe'
--   created_at = 2026-09-04 09:24:53Z   (the migration's own timestamp)
--
-- i.e. anyone asking "what has the enrichment sweep written?" — the question
-- 20261220100000 was written to make answerable — got a phantom delete of a tag
-- that never really existed, and got it FIRST, before any real write.
--
-- Two causes, both worth stating because either alone is harmless:
--
--   1. The probe's cleanup is in the wrong order:
--
--        delete from tag_change_log where tag_id = v_id;   -- clears history
--        delete from unified_tags   where id     = v_id;   -- fires the audit
--                                                          -- trigger -> NEW row
--
--      The audit trigger on `unified_tags` writes its row AFTER the history has
--      already been cleared, so the delete audits itself into the table the
--      previous statement just emptied. Deleting the tag first and its log
--      second is all it takes.
--
--   2. The actor is inherited, not declared. The probe opens with
--      set_config('app.actor','migration:tag-enrichment-attributed-writer'),
--      but `tag_enrichment_apply` does its own set_config(...,true) on every
--      call, and transaction-local means it stays set for the REST of the
--      transaction. So the final DELETE is logged under the sweep's actor
--      rather than the migration's. A probe that calls an actor-declaring
--      function must re-declare its own actor afterwards.
--
-- `probe_leaked = 0` in that migration did not catch this because it counted
-- `unified_tags` only. A probe that cleans up after itself has to assert on
-- every table it wrote to, including the ones it wrote to to prove a point.
--
-- The applied file is deliberately NOT edited: it ran, its checksum is history,
-- and a rebuild-from-zero would re-create this row — which is why the delete
-- below is keyed on the shape rather than on a frozen id, so it is correct in
-- both a live database and a rebuilt one, and a no-op once clean.

do $$
declare v_deleted integer;
begin
  -- Not the sweep's actor: this cleanup is a migration and says so, which is
  -- the whole point of the entry being removed.
  perform set_config('app.actor', 'migration:drop-enrichment-probe-residue', true);

  delete from tag_change_log
   where actor = 'llm:tag-enrichment-sweep'
     and action_type = 'delete'
     and before_data->>'slug' = 'zz-enrichment-actor-probe'
     -- Only rows whose tag is really gone. A live tag with this slug would be
     -- someone's in-flight probe, not residue, and must not be touched.
     and not exists (select 1 from unified_tags t where t.id = tag_change_log.tag_id);
  get diagnostics v_deleted = row_count;

  raise notice 'probe residue rows removed: %', v_deleted;

  -- The sweep's audit trail must now contain only real content writes. A
  -- surviving 'delete' under that actor means either the probe ran again or a
  -- new writer adopted the actor; both need a human, not a silent pass.
  if exists (
    select 1 from tag_change_log
     where actor = 'llm:tag-enrichment-sweep' and action_type = 'delete'
  ) then
    raise exception 'tag-enrichment-sweep still has a delete row in tag_change_log';
  end if;
end $$;
