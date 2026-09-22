# Milestone data-quality improvement programme

## Decision

Improve milestone quality with a tiered programme rather than one uniform
catalogue standard:

- Tier A: significance 5 or featured.
- Tier B: significance 4.
- Tier C: significance 1–3.

Tier A/B receive strict evidence, taxonomy, imagery and review requirements.
Tier C keeps a smaller publication contract and is remediated primarily through
automated checks plus exception queues. Public milestone responses remain
backward compatible; quality operations remain admin/service-role only.

## Baseline

The 2026-09-22 production audit found 3,191 live milestones: 2,952 published and
239 drafts. Every row has a description and at least one source, but:

- 1,568 (49.1%) use `category='other'`.
- 2,904 (91.0%) have one source; 1,550 rely solely on English Wikipedia.
- 3,027 (94.9%) have no image; 124 of 164 images lack alt text and 118 lack
  source/license metadata.
- 146 milestones (4.6%) have links; 139 of 155 links have no role and 63 link
  proposals remain pending.
- 76 named cities and five named countries are not linked.
- All 3,208 coverage-gap rows are open, including stale merged rows.
- The quality ledger contains completeness signals only; `needs_attention` is
  false for every live row.

The existing score rewards day precision even though sourced year/month
precision is valid, rewards the mere presence of one source without measuring
authority or health, and penalizes images/links even when they are not
applicable. Its average trust score of 78.5 therefore overstates the corpus.

## Design

### Quality model

Separate presentation completeness from evidence-based trust. Compute explicit
dimensions for source health, corroboration, editorial quality, taxonomy fit,
geography, applicable link coverage, media metadata and duplicate risk. Derive
`needs_attention` from failed dimensions and open review work. Date precision is
valid when the stored precision is supported by a citation; day precision is
not intrinsically better.

Coverage gaps become lifecycle-aware: merged rows are removed, fixed rows are
resolved, ignored/waived fields stay resolved, and optional images/links are
only gaps when applicable.

### Evidence and editorial quality

Store source-health observations separately from the public `sources` JSON so
link checking does not churn milestone rows. Record canonical URL, source
class, health state, HTTP status, redirect target, archive URL and check time.
Treat 403/429 as indeterminate and retry with domain-aware throttling.

Tier A requires two independent sources and an authoritative source where one
exists. Tier B requires one primary/institutional source or two independent
secondary sources. Tier C retains the one-source minimum. Descriptions use a
factual what/when/where/consequence structure; uncertainty and unsupported
superlatives create review work rather than silently passing.

### Taxonomy, geography, images and links

Keep existing category slugs and add `culture-media`,
`politics-representation`, `health-aids`, and `community-institution`.
Reclassification writes review proposals; only deterministic high-confidence
mechanical cases may auto-apply. Controlled topic tags support search, but tags
are not mandatory in completeness until the backfill is complete.

Resolve current place names through aliases and record explicit exemptions for
historical jurisdictions. Image coverage is prioritized by tier and accepts an
explicit waiver when no event-specific licensed asset is appropriate. Every
displayed image requires alt text, source, license and attribution, and approved
external assets are ingested into the existing image CDN path.

Entity discovery covers personalities, organizations, venues, events and news.
Links use controlled roles (`subject`, `participant`, `organizer`,
`decision-maker`, `affected-person`, `location`, `coverage`). Applicability is
derived from detected named entities, so an event is not penalized merely for
having no suitable entity.

### Remediation funnel

Prioritize tier, publication state, evidence risk, duplicate risk and gap
severity. The 239 drafts must pass source, taxonomy and duplicate gates before
approval. Semantic duplicate candidates use jurisdiction, date range, named
entities and event fingerprints; standardized cross-country legal titles must
not be treated as duplicates solely because their wording is similar.

Mechanical fixes are reversible. Category changes, factual rewrites,
significance changes and merges remain human-reviewed. Admin reporting exposes
backlog size, oldest item, acceptance rate and quality coverage by tier.

## Acceptance criteria

- Tier A: authoritative date evidence, non-`other` category, healthy citations,
  at least two independent sources, and complete imagery or an explicit waiver.
- Tier B: healthy citations, category assignment, and one primary source or two
  independent secondary sources; target 70% image/waiver coverage.
- Published catalogue: no missing descriptions/sources, confirmed-dead sole
  sources, unresolved ordinary country links, high-confidence duplicate
  candidates, or incomplete metadata on displayed images.
- Reduce `other` below 15% after reviewed reclassification and populate at least
  one controlled topic tag per published milestone.
- Resolve or waive every Tier A/B gap and remove merged rows from active gaps.
- Publication/import tests cover supported date precision, source health,
  taxonomy, image attribution, duplicate risk, RLS and review-state transitions.

## Rollout

Ship schema and scoring changes first, backfill source observations and quality
dimensions without changing publication state, then enable the tiered queues
and admin scorecard. Run the milestone audit snapshot before and after each
phase. Production data changes occur only through reviewed migrations or admin
queues; implementation work does not directly mutate production.
