-- Index ingestion_events (stage, created_at), so the marketplace-relevance
-- daily-cap count and the nightly purge stop scanning the whole table.
--
-- marketplace-relevance enforces its LLM daily cap with
--   select count(*) from ingestion_events
--   where stage = 'relevance' and created_at >= <start of UTC day>
-- (PostgREST head=true, count=exact). No index covered stage or created_at,
-- so every call was a sequential scan of ~640k rows / 191 MB: 777 calls
-- averaged 4,457 ms and peaked at 7,937 ms on 2026-10-31, against the 8s
-- statement_timeout pinned on the authenticator role. That is the
-- "ingestion_events select" timeout in the logs; no admin surface issues it.
--
-- run_ingestion_events_purge() filters on the same pair
-- (stage IN (deduplicate, validate, normalize) AND created_at < now()-30d) in
-- both its count and its batched delete, and averaged 2.3 s.
--
-- Measured in a rolled-back transaction on prod: the daily-cap count went from
-- 1,601 ms (seq scan) to 0.7 ms (index-only scan), the purge's batch select to
-- 1.7 ms; the index is 16 MB and built in 1.2 s. Results cannot change: the
-- index matches the predicates and no query text changes.
--
-- No CONCURRENTLY (migrations run in a transaction). CREATE INDEX takes a SHARE
-- lock that blocks inserts into ingestion_events (~30k/day, from the pipeline
-- stages) for the ~1 s the build takes; lock_timeout makes the migration fail
-- rather than queue behind a long write and stall every inserter behind it.

set local lock_timeout = '10s';

create index if not exists idx_ingestion_events_stage_created_at
  on public.ingestion_events (stage, created_at);
