# Personality data-quality remediation

Approved: 2026-09-21

## Intent

Repair the personality catalogue without bulk-unpublishing legitimate profiles. The programme separates the general encyclopedia from the adult-performer cohort, prevents new defects at ingestion, then repairs existing records in reversible batches.

## Baseline

- 16,592 rows total; 10,536 active non-duplicate/non-archived; 2,367 public.
- Descriptions, image metadata, taxonomy, field provenance, score semantics, and review-state reconciliation are the principal quality gaps.
- Adult-platform data accounts for 6,995 active profiles and requires cohort-specific taxonomy, consent, identity-match, and source-rights rules.
- Existing strengths to retain include staging, source records, deduplication, explicit adult consent, quality/review queues, and scheduled truth-engine jobs.

## Design

1. Add versioned quality dimensions and explicit Wikidata status. Keep legacy columns during the migration window.
2. Normalize claim provenance, affiliations, adult attributes, and reviewed event-personality links into dedicated tables with RLS and narrow grants.
3. Validate personality writes centrally: real QIDs only, coherent life dates, strings-only legacy fields, and cohort-aware hard gates. Preserve rejected/raw values in audit tables instead of deleting evidence.
4. Publish canonical tags and roles. Treat `fields` and raw adult platform tags as legacy inputs, not public taxonomy.
5. Resolve one active optimized cover image for cards, detail pages, and metadata. Store external image URLs as provenance, and track unavailable/rejected states explicitly.
6. Replace title-text related-content inference with approved entity links.
7. Recompute scores from live data with separate encyclopedia/adult rubrics, explicit hard failures, and actionable review states.
8. Fix queue lifecycle and monitoring: retire gaps for excluded records, deduplicate/retain signals, expose cohort/source metrics, and alert on broken automations and publication-gate violations.
9. Backfill in dry-run-capable, audited batches: public safety/correctness first, then public completeness, draft encyclopedia rows, and finally adult rows.

## Compatibility and safety

- Public profiles remain visible unless an identity, consent, safety, or clearly incorrect-image issue requires review.
- New tables in `public` use RLS. Internal tables and mutation functions are not exposed to `anon` or ordinary authenticated users.
- Existing personality columns remain readable while the frontend moves to a canonical public read model.
- Migrations do not invoke remote jobs or mutate production when committed; deployment remains a separate operational step.

## Acceptance criteria

- Published records cannot contain invalid QIDs, object-valued fields, contradictory life dates, noncanonical public taxonomy, unsupported sensitive claims, or known placeholder portraits.
- Cards, detail pages, and SEO use the same canonical image decision.
- Related news/events come only from approved links.
- Pending states reconcile with actionable queue entries, excluded records leave active queues, and all personality automations are healthy.
- Backfills produce before/after counts, audit rows, and deterministic rollback data.
