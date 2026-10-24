# Promote usable captured artwork

The event image enrichment worker skipped every source image already present anywhere in the event gallery. This prevented a good poster behind a poor primary image from becoming the primary artwork. Skip only an image that is already primary; retain the existing source-path and live image-quality checks.

The native completion function also retained an existing gallery copy when prepending the same URL. The migration removes already-prepended URLs from the retained gallery while preserving its lease, lifecycle, safe-URL and previous-image comparison guards. It does not change quality thresholds or accept an image finding.

Validation: seven worker tests pass, including promotion from a registered source at zero model budget. A disposable PostgreSQL fixture checks a successful promotion without a duplicate, lost leases, changed image snapshots, ineligible completed events, unsafe URLs, protected non-image fields and execute grants.

A read-only audit found about 50 current AgendaQ findings with a larger asset in the stored source metadata. Local probes failed certificate verification, including when using the existing system certificate store. The collector retains failure diagnostics and supplies no positive proof for these failures. No image replacement or finding clearance is credited to that audit. TLS validation stays enabled.

A later TLS-validated retry using `DENO_TLS_CA_STORE=system,mozilla` examined the 50 registered candidates and produced 44 positive live-image proofs. The bounded operator found 42 eligible current snapshots; the other two were left unchanged. A production transaction exercised all 42 replacements with whole-event assertions and rolled back successfully before application. The real application then promoted 42 source images, retained machine provenance and original images in its journal, and changed no content, publication, safety, verification or quality-score fields.

All 42 subsequently passed the native image auditor in three confirmed HTTP 200 batches (20, 20, 2), with zero failures. Native findings now show zero open low-resolution issues for those 42 events. The receipt files are `outputs/agendaq-artwork-promotion-apply-20261023.json` and `outputs/agendaq-artwork-native-audit-20261023.json`.

The maintained promotion operator defaults to dry run, requires fresh source-bound image proofs, preserves human edits and media decisions, locks source/event snapshots, and asserts the entire event row after each write. Its driver journals before submission and never retries unknown writes. The separate native re-audit driver keeps the worker's ordinary lease and authentication.
