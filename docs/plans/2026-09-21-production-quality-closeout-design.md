# Production quality closeout design

Date: 2026-09-21

## Goal

Finish every actionable item still visible in the production admin surfaces,
fix the causes behind the four open user-feedback reports, and prove the final
state with a stable production end-to-end run.

## Measured starting state

- 13 enriched, unique, high-confidence news rows await staging review.
- One city suggestion for West, Texas proposes an editorial hook whose supplied
  citation does not substantiate the full claim.
- Sixteen active tags have a primary category junction assignment but a null
  `unified_tags.category_id` mirror.
- Four feedback reports describe event sharing, notification navigation, group
  post presentation, and the meaning of the “Your lines” recommendations.
- All other quality queues, release gates, pipeline errors, entity-type checks,
  deprecated-tag restoration reviews, personality reviews, and publication-role
  invariants are clear.

## Chosen approach

Use the existing guarded review and commit functions for content decisions, and
make narrowly scoped application/database changes for actual defects. Queue
counters are outcomes, not targets: no report is closed until its underlying
behaviour is fixed and verified.

### Tag category mirror

Copy the existing primary junction category into the nullable denormalised
`category_id` for the sixteen affected rows. Reuse the repository's established
per-row resynchronisation pattern so category/search triggers cannot re-enter the
same tuple. Add a regression guard that detects drift older than the normal
reconciliation window without making transient same-day drift a release blocker.

### City review

Reject the West, Texas `editorial_hook` proposal. The attached evidence supports
the city identity and population, but not the full Czech-Texan, resilience, and
2013-explosion editorial claim. Preserve the city; reject only the proposed field
change with an explicit evidence-quality note.

### News staging

For each of the thirteen rows, require a reachable source, non-empty normalized
content, a completed quality verdict, and the existing unique/enriched status.
Approve and commit rows that pass through the existing single-item guarded RPC;
reject or retain any row that fails, with the exact reason recorded. Do not use a
counter-only bulk clear.

### Feedback fixes

1. Event sharing: restore the authenticated table privilege needed for the
   existing RLS-protected participant/profile lookup. RLS remains authoritative;
   the change does not make private profiles public. Add a regression test for
   the complete start-conversation/send-message path.
2. Notification navigation: replace document-level anchor reloads with localized
   client navigation for internal targets, including `/me/contributions`, and
   mark the selected notification read without blocking navigation. Add route and
   interaction tests for the legacy redirect.
3. Group posts: make link/context metadata and the authored message visually and
   semantically distinct, with the authored content beginning on its own line.
   Cover the rendered order and accessible structure.
4. “Your lines”: add concise visible explanatory copy and retain per-card reasons
   based only on actual signals (recent view, interest/tag boost, city proximity,
   or featured ranking). Never imply personalization when no signal exists.

Feedback records are resolved only after the corresponding production behaviour
passes E2E.

## Verification and release

1. Run focused unit/component tests, SQL migration checks, lint, typecheck
   ratchet, and a production build.
2. Validate migrations in a rolled-back production transaction, run Supabase
   security/performance advisors, then push once.
3. Deploy the current clean HEAD to Cloudflare Pages once.
4. Run production E2E for `/admin`, `/admin/quality`, event sharing,
   notification navigation, group-post presentation, “Your lines”, and the
   affected public content routes.
5. Re-query all queue and data-quality invariants and close the four feedback
   records only when their tests are green.

## Rollback

UI changes are reverted with the deployment. Database privilege and data changes
receive an explicit rollback companion: revoke only the added authenticated
profile privilege, and restore queue dispositions/mirror values from captured
pre-change identifiers if validation reveals a regression.
