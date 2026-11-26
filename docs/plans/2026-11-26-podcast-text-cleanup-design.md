# Podcast text cleanup and short summaries

Approved by the user on 2026-11-26: implement cleanup and short summaries for existing podcasts and future imports; transcripts are deferred.

## Reader experience

Podcast pages show the audio player, a short episode overview, and cleaned show notes behind a native disclosure. The overview explicitly identifies show notes as its source. News cards use the short overview. Ordinary news articles keep their current behavior. Source attribution and the original publisher link remain available.

## Processing

Preserve publisher content verbatim in `content`. Derive separate podcast show notes and a concise summary; never invent episode details or imply the audio has been transcribed. Clean HTML/entities, paragraph spacing, tracking URLs, repetitive promotional calls to action, social/hashtag blocks and duplicate lines conservatively, retaining episode topics, timestamps, guest names, content warnings and useful resource labels.

Use the existing budgeted news AI enrichment stage with podcast-specific instructions and cleaned notes for future imports. Reuse an existing AI summary only when usable and record the method. Otherwise use a short extract of cleaned notes; thin/empty descriptions get an honest empty state. No paid bulk AI transcription or summary run is required for the roughly 19,500-row archive.

A bounded, authenticated worker derives text for both the archive and new imports. A private trigger marks podcast text pending when source content/title changes; a partial index supports the pending scan. Updates compare source hashes to avoid overwriting concurrent edits. Derived text never changes publication eligibility, audio URLs, content hashes or the publisher content. A service-only bulk RPC avoids per-row network overhead and updates the existing excerpt so list RPCs need no signature changes. A recurring cron drains new arrivals and the initial archive is drained in this task.

## Validation

- Regression tests using observed clutter: promotional tails, interleaved ads, list descriptions, paragraph loss, duplicate text, multilingual notes, sparse descriptions, timestamps and meaningful sponsorship reporting.
- Worker authentication, batch limits, idempotence and concurrent-edit SQL checks.
- Component tests for summary, source label, native disclosure and empty state.
- Typecheck, focused lint, edge checks, build and desktop/mobile visual inspection.
- Verify production archive coverage, representative before/after text, cron configuration and restricted RPC grants after applying the migration and worker.

## Work checklist

- [x] Inspect ingestion, detail rendering and stored examples.
- [x] Confirm scope and obtain approval.
- [x] Implement shared cleanup, summary selection and podcast-aware AI input.
- [x] Implement derived fields, guarded bulk updates and recurring worker.
- [x] Implement summary-first podcast detail UI and translations.
- [x] Validate and backfill existing podcasts; verify future import handling.

## Prevention and production verification

The follow-up request to prevent recurrence is implemented with a 15-minute SQL health sentinel and the existing nightly pipeline health script. Disabled cleanup or a queue older than 30 minutes opens a pipeline health incident; recovery resolves it. Source edits requeue their presentation text, and repeated imports cannot restore promotional excerpts. A parser regression test verifies clean overviews before the recurring worker runs.

Production verification on 2026-11-26:

- 19,489 podcast rows processed; 0 pending.
- 19,279 short overviews; 210 descriptions too sparse for an overview.
- Maximum summary length: 420 characters. Feed excerpt mismatches: 0.
- All 40 sampled publisher bodies remain byte-for-byte identical to the pre-backfill snapshot.
- Cleanup every five minutes and health sentinel every fifteen minutes are enabled; no open cleanup incidents.
- Transactional SQL tests pass for stale-write rejection, idempotence, preservation of source/publication/audio fields, source-edit invalidation, repeated-import protection, stalled-queue incidents, recovery, and a disabled scheduler.
- 65 focused Deno tests and 61 frontend/helper tests pass; edge checks and focused lint pass. Production build and bundle shape pass. Typecheck reports no new errors against the existing baseline.
- Desktop and 390px mobile browser checks confirm the source label, readable overview and native show-notes disclosure.
- Security advisors report no podcast-related findings.

The production schema migrations and source-rss-news, pipeline-enrich-news and pipeline-podcast-text edge functions are deployed. Frontend rollout follows the PR's required checks. Mobile CI's unrelated Expo patch-version drift is outside this change.
