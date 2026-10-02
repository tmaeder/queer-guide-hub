# Personality review contract repair

## Context

Production has two related review-contract defects:

1. `get_admin_counts().quality_personality` counts both actionable open review rows and broad `personalities.needs_attention` lifecycle flags. The Quality page therefore reports 297 items while the linked review queue is empty.
2. `_apply_review_value` assumes every `entity_review_queue.proposed_value` is a JSON object and extracts `proposed_value -> value_key`. Some personality producers store a JSON scalar, so approval can close the review row while writing SQL `NULL`.

## Approved design

### Actionable count

`quality_personality` will represent only rows that the linked quality-personality queue can actually display and review. It must derive from the canonical triage source (or the exact same open-review predicate), not from `needs_attention`.

The broader `needs_attention` population remains intact and visible in the Personality engine dashboard as a diagnostic metric. No flags are cleared merely to make the action badge reach zero.

### Scalar-safe application

`_apply_review_value` will normalize the proposal before dispatching by application mode:

- JSON object: preserve the registry-driven `value_key` extraction.
- JSON scalar: use the scalar itself as `v_val` and its unquoted text representation as `v_text`.
- JSON arrays used by array modes: preserve the existing whole-document fallback.

Unknown or structurally invalid values must fail before the review row is closed. The existing identifier quoting, parameterized dynamic SQL, role gate, provenance, audit, and `needs_attention` handling remain unchanged.

### Security

The implementation keeps `_apply_review_value` internal: `EXECUTE` remains revoked from `public`, `anon`, and `authenticated`. Public wrapper grants and their explicit admin-role checks remain unchanged.

## Verification

- Static regression tests assert scalar and object normalization, count/queue parity, and function grants.
- A transaction-scoped database probe proves a scalar proposal writes its exact value rather than `NULL` and rolls back its fixture.
- Database advisors are reviewed after deployment.
- Production checks confirm the quality card and deep link agree, scalar application succeeds, all actionable queues remain empty, and the public homepage/search/detail flows load without errors.

## Rejected alternatives

- Clearing the 297 attention flags would hide genuine diagnostic state.
- Fixing only the React display would leave other consumers of `get_admin_counts` inconsistent.
- Special-casing personality fields would perpetuate producer-specific behavior in a generic review function.
