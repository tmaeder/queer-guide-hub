# Personality editorial batches

Approved direction: the user requested implementation of the source audit, reviewed batches, automated checks and one deployment per batch.

Use a versioned JSON manifest and a small command-line tool. Compared with ad-hoc SQL, this makes evidence, language review, concurrency checks and release state reproducible. A new database queue would duplicate existing claim and translation tables and need an unnecessary schema release. The manifest is the review queue; existing Supabase tables remain the publication store.

A batch moves through draft, reviewed, prepared, verified and released artifacts. Every changed field requires an original value and field-specific source support. Sources record exact-person matching, URL, title, review basis, checked time and supported fields. Personal identity requires explicit public evidence; cultural work, allyship and activism have distinct reasons. Automated language checks flag prose for review, never infer identity. Drafts cannot compile to SQL.

Preparation validates the entire manifest before producing a deterministic digest, atomic SQL, rollback SQL and a review summary. Updates lock public, nonduplicate records and compare all touched fields with the snapshot. Existing translations must match their snapshot; unrelated fields and private pending/rejected claims remain untouched. Every approved changed field receives its own source claims. Repeat application fails rather than duplicating sources.

Verification uses anonymous website credentials to check stored prose, verified explanations, sources and published translations. A receipt binds the batch digest to one merged commit, successful deployment run and matching live build ID. A conflicting second release receipt is rejected. The artifacts make one deployment per batch auditable; GitHub's required checks remain authoritative.

Before one release: freeze the full content batch, run manifest/schema/language checks, isolated PostgreSQL application and rollback tests, and the complete affected public profile flow (summary, sources, sharing, reporting, dates and mobile layout). Fix issues in this preflight before merging. Apply the frozen data transaction once, verify anonymous reads, merge one PR, follow its one Pages deployment, then verify the actual production build and profile examples. No per-profile deployments or mid-batch UI releases.

The first use is a bounded batch of remaining profiles backed by readable official, publisher or attributable public sources. Unsupported or ambiguous cases stay in the audit backlog with reasons. Research and publication are distinct: successful validation cannot establish that a source supports a fact; the explicit source review is required.

## Approved scale revision — 26 November 2026

The user requested larger batches and less repeated work. Use the existing 100-record transaction limit as the default release size. Reuse institutional biography collections for discovery, collect pages concurrently, and approve a narrow source-backed fact per exact person. Keep biographies that do not need correction, translate affected summaries and explanations, verify all published records through anonymous reads, and sample the rendered UI across languages and content types. Ambiguous or contradictory claims stay deferred. Each completed batch still has one publication and one deployment.
