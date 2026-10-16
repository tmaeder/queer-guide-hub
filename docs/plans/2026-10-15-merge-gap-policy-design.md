# Shared merge gap-filling policy

Approved in chat on 2026-10-15. Scope: duplicate-record and incoming-source merges.

## Problem

Duplicate merges reparent relationships but strand useful fields on hidden donors.
Extraction treats a present field envelope with an empty value as populated.
The legacy Import Hub merge deletes donors and suppresses field update failures.
The current main branch already has a dedicated social merge helper; build on it.

## Contract

Fill null, absent, blank strings and empty collections. Preserve false and zero.
Recursively fill object keys, preserve populated scalar values and nonempty arrays.
Use explicit field allowlists for persisted entities. Never transfer identity,
publication, moderation, ownership, or lifecycle metadata. Transfer coordinates
as a validated pair; never mix latitude and longitude from different donors.
Use existing validation/consensus for disputed incoming values. Retain donor
provenance and audit before/after values. Undo must not erase subsequent edits.

## Implementation and verification

Share policy semantics between a pure TypeScript helper and SQL JSONB helpers,
with matching behavioral fixtures. Integrate extraction and incoming social data.
Attach field transfer to existing transactional merge audits so every merge caller,
including auto-merge cores, receives it. Route the legacy Import Hub entry point
through reversible cores, retaining explicit field selections with audit coverage.
Provide an admin-only dry-run preview for historical merges, without automatically
trusting or copying their donors. Test empties, nested fields, false/zero, coordinate
pairs, conflict preservation, provenance, rollback, undo and later edits.

## Additional user requirements

The user requested automated combination of multiple data sources, with high
automation, efficiency and speed. The implementation uses independent-provider
field consensus over current and recent approved observations, two batched RPCs,
partial indexes, stale-write protection and no writes for already-filled records.
Routine high-confidence fills are automatic; exceptions retain the review gates.
See `docs/architecture/merge-gap-policy.md` for the operational contract.
