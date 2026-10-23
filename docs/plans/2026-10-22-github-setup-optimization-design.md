# GitHub setup optimization

Approved by Tobias on 2026-10-22 following the live repository audit.

## Scope

- Patch the DOMPurify dependency implicated in the critical/high/low alerts in tools/person-db and verify its build.
- Extend Dependabot to every maintained npm package, preserving existing major-version exclusions. Group weekly Actions updates so SHA pins stay maintained.
- Resolve each existing external Actions reference to its upstream commit SHA, preserve a version comment, and pin workflows and local composite actions without upgrading their versions.
- Handle merge_group events explicitly in the required Critical paths check, retaining existing pull-request path and migration scope decisions.
- Add missing job timeouts, cancel superseded CI/scan runs, and align ESLint's Node version with .nvmrc. Production deployment jobs must not be cancelled for supersession.
- Require current branches and resolved review conversations while preserving all existing required checks and their app bindings.

## Approach and validation

Use an isolated branch from current origin/main; do not modify the existing working checkout. This targeted pass precedes any broader CI redesign. Validate workflow syntax and shell logic, verify package coverage and action pins, test merge-group/PR path detection, build person-db, and inspect npm audit output. Open a PR with the results; do not merge or deploy automatically.

Read back branch protection after the settings update and compare required checks with the saved original. Retain rollback details without credentials. CI on the PR validates the application checks that cannot be proven by static workflow validation.
