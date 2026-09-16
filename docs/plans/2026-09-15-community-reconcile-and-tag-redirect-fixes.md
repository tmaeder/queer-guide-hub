# Community reconciliation and tag redirect fixes

## Scope

Fix the three defects found during review without changing the surrounding feature set:

1. Rank only known successful staging dispositions ahead of rejection so an unhandled retry cannot mask an earlier publication.
2. Require a successful staging row to point at an existing target before approving the associated community submission.
3. Keep place-tag redirects from rendering a false not-found state or starting the gated-tag lookup while navigation is pending.

## Implementation

- Amend the unapplied `99000101100000_community_submission_status_reconcile.sql` migration; the linked production migration history has no matching reconciliation migration.
- Express success precedence explicitly and validate target existence for each supported target table.
- Extend the migration-structure tests with guards for ranking and target validation.
- Give `TagDetail` a neutral redirect branch, exclude redirects from the gated lookup, and cover the behavior in its component tests.

## Verification

- Parse the changed SQL.
- Run the focused migration and `TagDetail` tests.
- Run changed-file lint, the typecheck ratchet, and the repository routing check.
