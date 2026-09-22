# Business and brand data-quality completion

## Objective

Make the organizations spine and marketplace brand registry measurable and
repairable without treating every absent field as a defect. Full coverage means
that every applicable quality dimension reaches a recorded outcome: pass, fail,
pending, not applicable, or source unavailable.

## Decisions

- Canonical populations are non-duplicate organizations, product-bearing brand
  rows, and active non-duplicate listings. Drafts, rejected rows, duplicate
  shells, and retired artifacts are reported separately.
- Organization quality is role-aware. Identity, editorial, contact, location,
  media, categorization, linkage, provenance, and freshness are independent
  dimensions; a field that is irrelevant to a role is `not_applicable` rather
  than a zero.
- Per-entity outcomes live in an admin-only findings ledger with stable reason
  codes, evidence, provenance, timestamps, and waiver support. Aggregate
  snapshots extend the existing marketplace quality system.
- Brand publication and ownership verification are separate states. The legacy
  `status` column remains a compatibility projection while existing readers are
  migrated.
- Brand organization links are automatic only with corroborated domain or
  merchant evidence. Ambiguous candidates stay in the existing review queue.
- Source recovery always precedes generated copy. Ownership, identity, and
  community claims are never generated. A verified source miss is a terminal
  result and must not be retried forever.
- Department and subcategory group are the canonical marketplace taxonomy.
  Deterministic confidence and model confidence are reported separately;
  `category_id` remains compatibility data until callers are removed.
- Identity-changing repairs are reversible. Brand key changes require redirects
  and a before/after event; no semantic repair hard-deletes a record.

## Delivery

1. Add state vocabulary, role-aware scorecards, brand lifecycle columns,
   redirects, findings, snapshots, and reconciliation functions in a migration.
2. Backfill lifecycle and quality outcomes without overwriting sourced fields;
   derive missing roles from existing foreign-key links and queue conflicts.
3. Correct budget-deferral accounting and extend the existing marketplace
   snapshot with business, brand, taxonomy-confidence, media, and link metrics.
4. Add an admin quality queue with filters, evidence, bulk-safe resolution, and
   explicit waiver actions; expose all supported organization roles.
5. Verify schema invariants, RLS, scoring fixtures, reconciliation, public brand
   routing, sitemaps, image fallbacks, and alert semantics.

## Acceptance

- Every canonical organization and product-bearing brand has one current
  outcome for every applicable quality dimension.
- Linked entity types and organization roles agree, and deterministic links are
  exhausted without forcing ambiguous matches.
- Every ownership claim has evidence and review provenance.
- Every public brand has a slug and products; optional profile fields are either
  present or explicitly unavailable.
- Marketplace taxonomy, description, image, and URL backlogs have truthful
  counts, terminal outcomes, and drain estimates.
- All writes are idempotent, bounded where external I/O is involved, and
  recoverable from an audit record.
