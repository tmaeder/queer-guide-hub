# Facts-only source outcomes

The user requests automatic correction/enrichment/cleanup and fewer than 100 pending items across all queues. The largest evidenced mismatch is that the business-quality producer demands prose, contacts and media from identities minted from a facts-only source.

`source-gays-cruising` deliberately collects only identity/location facts and a backlink. Its `CruisingSpot` type excludes source prose, and the importer documents that boundary. Treating every absent description/contact/image as a staff decision generates roughly 161,000 repeated findings without a supported action.

The chosen correction records an explicit `source_unavailable` outcome, retaining the source references and actual quality gap. It does not create prose, collect excluded source material, award a passing quality state, change publication or safety, or merge identities. It applies only to an automatically minted, sole-location venue identity whose canonical venue is cruising, whose name/geography agree and whose only registered source is the facts-only importer. Existing supplied values continue to pass. Supplied raw extra facts, another source, another role, multiple locations or identity conflicts exclude the outcome.

The ordinary quality refresh evaluates this scope from live inputs rather than preserving a waiver. A new/changed registered source invalidates the quality-check cursor so ordinary enrichment/review resumes. A bounded, service-only reconciliation records previous/new finding states in the existing quality event log and updates profile dimensions without falsifying verification timestamps.

A UI-only filter would leave the false producer intact; inventing content to satisfy completeness would introduce unsupported claims. Both are rejected. The unavailable state remains visible in diagnostics and does not improve the score as a pass.

Validate with isolated PostgreSQL fixtures, then a rolled-back production-schema regression, a production dry run, bounded applied passes and an idempotency check. Apply only after the coordinated production schema freeze is lifted. The all-queue goal remains active until its complete total is independently below 100.

## Per-source dimensions

Follow-up migration `20261021203842_source_specific_business_quality_limits.sql` makes applicability dimension-specific. The GayOut venue importer explicitly excludes reviews, ratings, photos and editorial descriptions. Its normalized payload can carry phone facts, so only editorial and media are unavailable. Planet Randy's `toNormalizedVenue` emits identity, location, contacts and provenance; its `source_image_url` is an unlicensed reference, not approved reusable media. It also receives only editorial/media outcomes. Contact gaps stay open for both.

The actual import contracts were inspected read-only in the existing main checkout, not modified or copied into this branch:

- `repo/scripts/data-quality/import-gayout.mjs`, SHA-256 `c835b2925728f1f4e57dc6a0ccc7df9bcdf7cea981ba6d9347a165c1ceb566db`: header expressly excludes descriptions/photos.
- `repo/scripts/data-quality/lib/gayout-import-core.mjs`, SHA-256 `24f948da785d84a79eb4c0f5af906ea26af3687e09d4d2a33490753dbd41e801`: normalized identity/location/phone payload, source slug, section and original URL.
- `repo/scripts/data-quality/lib/planet-randy-import-core.mjs`, SHA-256 `3c7e555eef53dc407d32f2b783a4582fb8821224805a58e470cf4efa9c409d99`: normalized identity/location/phone/website payload and source image reference in metadata only.

The newer source contracts require their actual structured metadata, exact source name and original source URL hostname. A legacy CSV source label is insufficient. Supplied raw/normalized/enriched prose/media exclude the outcome; passing current content stays a pass. Gays-Cruising retains its original three dimensions and now also rejects unexpected nested contact facts.

Additional isolated fixtures prove source-specific outcomes, contact preservation, conflicting/multiple source exclusion, raw supplied prose/media exclusion, hostname/name guards, idempotency despite remaining contact gaps, audit completeness and source invalidation. Production dry run for 50 identities reports exactly 100 eligible outcomes.
