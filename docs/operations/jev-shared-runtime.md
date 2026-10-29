# Shared Jev runtime

The owner approved the shared integration design and a US$5 total live-validation
budget on 29 October 2026. Implementation lives in the isolated
`codex/jev-integration-20261029` branch. This document tracks the foundation;
domain-wide adoption and sensitive-action validation remain in progress.

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

Valid responses settle at reported input usage. Failed/ambiguous requests charge
the entire reservation. A settlement failure keeps the full reservation counted
and withholds the answer. An orphaned reservation never expires into spendable
credit automatically: reconcile it only against independently verified billing.
No source text, credentials or model response is saved in the budget tables.

## Review worker adoption

The updated `review-automation` uses this transport with `JEV_BUDGET_ACCOUNT`.
Provision a separate production account with an explicitly chosen cap and period
before deploying that worker. Do not use the validation account for unattended
production Review. Key precedence is `JEV_API_KEY`, then `TYPESAFE_API_KEY`;
model precedence is `JEV_MODEL`, then `TYPESAFE_MODEL`, then `jev-1.14.0`.

Exhausted/disabled budgets defer leased jobs and report `budget_deferred`; they
are not evidence blockers or failed factual decisions. Missing configuration or
unavailable accounting stops provider traffic and reports an operational error.
The existing transactional apply, evidence, privacy, pause and lease guards remain.
Deployment must not alter the current enabled state or schedules incidentally.

## Synthetic runtime validation

`jev-validation` has internal-secret/admin authentication, no scheduler, no
queue claims, and no source-table writes. It accepts only one to four unique
fixture names and an optional boolean `execute`. Preview is the default and
returns the exact payload without reading a vendor key or spending funds.

```json
{"fixtures":["event-supported","event-wrong-activity","namesake-place"],"execute":false}
```

`execute=true` uses the server's existing Jev key and the fixed lifetime validation
account. Fixtures are synthetic, including the accessibility, ownership and
admission-policy examples. Labels are not sent to Jev. Responses include raw typed
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
node --import tsx --test scripts/ci/jev-review-runtime.test.ts scripts/ci/jev-validation-runtime.test.ts supabase/functions/_shared/jev-client.test.ts supabase/functions/_shared/jev-evidence-judgments.test.ts
python3 supabase/tests/isolated/run_jev_budget.py
python3 supabase/tests/isolated/run_jev_review.py
deno check --no-lock --node-modules-dir=none supabase/functions/jev-validation/index.ts supabase/functions/review-automation/index.ts
```

The budget regression applies the actual migration in isolated PostgreSQL and
exercises concurrent requests, hard-cap refusal, reservation replay refusal,
unknown usage, idempotent settlement, disabled accounts, UTC rollover and ACLs.
The runtime tests exercise the actual handlers with only service/network
boundaries replaced, including denial before inference and settlement failure.

## Remaining implementation

Evidence discovery/repair across the main blocker families; per-field positive
correction handlers; marketplace and other pipeline adoption; guards for SQL/direct
mutation routes; stalled-drain repairs; domain/automation coverage reconciliation;
held-out evaluation and individually validated sensitive actions; deployment and
measured improvement in quality and queue age.
