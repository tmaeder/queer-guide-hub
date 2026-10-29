# Shared Jev runtime

The owner approved the shared integration design and a US$5 total live-validation
budget on 29 October 2026. Implementation lives in the isolated
`codex/jev-integration-20261029` branch. This document tracks the foundation;
domain-wide adoption and sensitive-action validation remain in progress.

Production verification on 29 October: the first two migrations are applied as
`20261029213554` (budget ledger) and `20261029214157` (normalized source URLs),
matching the observed Supabase migration history. The isolated validator is
deployed at version 6. Eight synthetic calls used 4,949 input tokens, charging
207,858 nano-USD (US$0.000207858); no reservations remain unsettled. Anonymous
execution returned HTTP 401, and the three budget RPCs are service-only.

All eight synthetic cases abstained at the initial routing thresholds, including
clear positives and contradictions. Three matched their expected uncertainty
labels. This exposes a calibration/coverage problem; it is not a reason to claim
accuracy or to tune the thresholds against eight cases. Exact requests, model
answers and accounting are in `docs/audits/2026-10-29-jev-runtime-canary.json`.

Source recovery analysis found 283 blocked staging cases with normalized URL
arrays that the projection and reader ignored, including 282 RSS cases. The
bounded projection now preserves up to four safe URL strings; the reader change
is tested locally. A subsequent live count found 284 projectable cases, reflecting
normal queue movement between snapshots. Review version 11 is now deployed with
the budget and recovery changes. The previous deployed files matched main before
replacement. Its authenticated probe and one-case dry run passed; the previously
missing URL yielded one readable page, but support remained insufficient. The
source row hash and case audit count were unchanged. A one-job production canary
also returned HTTP 200 (one blocked, zero applied). Subsequently, 288 blocked
cases were requeued because their existing normalized URL arrays became readable;
no source records were changed or evidence prerequisites waived.

The separate historical accessibility comparison covered 21 rows and 30 claims
(the legacy fixture header incorrectly says 22 rows). It agreed on 28 decisions,
with zero unsupported adoptions and two conservative refusals against the fixture
labels. Reasons agreed on 25 claims. The 18,305 input tokens cost US$0.00076881.
Exact requests and responses are retained in
`docs/audits/2026-10-29-jev-accessibility-validation.json`. These historical labels
do not establish current venue facts or validate broader sensitive automation.

The security advisor reports intentional no-policy informational entries for the
three private ledger tables. They have RLS and no client grants; service-only
RPCs own access. Do not add public policies to remove these notices. See
[Supabase's RLS advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Spending contract

`_shared/jev-client.ts` is the server-only transport for Jev 1.14.0. Before every
HTTP attempt it reserves 65,536 input tokens at the documented $42 per billion
input tokens: 2,752,512 nano-USD, or $0.002752512. It never sends long-context or
experimental-image headers. A different model requires a reviewed price/context
contract. No automatic retries are hidden inside the transport.

The database locks each budget account before checking charged plus reserved
amounts. The `validation-2026-10-29` account has a **lifetime** cap of
5,000,000,000 nano-USD. It does not reset at midnight. Only service-role RPCs
can reserve or settle; public and signed-in users have no ledger access.

The owner separately approved a **US$25/month production cap**. Migration
`20261029215343` provisions the `production` account with a 25,000,000,000 nano-USD
cap per UTC calendar month. Reservations settle against their original month,
including calls that finish after rollover. Validation remains a separate lifetime
US$5 account. On the release snapshot, validation charged US$0.00109305 and
production charged US$0.000859362, with no outstanding reservations.

Valid responses settle at reported input usage. Failed/ambiguous requests charge
the entire reservation. A settlement failure keeps the full reservation counted
and withholds the answer. An orphaned reservation never expires into spendable
credit automatically: reconcile it only against independently verified billing.
No source text, credentials or model response is saved in the budget tables.

## Review worker adoption

The deployed `review-automation` uses `JEV_BUDGET_ACCOUNT` or defaults to
`production` for actual processing. Probes and dry runs always charge the fixed
validation account; callers cannot select a different account in request data.
Key precedence is `JEV_API_KEY`, then `TYPESAFE_API_KEY`;
model precedence is `JEV_MODEL`, then `TYPESAFE_MODEL`, then `jev-1.14.0`.

Exhausted/disabled budgets defer leased jobs and report `budget_deferred`; they
are not evidence blockers or failed factual decisions. Missing configuration or
unavailable accounting stops provider traffic and reports an operational error.
The existing transactional apply, evidence, privacy, pause and lease guards remain.
Deployment must not alter the current enabled state or schedules incidentally.

## Pipeline shadow adoption

`pipeline-review-gate` version 1936 runs bounded public-record faithfulness checks
in shadow mode, including callers through the `review-gate` node alias. It makes
at most four checks among up to sixteen selected batch rows, using the shared production account.
`JEV_PIPELINE_SHADOW=false` disables this addition. Existing approval behavior is
unchanged; a shadow error is returned in the summary without becoming a verdict.
Ordinary dry runs make no shadow calls or writes. An authenticated
`jev_shadow_only=true` canary uses the fixed validation account, with zero source
writes or reconciliation. Budget account names in request data are ignored.

Only explicitly allowed public news/event/marketplace adapters are projected.
The projection separates original adapter text from normalized/generated title,
description and summary, omits author/account/contact metadata, and refuses
oversized text instead of silently truncating qualifications. Other sources are
excluded. This sampling is not complete per-record or per-domain enforcement.

Migration `20261029220732` adds private shadow leases and cached typed answers;
raw source text is not retained there. Evidence/model/question hashes invalidate
cache reuse. Completed results expire after 24 hours; failures defer one hour.
Concurrent workers cannot own the same unchanged snapshot simultaneously. A
failed or expired worker cannot overwrite a newer lease. These judgments certify
fidelity to the supplied adapter snapshot, not current real-world truth.

Twelve fixed synthetic pipeline cases agreed on nine labels: four of four
development probes and five of eight held-out cases. Three abstained, including
one faithful qualified news summary and two contradictions whose subject match
was uncertain. There were no unsupported `supported` verdicts against the labels.
No wording or thresholds were changed after observing these results. The 7,971
input tokens cost US$0.000334782. The small sample supports shadow operation only.
Exact payloads and answers are in `docs/audits/2026-10-29-jev-pipeline-validation.json`.

A one-row real RSS canary returned HTTP 200 and one shadow judgment, with the
before/after source row hash identical. The rollout artifact records the result
and the tags DAG before migration. Migration `20261029220927` inserts the shared
gate between tags deduplication and commit, preserving existing configuration.
Live reconciliation now finds the shared review gate in **all 18 DAGs**, including
aliases and disabled DAGs. Tags still need their own authorized Jev projection.

`docs/audits/2026-10-29-jev-coverage.json` enumerates all 369 automations, 18 DAGs
and 41 Review sources. Uninspected automation implementations explicitly remain
`pending_audit`; presence in this manifest does not count as adoption. Existing
Review registration likewise does not establish positive repair capability.

Migration `20261029221113` extends the existing admin-only Review status RPC with
the shared monthly production cap, charged/reserved amounts and deferral state.
The Review UI changes are repository source work and need the normal frontend
release. They show actual blocker/retry reasons, budget usage, and distinguish an
unchanged blocked case from an operational retry.

## Primary marketplace relevance pilot

`marketplace-relevance` version 390 uses typed Jev questions for the evaluated
`ohmyfantasy` and `autostraddle` public adapters, at most four attempts per run.
`JEV_MARKETPLACE_RELEVANCE=false` restores the legacy-provider path. Other sources
retain their existing provider; source curations remain explicit code inputs.
No brand ownership or personal identity is inferred from a name. Product evidence
can establish relevance independently of an ownership claim; affiliation alone
requires authorization. Medical, legal, adult and unresolved cases stay in review.

Eight Nouls describe product signals and source claims; code routes their results.
The maximum product-signal score is not a calibrated probability of a union.
Starting 0.7/0.3 bands are unchanged by evaluation. Twenty-four fixed synthetic
cases matched all routing labels (eight development, sixteen held out). Twenty
captured public records matched sixteen labels; four deferred to review. All
sixteen automated routes agreed with their labels. Related publisher templates
and a small sample limit what these results establish. Exact payloads and answers
are in the product validation audit files; no sensitive canonical fields are
certified by those labels.

Normal Jev processing charges the shared monthly production account; dry runs
charge the fixed lifetime validation account. The legacy Cloudflare unit allowance
remains separate. `relevance_jev` events do not consume that legacy allowance.
Provider/accounting failures stop Jev traffic without falling through to another
provider; budget deferral remains a healthy queued outcome. Attempts and completed
evaluations are separate counters. Routine declines are successful processing,
with `rejected` separate from operational `items_failed`.

Migration `20261029225917` permits explicit null only for review admission, which
cannot pass the native positive-Boolean commit guard. `20261029230831` filters
staff-reviewed sources before LIMIT and rechecks staff decisions during atomic
application. Source-version comparison prevents stale writes; classification and
event are transactional. New records include the exact request hash, source version,
model/questions/policy and typed answers, linking to settled budget reservations.
Concurrent inference can still produce a budgeted duplicate attempt; compare-and-set
allows only one application. A reusable inference lease is remaining work.

Migration `20261029231857` guards the alternate SQL propagation cron: it considers
the latest classification before eligibility, requires completed approved positive
evidence with numeric score at least 0.7, fills only an empty canonical score, and
preserves publication status. A newer unresolved result cannot fall back to an
older positive. The registered command and live cron were updated together without
changing enabled state or schedule.

A live one-row dry run left its staging version unchanged. The write canary
classified one pending item as a routine decline with a `relevance_jev` event;
scheduled runs brought the count to thirteen by 23:33 UTC. Review and the restored
commit drain remained healthy with zero failure streaks. The production account
charged US$0.031286934 and validation US$0.003438834 at that snapshot, with no
outstanding reservations. See `docs/audits/2026-10-29-jev-product-primary-rollout.json`.

Audit exports must omit credentials, lease tokens and private account identifiers.
GitGuardian identified an unnecessary completed shadow-lease UUID in an early
rollout export. It was removed from the draft branch history and invalidated in
the completed server record; no provider API key was exposed. The artifact
regression reports forbidden key locations without printing their values.

## Runtime validation

`jev-validation` has internal-secret/admin authentication, no scheduler, no
queue claims, and no source-table writes. It accepts only one to four unique
fixture names and an optional boolean `execute`. Preview is the default and
returns the exact payload without reading a vendor key or spending funds.

```json
{"fixtures":["event-supported","event-wrong-activity","namesake-place"],"execute":false}
```

`execute=true` uses the server's existing Jev key and the fixed lifetime validation
account. Field fixtures are synthetic, including the accessibility, ownership and
admission-policy examples; historical accessibility and synthetic pipeline
fixtures are also available. Labels are not sent to Jev. Responses include raw typed
judgments, model/usage and agreement with fixture labels. Agreement on this small
synthetic set is a transport/policy canary; it does not validate production accuracy,
sensitive-action eligibility or completion of the overall integration.

The shared field-evidence catalog separates exact subject identity, explicit
support and explicit contradiction into independent Nouls. Code returns supported,
contradicted or uncertain, with separate missing-evidence/authorization conditions.
It cannot generate missing values or grant consent. Ordinary/sensitive thresholds
start at 0.97/0.99 for compatibility with Review's conservative routing; they are
not measured precision guarantees.

## Verification

```sh
node --import tsx --test scripts/ci/jev-review-runtime.test.ts scripts/ci/jev-validation-runtime.test.ts scripts/ci/jev-pipeline-gate-runtime.test.ts supabase/functions/_shared/jev-client.test.ts supabase/functions/_shared/jev-evidence-judgments.test.ts supabase/functions/_shared/jev-pipeline-judgments.test.ts
python3 supabase/tests/isolated/run_jev_budget.py
python3 supabase/tests/isolated/run_jev_review.py
deno check --no-lock --node-modules-dir=none supabase/functions/jev-validation/index.ts supabase/functions/review-automation/index.ts
```

The budget regression applies the actual migration in isolated PostgreSQL and
exercises concurrent requests, hard-cap refusal, reservation replay refusal,
unknown usage, idempotent settlement, disabled accounts, UTC rollover and ACLs.
The runtime tests exercise the actual handlers with only service/network
boundaries replaced, including denial before inference and settlement failure.

## Marketplace repair verification

Marketplace investigation: migration `20261029222136` materializes the taxonomy
classifiers' intermediate results once. The actual production function snapshot
returned identical group/fine values for 78 isolated cases; the batch improved
from 11.2 s to 0.38 s locally. Live read-only checks passed, and a one-row native
commit canary completed in 235 ms with every database change rolled back. A
20-limit rollback canary found only two currently eligible rows; both updated
successfully in 2.73 s with matching before/after staging hashes. The larger
approved staging backlog still requires classification; its size is not the
commit-ready count. A further rollback canary passed the positive-direction guard
in 275 ms. The drain was then resumed at its existing hourly schedule, with a
maximum of 50 records per invocation and accurate success/failure counts. A live
two-row canary committed two approved updates with zero failures and zero remaining
commit-ready rows. No unrelated paused job was resumed.

The legacy relevance worker previously admitted a negative relevance answer when
its confidence was high. Version 386 and migration `20261029223309` now validate
typed Booleans, separate negative/uncertain results, save classification and audit
atomically against the source version, and require a positive Boolean at the native
SQL commit boundary. Migration `20261029223724` bounds and corrects the drain's
outcome counts. Primary typed Jev is now active only for the two evaluated adapters;
other sources retain Cloudflare. A population of 341 already-committed staging rows carries
that negative label; re-evaluate it rather than treating the label as proof to
unpublish. The fixture/regression and rollout measurements are recorded in
`docs/audits/2026-10-29-jev-marketplace-drain.json`.

With an isolated `npm ci --ignore-scripts` dependency installation, the frontend
typecheck ratchet passes: 660 existing errors, none new against the 772-error
baseline. Do not rewrite the baseline to hide errors from a shared dependency
symlink. Targeted runtime tests, the three Review status component tests, Deno
checks and the isolated database contract tests pass.

## Remaining implementation

Evidence discovery/repair across the main blocker families; per-field positive
correction handlers; marketplace and other pipeline adoption; guards for SQL/direct
mutation routes; stalled-drain repairs; domain/automation coverage reconciliation;
held-out evaluation and individually validated sensitive actions; deployment and
measured improvement in quality and queue age.
