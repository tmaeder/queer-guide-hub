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
- [ ] Implement shared cleanup, summary selection and podcast-aware AI input.
- [ ] Implement derived fields, guarded bulk updates and recurring worker.
- [ ] Implement summary-first podcast detail UI and translations.
- [ ] Validate and backfill existing podcasts; verify future import handling.
