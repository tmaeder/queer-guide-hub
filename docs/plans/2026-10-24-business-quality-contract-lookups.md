# Bound business quality contract evaluation

The whole production refresh reached organization assessment after the audited-pair selector fix, then still timed out at its existing 120-second limit. Its archive contract repeatedly scans pending reviews. The production plan scans 6,434 pending rows per archive check; a single check measured 138 ms. Splitting the two review predicates without an index still measured 289 ms, so predicate rewrites alone are insufficient.

Add a partial `(entity_type, entity_id)` index for pending reviews, preserve the organization and venue pending-review exclusions as separate keyed anti-joins, and materialize the existing organization assessment batch. Contract checks then evaluate once per profile rather than once per dimension/reference. Eligibility, dimensions, scores, evidence, batch size, ownership guards and producer timeout remain unchanged. The migration does not enable any automation.

The disposable PostgreSQL archive-scope suite passes all existing 26 ownership/lifecycle cases, including pending organization and venue reviews, historical events, provider quarantine, human waivers and restoration invalidation. An additional fixture inserts 10,001 unrelated pending reviews and verifies use of the new lookup index. Instrumented stable contract functions prove one source evaluation per profile and one archive evaluation per archived profile; complete finding outcomes and evidence remain identical across reassessment.

After normal deployment, measure the real query and the whole native worker again before restoring the original paused schedule. The index has not been created manually in production; no post-index production timing is claimed before deployment.
