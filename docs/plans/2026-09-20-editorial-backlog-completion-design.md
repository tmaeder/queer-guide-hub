# Editorial backlog completion

## Decision

Finish the remaining admin quality work with a correctness-first policy. Queue
depth is not itself evidence that content should be published. Deterministic
defects are repaired automatically; unsupported claims are removed from public
surfaces or retained as non-publishing utility data; evidence-gated decisions
stay conservative. No migration may manufacture human review, provenance, or a
public source.

## Glossary disposition

- Keep `article` only for real glossary concepts with a canonical summary and
  primary category.
- Move incomplete zero-use articles to `utility`; assignments and aliases stay
  intact, but the row cannot publish or enter search.
- Retain evidence-backed articles and preserve existing public sources.
- Clear prose and ontology review states only when existing structured evidence
  proves the decision; otherwise demote instead of rubber-stamping.
- Keep sensitive/adult entries hidden unless their source, prose, and review
  gates are satisfied.
- Remove deterministic hygiene defects: placeholder definitions, self-aliases,
  scraped hashtag names, stale merge flags, and invalid redirect remnants.

## Personality disposition

- Preserve public, sourced personalities that already pass the safety gates.
- Archive unsupported low-relevance drafts and records already classified as
  non-person/irrelevant.
- Keep sourced, sufficiently relevant drafts available for the existing
  enrichment pipeline; do not label them human-reviewed automatically.
- Reconcile contradictory workflow fields so archived, approved, public, and
  attention states describe one coherent lifecycle.

## Admin truthfulness

The Cockpit and Quality header must include the actionable glossary and
personality workflow counts they currently omit. “All clear” and “0 items
awaiting review” are allowed only when every queue represented on those pages is
actually empty. Coverage gauges remain labelled as coverage rather than review
work.

## Verification

Add database assertions and UI tests for queue semantics. Before release, run
focused tests, the full build check, database advisors, and production invariant
queries. After deployment, perform authenticated production E2E on `/admin`,
`/admin/quality`, and `/admin/settings`, plus representative public tag,
personality, redirect, search, and narrow-viewport journeys.
