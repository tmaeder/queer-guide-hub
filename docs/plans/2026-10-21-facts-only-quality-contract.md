# Facts-only source outcomes

The user requests automatic correction/enrichment/cleanup and fewer than 100 pending items across all queues. The largest evidenced mismatch is that the business-quality producer demands prose, contacts and media from identities minted from a facts-only source.

`source-gays-cruising` deliberately collects only identity/location facts and a backlink. Its `CruisingSpot` type excludes source prose, and the importer documents that boundary. Treating every absent description/contact/image as a staff decision generates roughly 161,000 repeated findings without a supported action.

The chosen correction records an explicit `source_unavailable` outcome, retaining the source references and actual quality gap. It does not create prose, collect excluded source material, award a passing quality state, change publication or safety, or merge identities. It applies only to an automatically minted, sole-location venue identity whose canonical venue is cruising, whose name/geography agree and whose only registered source is the facts-only importer. Existing supplied values continue to pass. Supplied raw extra facts, another source, another role, multiple locations or identity conflicts exclude the outcome.

The ordinary quality refresh evaluates this scope from live inputs rather than preserving a waiver. A new/changed registered source invalidates the quality-check cursor so ordinary enrichment/review resumes. A bounded, service-only reconciliation records previous/new finding states in the existing quality event log and updates profile dimensions without falsifying verification timestamps.

A UI-only filter would leave the false producer intact; inventing content to satisfy completeness would introduce unsupported claims. Both are rejected. The unavailable state remains visible in diagnostics and does not improve the score as a pass.

Validate with isolated PostgreSQL fixtures, then a rolled-back production-schema regression, a production dry run, bounded applied passes and an idempotency check. Apply only after the coordinated production schema freeze is lifted. The all-queue goal remains active until its complete total is independently below 100.
