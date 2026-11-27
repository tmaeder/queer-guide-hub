# Publisher transcript links

Approved on 2026-11-27: add publisher transcript links to existing episodes and discover them automatically for future imports. Full transcript hosting and speech recognition are outside this version.

Episode pages show a Transcript section when the publisher supplies an explicit transcript URL. Direct episode links say “Read episode transcript”; show-wide collections say “Browse show transcripts”. Attribution identifies the publisher as the source. No availability claim is inferred from an episode title or a request-by-email notice.

Discovery reads Podcasting 2.0 transcript tags and explicit links in original show notes before cleanup removes URLs. Preserve format and language where provided, normalize and deduplicate public HTTP(S) destinations, and reject executable, local, credential-bearing, and malformed URLs. Keep archive links distinct from direct episode links. Never turn an arbitrary nearby promotional URL into a transcript link.

Store derived links separately from publisher content. The existing five-minute podcast worker processes a bounded transcript queue with source-hash comparisons, including changed notes or feed metadata. Empty results are recorded so unavailable episodes do not cycle indefinitely. Backfill original stored notes and re-read publisher RSS feeds to recover transcript tags and linked anchor labels that older imports discarded; match existing episodes by their episode/audio URL within their source.

Validate parsing, unsafe URLs, generic archives, multiple formats, missing transcripts, idempotence, concurrent edits, service-only writes, and accessible rendering. Verify representative live episode pages and production queue coverage after deployment.
