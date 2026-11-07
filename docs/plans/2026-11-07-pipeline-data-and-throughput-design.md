# Ingestion data quality and throughput follow-ups

Approved on 2026-11-07 after the reliability pilot in PR #5123.

## Historical timeline source

A seven-day production sample found 654 Equaldex timeline rows rejected by
news validation for missing source identity. The rows shared 119 region-page
URLs and none had a publication date in the sample window. The scraper already
knows this source is a historical timeline. Adding a source ID would leave the
article identity problem in place. A historical import would require its own
record and editorial rules.

Keep this source available for dry-run inspection and skip its automated news
staging in the shared source-processing path. Report the reason and record
the scheduled attempt so the source does not consume a slot on every tick.
Use existing news validation for other sources and leave past rows for audit.

## Faster pilot handoffs

Read-only production timing showed median handoffs of 55–58 seconds across four
ingestion pipelines, consistent with the existing minute-based dispatcher.
Speeding up stage code does little for that gap. Faster global polling raises
background load even when the queue is idle.

For explicitly enabled reliable tags runs, reserve bounded, best-effort
wake-ups after the database confirms the queue writes. The Edge Function
invokes the same executor for those step IDs. Keep pgmq and the minute-based
dispatcher as the durable path. Reuse the step claim to arbitrate duplicate
or competing deliveries. Preserve the existing retry delays and only issue
one fast wake per step. Compare p50 and p95 predecessor-to-successor delay
against the scheduled path and check dispatch errors, duplicate claims, and
queue backlog before broadening the pilot.
