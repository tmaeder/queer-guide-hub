# Calendar and source evidence follow-up

The owner approved evidence-backed gap closure and requested autonomous completion
and production E2E testing. This extends that strategy rather than replacing it.

Prefer deterministic source-calendar recovery over individual AI repairs. Live
AgendaQ rendering establishes last-weekday and cancellation semantics; historical
malformed periods must not prevent recovery of valid current periods. Expand real
multi-day spans as one interval, preserve equivalent timezone instants, and keep
omitted contradictory periods visible as partial evidence.

For missing sources, research and review event/organizer identity candidates, then
verify actual public HTTPS pages in bounded batches. Keep edition-date verification
separate. Previously copied 2027 estimates cannot become verified merely because
an organizer website exists. Apply only explicit primary-source date corrections.

Revalidate reviewed sources weekly; use exact normalized event-family title and
city to inherit fresh identity evidence for later clones. Preserve editorial URLs,
dates, independent verification timestamps and provenance. Failures stay in the
verification artifact. Existing gap-worker budgets and leases remain in force.

Validation covers calendar semantics, cancellations, source permissions, source
freshness, fill-only writes, idempotence, cross-city isolation, and live public
detail/calendar export after deployment. Source errors that cannot be repaired
without inventing facts remain explicit partial records.
