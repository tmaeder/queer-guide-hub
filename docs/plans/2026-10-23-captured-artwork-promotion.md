# Promote usable captured artwork

The event image enrichment worker skipped every source image already present anywhere in the event gallery. This prevented a good poster behind a poor primary image from becoming the primary artwork. Skip only an image that is already primary; retain the existing source-path and live image-quality checks.

The native completion function also retained an existing gallery copy when prepending the same URL. The migration removes already-prepended URLs from the retained gallery while preserving its lease, lifecycle, safe-URL and previous-image comparison guards. It does not change quality thresholds or accept an image finding.

Validation: seven worker tests pass, including promotion from a registered source at zero model budget. A disposable PostgreSQL fixture checks a successful promotion without a duplicate, lost leases, changed image snapshots, ineligible completed events, unsafe URLs, protected non-image fields and execute grants.

A read-only audit found about 50 current AgendaQ findings with a larger asset in the stored source metadata. Local probes failed certificate verification, including when using the existing system certificate store. The collector retains failure diagnostics and supplies no positive proof for these failures. No image replacement or finding clearance is credited to that audit. TLS validation stays enabled.
