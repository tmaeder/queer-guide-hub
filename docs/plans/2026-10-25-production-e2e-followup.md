# Production E2E follow-up

The user authorized completing the remaining release work autonomously and testing production afterwards. Current main `eca0be2ab` and its production deployment pass CI, including the previously failing public accessibility gate.

The October 25 nightly failed two assertions against data that has intentionally changed. Preserve the assertions and update their fixtures: the approved `99991792861452` glossary merge makes `gray-asexuality` the active target for `grey-asexual`; Hirscheneck's geocoded records belong to Basel, while Freiburger Lesbenfilmtage remains in Freiburg. Read-only production queries confirmed both. Keep nonempty anonymous reads, geographic bounds, city equality, alias approval, and active-target assertions. Do not alter production data to satisfy obsolete fixtures.

Validate both affected specifications against production, run the PR checks, merge after they pass, verify deployment, and finish with the full authenticated production Playwright suite. Investigate any remaining genuine failures without weakening gates.

During validation, production acquired two migration records absent from main. Recover `20261025175845` and `20261025175909` from the existing security-advisor PR. Both files match `schema_migrations.statements[1]` byte-for-byte (MD5 `9c29ab86af5a24dfd23afa97e9aa85b9` and `9bb9ad608a254735f6167d94ebf17bbe`). Refresh the shared snapshot to include these already-applied migrations and their current schema; do not reapply them to production or relax their guards to accommodate an obsolete CI snapshot.
