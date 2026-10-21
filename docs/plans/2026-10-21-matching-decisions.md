# Matching decisions: operational improvement

The user authorizes direct automatic cleanup and asks for the remaining decisions to carry the necessary context. Extend the existing operational visual system and automation instead of asking users to configure cleanup.

A cosmetic redesign leaves the underlying queue unchanged. Broader confidence-based acceptance risks wrong links. The selected approach combines deterministic matching, reconciliation of repaired findings, and an actionable live comparison.

- Prevent unmatched records from consuming the entire matcher's batch; consider records with catalogue candidates first.
- Auto-link only a unique exact-name canonical open venue in the same city, with compatible country and no conflicting coordinates or duplicate event. Preserve provenance and all ambiguity gates.
- Reconcile both queue representations when a venue link is established. Machine resolution remains distinct from human review.
- For human venue decisions, show the source event, source URL, location, current catalogue candidates, address, website, match basis and coordinate separation. Require explicit selection and recheck live records transactionally before linking.
- Retain source names when no candidate is available. Never turn an empty candidate list into a verified match.

Verification covers rejected stale/cross-city/closed/duplicate matches, actual linkage and both queue dispositions, failure/retry/empty states, existing decision regressions, typecheck and desktop/mobile presentation.
