# AgendaQ pipeline remediation

Date: 2026-10-06
Status: approved

## Objective

Finish the downstream processing of the complete AgendaQ import without
dropping source records, inventing missing facts, or broadening the product's
global venue taxonomy solely for one source.

## Chosen approach

Use a source-faithful repair and bounded pipeline drain:

1. Map AgendaQ organizations to the closest existing valid venue category,
   while retaining the original AgendaQ taxons in source metadata.
2. Repair source end times that clearly describe an overnight event but use
   the start date for the after-midnight closing time.
3. Enrich an event location only when its AgendaQ payload explicitly links to
   an imported AgendaQ venue with a usable location.
4. Keep genuinely unverifiable records in `needs_review`; do not fabricate or
   delete required facts.
5. Requeue corrected records and run validation, deduplication, review-gate,
   and commit stages in bounded batches until no actionable AgendaQ work
   remains.

## Alternatives rejected

- Adding `organization` as a new global venue category would change product
  taxonomy, filters, and downstream contracts beyond this import's scope.
- Dropping incomplete records or manufacturing dates/locations would violate
  source completeness and provenance requirements.

## Completion criteria

- All 3,877 venue source IDs and 16,433 event source IDs remain represented in
  staging or committed source tables.
- No AgendaQ row remains rejected for a deterministic adapter defect.
- No AgendaQ row remains pending in an automated pipeline stage that can be
  safely advanced.
- Unverifiable records are explicitly routed to review with their source
  evidence and quality warnings intact.
- Adapter tests, type checking, linting, and a production database audit pass.
