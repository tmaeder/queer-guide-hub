# Retire proven machine stock from event artwork

The image registry identifies the reused R2 photograph as `source=scraper`, `source_ref=pexels:12987821`, with no human asset links. Across registered stock assets, 618 events currently use canonical stock images; 440 have Siegessaeule source records. This is direct provenance evidence beyond visual similarity.

Remove only a sole canonical R2 stock photograph on an unverified, machine-created event with one exact registered Siegessaeule source. Require the known raw/normalized payload shape, an explicitly empty normalized image array, no publisher artwork or unknown capture fields, no image provenance, human revisions, reviewed media issues or human image links. Preserve publication, safety, verification, all other event fields, original source records and the entire image library. Save the removed image, asset metadata and exact links in event provenance; unlink only the machine association. Invalidate the derived assessment and let native scanning own findings.

Actual writes require the stock-producer retirement migration, a consolidated disabled legacy registry, no live legacy cron, and the active source-owned replacement. The script defaults to dry-run and limits each transaction to 50 events. No image absence waiver, quality pass or score is written. The cleanup says nothing about physical-event existence or current publisher availability.

The actual operator passes 27 isolated PostgreSQL source/ownership cases, dry-run immutability, full source/library/finding preservation, unrelated-link preservation, missing-release refusal and replay idempotency. A native dry preview finds 50 eligible records in its bounded first batch. Full native rollback and application follow producer deployment.
