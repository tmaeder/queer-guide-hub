# Automated event gap closure

Approved by the user on 2026-10-16.

## Evidence

Production contains 64,748 canonical events. Active events that have not ended
have 1,484 open missing/thin description findings, 199 missing-image findings,
and 709 stale verification findings. Future-start events alone are a misleading
subset: ongoing exhibitions and programmes also need coverage.

In seven days the agentic worker recorded 414 done and 111 skipped attempts.
183 of 356 high-confidence applied signals changed no content fields. The image
backfill is weekly, selects newest dates first, and has no durable miss cooldown.
The content worker uses optional audience/accessibility gaps as its only selector,
processes sequentially, and ignores event update errors.

## Decision

Improve the existing workers with a shared database gap queue. Increasing cron
frequency alone repeats wasted requests. A separate orchestration service adds
operational overhead without improving evidence quality.

Use independent content and image lanes, durable per-event leases, atomic claims,
near-term/ongoing priority, bounded concurrency, and a hard daily AI budget.
Reuse attributable raw source descriptions before fetching or invoking AI.
Fallback to event-specific source and ticket pages. Fill only genuinely missing
fields (thin descriptions may be expanded); retain provenance and previous values.
Replace defective images only after validating source artwork and checking that
another editor has not changed the original images. Never infer dates, locations,
accessibility or audience policy from absence of evidence.

Persist outcomes and actual fields filled. No-change and failed attempts back off
exponentially; changed input reopens work. Expired leases recover automatically.
Successful writes and queue completion commit together and invalidate the quality
snapshot so the existing scanner reconciles issues. No blanket issue acceptance.

## Operations

Run the existing content worker every 15 minutes and image worker hourly, with
small batches and three concurrent tasks. Keep the AI ledger's existing daily cap.
Expose source-level yield, retry state and backlog through a service-only metrics
RPC. Keep existing geographical, venue-link and liveness jobs; do not equate content
extraction with liveness verification. Add regression tests for leases, cooldown,
claim ordering, fill-only writes, stale results, source evidence and zero-field yield.

## Release

Deploy database contracts before worker code, then update existing schedules.
Verify dry runs, bounded real batches, security advisors, query plans, metrics and
production rescan. Commit implementation and create a reviewable pull request.
