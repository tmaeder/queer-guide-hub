# Prevent personality editorial regressions

The user explicitly requested mechanisms to prevent missing community explanations, unsupported identity associations and mixed-language prose from recurring. Implement these alongside the remaining catalog cleanup, without another approval checkpoint.

## Publication boundary

New records default to draft. A database publication guard, deferred until transaction commit, requires a nonempty explanation, a valid connection category and field-specific verified evidence for the actual values being published. New public records must have reviewed canonical prose; updates to existing public records must reverify changed editorial fields. Untouched legacy records and unrelated view-count or operational updates remain available during cleanup.

Bind verified claims to the reviewed field value, exact identity snapshot (name, Wikidata ID and birth date), reviewed source URL, reviewer and canonical language. A changed name or Wikidata binding cannot inherit the previous person's evidence. Public editorial projection must ignore stale approvals. Existing verified claims receive mechanical value/identity snapshots as a migration baseline, without upgrading pending/rejected claims or describing unknown legacy language as newly reviewed.

The database checks approval completeness and snapshot equality. Editorial review still establishes whether the source supports the fact; occupation and fictional roles cannot establish sexuality or gender identity. Automated imports and enrichment remain proposals, not evidence approval.

Service-role automation cannot self-approve claims or publish personality translations. Changes invalidate old approvals permanently until another review; reverting text, identity or URLs cannot silently reactivate proof. Claim ownership and field identifiers cannot be reassigned while verified. Revoking proof must leave replacement evidence or draft the profile within the same transaction. A batch rollback can restore only approvals invalidated by its own publication, never a later human revocation.

## Language and translation boundary

Use the shared deterministic prose checks before review, including mixed-script words and confident wrong-language sentences. Keep proper names and work titles intact, with explicit reviewed exceptions for false positives. Require explicit reviewed translation metadata and a canonical source snapshot when publishing personality translations. Editing canonical text must draft stale translations instead of leaving an obsolete translation public. Draft proposals stay editable.

The reviewed-batch compiler must populate the new approval fields atomically, preserve them in exact rollback snapshots, and retain compatibility when reading already frozen artifacts. Apply the prevention migration only after the currently frozen compiler-v2 batch has completed its one publication and deployment.

## Regression checks and monitoring

Exercise the actual SQL guards: reject missing explanations, missing or stale evidence, identity swaps, unreviewed publication, wrong-language prose and stale translations; allow a reviewed atomic batch and unrelated operational edits. Test publication and evidence creation in either transaction order because the guard is deferred. Keep legacy rollback and unrelated-edit protections.

Extend the read-only audit to compare raw public rows with their bounded anonymous editorial projection. A scheduled audit should detect new public records without explanations or verified evidence and new language issues. During cleanup, ratchet against an explicit legacy baseline; remove baseline exceptions as profiles are repaired, ending with a zero-regression catalog check.

After the final production release, run the full user-requested end-to-end test on production, including public directory/profile flows, languages and responsive layouts. Test rejection paths in rolled-back database transactions, without exposing synthetic public records or sending reports/messages.
