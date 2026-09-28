# Governance engine full-remediation design

## Decision

Resolve every finding surfaced by the Governance Engine dashboards. Resolution
means an evidence-backed repair, merge, archive, review decision, or an explicit
terminal `source_unavailable` / `not_applicable` outcome after a defensible
attempt. Threshold changes, hidden counters, blanket waivers, and fabricated
values do not count as remediation.

## Scope

The programme covers Countries, Cities, Venues, Queer Villages, Personalities,
Events, Marketplace, Businesses and Brands, Addresses, Categories, duplicate
queues, liveness and closure, and editorial queues. The initial production
snapshot is the immutable cohort for completion accounting; newly detected
findings are tracked separately and must not obscure whether the original
cohort was drained.

## Execution model

Work proceeds in dependency order:

1. Capture finding-level baselines, detector versions, queue ownership, and
   before-state needed for rollback.
2. Repair identity, duplicate, geography, and relationship defects.
3. Resolve liveness, safety, publication, consent, and provenance violations.
4. Complete taxonomy, addresses, descriptions, media, accessibility, and other
   enrichment gaps.
5. Drain subjective and ambiguous review queues item by item.
6. Recompute all snapshots and reconcile every baseline finding to a terminal
   outcome.

Bulk work uses bounded, resumable, idempotent batches. Each wave starts with a
canary, records progress and before-state, stops on elevated error or regression
rates, and is verified before the next dependency wave starts. Existing review
and publication gates remain in force throughout.

## Data integrity rules

- Prefer deterministic sources and existing provenance over generated content.
- Never invent missing facts to improve completeness scores.
- Preserve human review for accessibility, identity, safety, ownership,
  subjective taxonomy, editorial copy, and other policy-gated fields.
- Merge or archive only with durable redirects or relationship rewrites where
  required.
- A terminal unavailable or inapplicable outcome must include the attempted
  source set, reason, detector version, and timestamp.
- Existing unrelated worktree changes remain untouched.

## Acceptance criteria

The programme is complete only when:

- every finding in the initial snapshot has a durable terminal resolution;
- all hard publication, safety, security, identity, and relationship violations
  are zero;
- every remaining non-pass state is an explicit evidence-backed terminal
  disposition, not an unowned backlog;
- review queues contain no item from the initial cohort;
- recomputed dashboard totals reconcile with the finding ledger;
- recurring producers, detectors, and queue routing prevent the same defects
  from silently accumulating again; and
- relevant database, function, UI, and production smoke tests pass.
