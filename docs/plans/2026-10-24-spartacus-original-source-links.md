# Restore original directory references in review evidence

A legacy Spartacus import retained 1,450 original detail URLs in `venue_sources.payload.raw.url` while leaving `venue_sources.source_url` null. Review evidence therefore omitted a direct link even though the original reference was still available.

The default-preview repair restores only that original registered URL. It requires an exact HTTPS publisher host, expected detail path and matching numeric source identity; rejects query/hash/control/traversal forms; and preserves claimed, verified, duplicate, closed and human-edited cases. It locks at most 100 records, checks whole-row source and venue preservation, preserves organization facts and writes an audit event. No external website, contact, quality pass, publication or verification is inferred.

Production: a full 100-record rollback rehearsal passed. Twelve committed batches restored 1,154 references; a thirteenth returned zero eligible records. The other original references remained protected or outside the strict repair scope. Original payloads, hashes, first/last-seen timestamps and venue facts remained unchanged. The reference repair does not itself count as resolving a pending quality finding.
