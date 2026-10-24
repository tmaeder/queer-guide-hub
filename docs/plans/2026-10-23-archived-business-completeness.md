# Archived location completeness

The quality producer currently creates business completeness findings for archived location spines. Terminal archives without active linked content should not require staff to commission prose, contacts, images or verification dates. This does not remove identity, location or linkage findings.

Scope is restricted to archived unclaimed organizations created by the unified-location adapter, with matching archived primary venues, matching city/country/name, no attention flag, no events (including historical ones), no independent linked hotels/merchants/brands/publishers/affiliates, no pending review tasks and no waivers or governance holds. Foursquare discovery quarantine is explicitly excluded. Existing content, provenance, publication, safety and verification fields remain unchanged.

The operator defaults to dry run. Committed outcomes retain original finding evidence in the native business quality journal. Locks are bounded and contention is skipped. The ordinary producer uses the same lifecycle contract, and restoration/new relationships invalidate the cached assessment for native reassessment.

Validation: 26 disposable PostgreSQL lifecycle/ownership cases, whole-profile protection, audit, dry run, idempotency, the native organization assessment SQL, repeated producer refresh, restored primary venues and new linked hotels. PostgreSQL 17 grammar validation passes for the full migration corpus. Production application results are pending.

Production: normal deployment 40013759115 applied the migration after recovering its missing predecessor without changing migration history. A 20-record rollback rehearsal reconciled 68 findings and independently asserted full business/venue preservation. The actual bounded campaign reconciled 3,633 findings across 1,119 organizations. A subsequent ordinary refresh assessed 2,000 organizations; all 1,119 repaired archived scopes remained eligible with zero reopened completeness cases. Freshness findings are included in the repair count and are not all visible queue items.
