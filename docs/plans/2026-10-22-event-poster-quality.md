# Event poster quality

The event image auditor and enrichment workers used the landscape cover requirement (800 pixels wide, 450 high) for event-owned posters. This flagged 598 portrait images whose shortest edge is at least 450 pixels and longest edge at least 800. Of these, 594 meet the other stored HTTP/MIME/byte/density gates. These numbers describe recheck candidates, not repaired findings.

The `event_artwork` probe role accepts either orientation with those same minimum edges. Minimum bytes, byte density, base image decoding, MIME checks, SSRF restrictions and content-hash requirements remain. Cover and hero roles retain their existing requirements. Both artwork discovery and final image probing use the event rule.

Migration `99991792712263_event_image_targeted_rechecks.sql` allows up to 100 explicit event IDs to be rechecked through the ordinary auditor, retaining its exclusive worker lease and native observation/finding writes. Claims do not alter event data or quality findings. Archived, rejected, cancelled and duplicate events are excluded. The endpoint reports runtime revision `2026-10-22.event-artwork-v1` and validates requested IDs before claiming work.

Validation: 13 Deno image/worker tests, 10 event-gap Vitest tests, edge typecheck and scoped ESLint pass. An eight-event disposable PostgreSQL fixture verifies bounds, grants, unsafe URLs, lifecycle exclusions, duplicate IDs, actor checks and mutual exclusion with a live worker lease. Three read-only public source probes returned HTTP 200 and passed the revised rule (665×960, 736×829 and 768×960), with no production mutation or queue reduction credited to those probes.

The release and native reassessment completed on 2026-10-23. All 594 original `IMAGE_LOW_RESOLUTION` findings were resolved through the auditor: 593 images passed, while one failed its fresh fetch and retains an `IMAGE_UNREACHABLE` finding. This was a reclassification, not a pass. Reports and HTTP receipts preserve each batch outcome; no content or quality scores were forced.
