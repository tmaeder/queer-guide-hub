# GitHub setup audit — 2026-10-22

Repository: [tmaeder/queer-guide-hub](https://github.com/tmaeder/queer-guide-hub).
Scope: this repository, its GitHub settings, workflow configuration, and dependency coverage. Account-wide settings and other repositories were not audited.

## Settings applied on GitHub

The owner approved this targeted pass in chat. `main` now requires branches to be up to date and review conversations to be resolved. The settings were read back after the update: all 12 required status checks and their GitHub App bindings, admin enforcement, review requirements, force-push/deletion restrictions, and other branch-protection fields were preserved.

To reverse these two changes, disable **Require branches to be up to date before merging** and **Require conversation resolution before merging** in the existing `main` protection rule. Keep its other settings intact.

Existing strengths: automatic deletion of merged branches, default read-only workflow token permissions, Dependabot security updates, secret scanning and push protection. The initial API audit returned no open CodeQL or secret-scanning alerts. These are point-in-time results, not a claim that the application has no vulnerabilities.

## Changes proposed in this PR

- Pin all 171 external Action references across 48 workflows and the Playwright composite action to full commit SHAs resolved and checked through the upstream repositories' Git APIs. Keep the existing version/branch as a comment. This fixes the selected Action code; it does not freeze runner images, packages downloaded at runtime, or every transitive dependency.
- Schedule grouped weekly Actions updates. Extend npm Dependabot coverage from 10 to all 18 tracked package directories, adding infrastructure, the redirect SDK, person-db, and five worker packages. Preserve existing major-version exclusions.
- Set explicit timeouts on 33 previously unbounded jobs; all 71 runner jobs now have a timeout. Retain existing measured budgets.
- Cancel superseded runs of CodeQL, ESLint reporting, bundle checks, and extension CI. Serialize worker deployments and stop cancelling active mirror deployments when another run starts.
- Use `.nvmrc` for the ESLint scanning job, replacing its Node 20 setting with the project's Node 22 version.
- Fix `Critical paths` change detection on `merge_group`: fetch and compare against the event's base SHA instead of querying a nonexistent PR number. Preserve full-app, migration-only, and irrelevant-diff scope decisions. Invalid base SHAs, failed fetches, and failed PR API calls fail the job.
- Update person-db's transitive Nano ID lockfile entry from 3.3.16 to 3.3.20 after npm audit reported [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8).

The initial GitHub alert query reported three DOMPurify advisories against 3.4.16. Current `main` already contains DOMPurify 3.4.17 from [PR #4560](https://github.com/tmaeder/queer-guide-hub/pull/4560); all three advisories name 3.4.17 as their first fixed version. This pass verifies that fix rather than duplicating it. GitHub's alert listing had not yet reflected the patched lockfile when queried.

## Validation

- Actionlint 1.7.12: all 48 workflows pass. Optional ShellCheck/Pyflakes integrations were disabled; this is workflow validation, not a full shell/Python audit.
- Configuration assertions: all 18 npm package directories covered exactly once, all 171 external Actions pinned, all 71 runner jobs bounded.
- Semantic comparison against the base: workflow triggers, job names, permissions, existing timeout values, and unrelated configuration preserved.
- Nine change-detection regression scenarios: app/migration/docs diffs on both PR and merge-group events; missing and unavailable merge-group bases; failed PR API call. Merge-group tests use real shallow Git clones and fetches against disposable local repositories.
- person-db: clean lockfile installation, TypeScript and Vite production build; npm audit checked after the Nano ID update. The build retains its existing large-chunk warning.
- Staged secret guard and `git diff --check` run before commit.

The complete application suite and GitHub-hosted event execution remain subject to PR CI. Changes to scheduled and deployment workflows become active when merged; this pass does not merge or deploy the PR.

## Follow-up decisions

A broader CI redesign should measure runner time and distinguish production health checks from change-specific tests before changing gates. Existing incidents document why path filters, deployment cancellation, and remote schema checks need care. The current pass preserves those gates and the root toolchain's compatibility exclusions.

GitHub references: [secure use of Actions](https://docs.github.com/en/actions/reference/security/secure-use), [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## Snapshot and CI follow-up

The initial local-DB E2E failure exposed an ordering bug: independent snapshot and E2E workflows raced, and another PR's cache was inaccessible. Snapshot production is now a reusable workflow called as an explicit prerequisite of local E2E. Its output supplies the exact cache key, including the run attempt, and restore fails if that key is missing. The independent PR producer trigger was removed to avoid duplicate production reads; nightly and manual main-branch production remain available. A main-branch bootstrap was dispatched to seed the shared cache.

The initial migration gate also identified production-applied version `20261022190025`. Its original file was recovered unchanged from PR #4574 (`fix/review-worklist-refresh-ledger-20261022`) and included in this PR. No migration was reapplied to production.

The first full local E2E run restored and loaded its snapshot with zero schema errors, then exposed missing fixture data: arbitrary capped samples omitted named public venue/tag/org routes, and an anonymous export correctly omitted private archived/review records. Sampling now prioritizes static browser routes and their parent cities while retaining the same anonymous role and row cap. Local-only synthetic archived/review records and migration-defined review configuration supply non-degenerate admin cases without exporting private production records. A loopback-only RPC preflight catches missing fixtures before browser retries. Versioned daily encrypted caches include the export code, workflow and fixture-query hash so compatible PR updates can reuse a snapshot; scheduled/manual refreshes create a fresh run/attempt-specific key. Consumers verify the exact returned cache key.

The export also sets the anonymous PostgREST request claim (`request.jwt.claims` with only `role: anon`). Setting the SQL role alone left `auth.role()` empty, so public gated-read policies omitted ordinary glossary terms. Read-only checks confirmed the three required public terms are visible with the anonymous request claim. This does not grant authenticated or service-role access.

Sampling also retains the complete public tag reference sets for STI and substance matrices, stratifies marketplace listings across their eligible category groups, and prioritizes upcoming Pride/festival events with their parent cities. An archived synthetic organisation covers the current legacy admin-venues redirect to the organisations directory. The local preflight exercises the actual archived-organisation endpoint and public safety/marketplace RPCs before the browser suite. Read-only anonymous queries validated the generated sampling clauses against the source data before export.

Synchronizing with main preserves its full anonymous glossary export, the four fixed static review configuration tables, and the existing 45-minute local E2E budget. Private queue records remain excluded from export. The combined workflow uses the fail-fast synthetic fixture setup rather than also running the older seed that archives arbitrary sampled organisations. Exact cache-key wiring and explicit reusable-workflow secrets are retained.
