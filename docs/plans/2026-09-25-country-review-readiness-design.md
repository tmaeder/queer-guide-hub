# Country review-readiness design

Approved: 2026-09-25

## Goal

Make the deterministic preflight for Countries review queues visible in the
existing Quality Hub without weakening the requirement for human approval.

## Design

Extend the existing authenticated `country_quality_health()` response with a
`review_readiness` object. The database remains the sole source of truth and
computes structural validation counts for pending editorial, translation, and
image proposals.

The object reports:

- Editorial total and blockers: missing evidence, missing grounding hash,
  empty or overlong hooks, invalid sentence count, banned language, and second
  person.
- Translation total and blockers: stale source, empty output, wrong field,
  unchanged output, HTML residue, and duplicate country/locale tuples.
- Image total and blockers: non-local assets and missing source or licence.
- Aggregate `ready` and `blocked` counts for each queue.

The existing Countries Quality Hub panel will render one compact row per queue,
showing total, ready, and blocked counts and retaining the existing links to the
review interfaces. A failed or missing readiness payload must display as
unavailable rather than as zero.

## Security and scope

- Keep the existing authenticated/service-role RPC grants and anonymous
  revocation.
- Do not add a second RPC, table, or public endpoint.
- Do not approve, reject, or apply any proposal.
- Preserve all existing health response keys for compatibility.

## Verification

- SQL contract test for response shape and current deterministic counts.
- Component/contract tests for fail-closed rendering.
- Typecheck, production build, database advisors, and migration verification.
- Production Countries E2E and route smoke after deployment.
