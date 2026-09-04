-- marketplace-ingestion has failed every run since 2026-09-03 because its commit
-- batch does not fit the 8s statement timeout PostgREST imposes.
--
--   Node commit (pipeline-commit) failed: commit fn: canceling statement due to
--   statement timeout
--
-- ## The ceiling is 8 seconds, not 120
--
-- The cluster default `statement_timeout` is 120s, which is what you see from a
-- direct session and what makes this look impossible. But edge functions reach
-- the database through PostgREST, which connects as `authenticator` — and that
-- role carries `statement_timeout=8s` (`lock_timeout=8s` too). `service_role`
-- has no rolconfig of its own, so switching role does not lift it. Every RPC an
-- edge function makes gets 8 seconds.
--
-- ## The batch was over budget on average, and had been passing on luck
--
-- Measured on prod 2026-09-04 over 40 real staging rows, committed individually:
--
--   median 62 ms   mean 226 ms   max 1,496 ms
--
-- `pipeline-commit` defaults to `batch_size = 50` (`body.batch_size || 50`) and
-- `commitSimple` issues ONE RPC call with `p_limit = batchSize`; it does not
-- loop, and `pipeline-executor` does not re-run a node inside a run. So the
-- expected batch is 50 x 226 ms ~= 11.3 s against an 8 s ceiling — already over
-- budget on average. Whether a given night passed was decided by the row MIX,
-- not the row count: 2026-09-02 completed on 66 rows, 2026-09-03 failed on 60.
-- That is why it flipped with no code change on either side.
--
-- Reproduced under the real ceiling, and the replacement verified the same way:
--
--   batch 50  -> statement timeout
--   batch 25  -> 25 rows in 4,391 ms
--   batch 20  -> 20 rows in 2,947 ms   <- chosen
--
-- 20 leaves ~64% headroom, which the tail needs: per-row cost swings 62 ms to
-- 1,496 ms, so a batch weighted toward slow rows costs far more than the mean.
--
-- ## What the stack trace says, and what it does not
--
-- The cancel surfaces inside `marketplace_subcategory_fine` /
-- `marketplace_subcategory_group` via `marketplace_listings_derive_taxonomy()`,
-- which reads like the culprit. Measured: 1.4 ms and 0.3 ms per call — about 2 ms
-- of a 226 ms row. The trace names where the clock ran out, NOT what consumed
-- the time. Optimising those functions would have achieved nothing.
--
-- ## Why not just raise the timeout
--
-- A function cannot raise its own `statement_timeout`: the timer is armed when
-- the top-level statement starts, and assigning the GUC from inside a function
-- that is already executing does not re-arm it (measured 2026-08-19 — a
-- `set local statement_timeout='240s'` job still died at 120.004 s). An
-- `ALTER FUNCTION ... SET` applies at function entry, i.e. also after the
-- statement began, so it is the same no-op. Batch size is the lever that works.
--
-- ## Throughput
--
-- 20/run is below the busiest recent night (54 committed) but far above the
-- current state, which is ZERO — every run times out and commits nothing. If a
-- backlog appears, the durable fix is to make `pipeline-commit` loop small
-- batches under a wall-clock budget rather than raise this number back toward
-- the cliff. `adopt-orphans` already sweeps rows left by earlier runs.
--
-- Config MUST live under `data.config` — `pipeline-executor` reads
-- `node.data?.config` in both `handleBuiltInNode` and the payload builder, and a
-- top-level `config` key is silently ignored (same trap documented in
-- 20260806110000). The payload builder spreads `...nodeConfig` AFTER its
-- `batch_size` default, so this key wins.

update public.pipeline_definitions d
   set nodes = (
         select jsonb_agg(
                  case when n->>'id' = 'commit'
                       then jsonb_set(n, '{data,config,batch_size}', to_jsonb(20), true)
                       else n
                  end
                  order by ord)
           from jsonb_array_elements(d.nodes) with ordinality as t(n, ord)
       ),
       updated_at = now()
 where d.name = 'marketplace-ingestion';

do $$
declare v_batch jsonb; v_target text; v_nodes int;
begin
  select n->'data'->'config'->'batch_size', n->'data'->'config'->>'targetTable'
    into v_batch, v_target
    from public.pipeline_definitions d, lateral jsonb_array_elements(d.nodes) n
   where d.name = 'marketplace-ingestion' and n->>'id' = 'commit';

  if v_batch is null then
    raise exception 'commit node has no data.config.batch_size — the update did not land';
  end if;
  if v_batch::int <> 20 then
    raise exception 'commit node batch_size is %, expected 20', v_batch;
  end if;
  -- The existing key must survive: losing targetTable makes pipeline-commit fall
  -- back to detectTarget, and an unresolved target bails out committing nothing.
  if v_target is distinct from 'marketplace_listings' then
    raise exception 'commit node lost targetTable (now %)', coalesce(v_target,'<null>');
  end if;

  select count(*) into v_nodes
    from public.pipeline_definitions d, lateral jsonb_array_elements(d.nodes) n
   where d.name = 'marketplace-ingestion';
  if v_nodes < 10 then
    raise exception 'marketplace-ingestion has only % nodes — the jsonb_agg rebuild dropped some', v_nodes;
  end if;

  raise notice 'marketplace commit node: batch_size=20, targetTable=%, % nodes intact', v_target, v_nodes;
end $$;
