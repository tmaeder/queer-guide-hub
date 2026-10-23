# Current event artwork reuse

Production had 1,022 open `IMAGE_CONTENT_REUSED` findings, including 462 on declared recurring events or series. The SQL scanner already excludes these events from its URL-reuse warning, but the external image auditor counted every historical observation and ignored recurrence. An event with several observations could therefore inflate a cluster, and replacing an image did not remove its old observation from the count.

The service-only assessment counts distinct canonical, non-cancelled events whose current primary image still has that successfully observed content hash. It follows the existing SQL policy for declared recurrence and series. Ten unrelated current events still trigger review. A primary image changed during a worker run stops that stale reuse result. Evidence retains its existing fields so unchanged accepted findings do not reopen solely because a contract marker was added.

No artwork, content, publication, safety, verification, or quality score is changed. After deployment, targeted native image audits will re-probe the affected records and resolve only findings no longer emitted by the detector. Other image findings remain independent. Ordinary scanning must then confirm that the retired recurrence findings do not reopen.

Validation: 14 isolated PostgreSQL cases cover the threshold, recurrence, series, multiple observations per event, replaced primary images, cancelled/merged peers, failed observations, stale/missing targets, malformed hashes, and service-only permissions. The Deno entrypoint check and scoped ESLint passed. Production deployment and re-audit receipts are still pending.
