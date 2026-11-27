# First weekly sync repairs

The first run completed all 493 jobs: 431 succeeded, 57 skipped, three failed and two blocked. Preserve that historical result. Verify repairs with scoped production calls rather than rerunning every source.

The user approved scheduled refreshes for the Wikipedia and Pexels registrations and requested an alternative to Firecrawl for GayOut.

- Add an authenticated scheduled enrichment adapter for existing records only. Wikipedia uses established Wikidata human identifiers and their English Wikipedia sitelinks; never resolve names or infer sensitive identity. Pexels searches cities lacking an image with country context. Queue factual text/image suggestions with attribution for admin review, without updating live entities or publishing. Bound each weekly batch and rotate a server-side registry cursor; retries deduplicate suggestions and dry runs write nothing.
- Reuse the existing internal Cloudflare extraction worker as the GayOut alternative, including raw sitemap documents. Validate source/final URLs and document types, reject challenge pages, and retain explicit failure when no usable document is available. Verify real production acquisition before calling it fixed.
- Correct Awin's distinct feed credential handling and report exact configuration needs. Treat feed aborts as transient failures under the existing three-attempt limit. External credential/credit problems remain visible.
- Deploy committed changes through CI, verify scoped imports and review-queue writes in production, and compare repository/production migration history after any new migration.
