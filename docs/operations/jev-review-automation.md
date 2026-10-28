# Jev Review automation

The owner approved autonomous evidence-backed Review decisions on 28 October 2026. `review-automation` is an internal/admin-authenticated Supabase Edge Function. Jev 1.14.0 evaluates typed decisions across all 41 registered Review sources; application code owns evidence retrieval and mutations.

## Operation

`review_jev` is independently pausable in Admin Automations. Its five-minute cron calls the function with a bounded batch and `dry_run=false`. The Review queue includes Jev status, counts, pause/resume and case blocker details once the frontend change is released. The existing ready/research/blocked filters reflect durable Jev jobs immediately after the database migration.

Production configuration uses the server-side `JEV_API_KEY`, optional `JEV_MODEL` (default `jev-1.14.0`), and existing internal Supabase invocation secrets. Never put a vendor key into a browser build or the repository. A POST with `probe=true` checks authentication using synthetic arithmetic without reading cases. A POST with `dry_run=true` records previews and blockers but does not change source records. Requests require the internal secret, a service token, or an authenticated admin.

## Decision contract

Each active case has a leased durable job and fair scheduling across sources. The worker directly fetches public HTTPS URLs supplied by the case, public record, proposal, related canonical/publisher records and prior research. It tries at most four distinct URLs and retains at most two readable pages, using the existing timeout, size and redirect protections. No Firecrawl key or search API is used. Stored captures and prior research outcomes alone are not live verification; cases without a readable source remain blocked. Private requests, consent and mandatory human publication gates are screened before any external model request. The model receives a projection of public record fields without reporter IDs, author IDs, private submission payloads or contact details.

Jev selects among application-defined candidates, evaluates support for each exact candidate, and checks risk independently. Confidence and selected probability must both meet 0.97, or 0.99 for safety cases. These values are routing thresholds, not proof of factual accuracy. Missing, malformed, conflicting or uncertain answers cannot mutate records. Jev distributions rounded by the API are accepted only within the rounding tolerance; their probabilities are not increased.

Execution locks current inputs, rechecks their snapshot hash, and resolves the original source workflow transactionally. It records the evidence, model, policy, previous/next record projection and a null human actor with explicit AI provenance. Failed application guards roll back data and audit together. Source membership must actually disappear before an action counts as applied. Grouped cases stay open while any member remains unresolved. Temporary service failures retry with backoff and are not counted as evidence blockers. Jobs re-evaluate on changed case fingerprints and periodically recheck blocked evidence.

Proposal-integrity decisions are explicitly narrower than fact verification. For example, rejecting a detector which flags historical uncertainty alone and supplies no replacement preserves the existing qualified wording without certifying the historical claims. A missing link candidate can invalidate a relationship proposal without asserting the named entity does not exist. These decisions use the current proposal snapshot as evidence and label that limited scope.

Jev does not generate replacement prose or discover facts on its own. Source-backed corrections and existing proposals can be applied by dedicated handlers. Missing source-supported replacements, ambiguous canonical identities, conflicting geography, consent, protected human-reviewed fields, and visual judgments remain open. Existing enrichment and identity research workers continue to provide new candidates and trigger re-evaluation. Rechecking an invariant never waives it.

Automatic visual judgment is deliberately disabled: TypeSafe describes its image support as experimental and not ready for production. Those cases retain an explicit visual-review blocker. No experimental image flag is sent.

## Validation

Run:

```sh
node_modules/.bin/tsx --test supabase/functions/review-automation/*.test.ts
node --import tsx --test scripts/ci/jev-review-runtime.test.ts
python3 supabase/tests/isolated/run_jev_review.py
deno check --no-lock --node-modules-dir=none supabase/functions/review-automation/index.ts
node_modules/.bin/vitest run src/components/admin/review-workspace/__tests__/ReviewCaseDetail.test.tsx
```

The isolated PostgreSQL test runs the real migrations and exercises dry runs, stale source refusal, duplicate refusal, source-backed application, atomic rollback, pause between claim/application, machine audit and service permissions. Initial production previews are recorded in the job outcomes; they must not be reported as applied decisions or as a completed backlog cleanup.

Official references: [System One API](https://docs.typesafe.ai/api/system-one.md), [confidence](https://docs.typesafe.ai/confidence.md), [models and context limits](https://docs.typesafe.ai/models.md), [experimental images](https://docs.typesafe.ai/images.md).

Production activation on 28 October 2026: Jev authentication passed against `jev-1.14.0`; the dry-run canary applied no source writes. The first live canary rejected a structurally invalid historical-wording detector proposal, preserved the milestone description, closed the source case, and wrote both the evidence audit and an `actor_kind=automation` decision with no human identity. The shared ledger still requires a real account for `actor_kind=staff`. At that activation, the five-minute `review_jev` cron was enabled and processed bounded batches; this did not establish that all pending cases were resolved. It later auto-paused after three Firecrawl HTTP 402 source-recovery failures. The owner explicitly chose to keep Jev paused during the Firecrawl-free rollout: enabled=false, three failures retained, and no cron row. Deployment and the read-only retrieval probe must preserve that state.

## Firecrawl-free Research retrieval

Source discovery reads only explicit `url`, `source_url` and `website` fields from the existing public context. It never guesses domains or takes URLs from model responses or free text. HTTPS, public-host, credential and port checks run before fetching and on every redirect. A source error cannot certify closure or justify rejection. Jev still judges exact identity and independent action support; database leases, fingerprints, evidence freshness and native publication/consent guards still control execution.

Deployment does not enable `review_jev`, reset its failure counter, recreate its cron job or requeue blocked cases. Keep the existing safety pause until testing and release verification are complete; resume is a separate operator action. Source-free cases require an actual public source to be supplied, rather than another paid search dependency.

Validation on 29 October 2026: all 23 policy, retrieval and actual-handler tests passed, alongside the Deno type check, targeted ESLint and isolated PostgreSQL apply/rollback/pause/privacy regression. Read-only public retrieval smoke tests fetched readable pages from `https://lesbascos.org/arcolan-pau-bearn` (3,982 characters) and `https://linktr.ee/bops.ams` (6,477 characters). These checks establish retrieval only; no live Jev request or production decision was made. Synthetic handler tests cover supported actions, conflicting identity, missing sources, protected cases and provider 402/429/503 backpressure.

### Read-only production retrieval probe

An authenticated POST with `{"source_probe":true,"urls":["https://lesbascos.org/arcolan-pau-bearn","https://linktr.ee/bops.ams"]}` exercises the same direct retrieval in the deployed Edge runtime while Jev is paused. It accepts one to four explicit public HTTPS URLs (maximum 2,048 characters each), retains at most two readable pages and returns only host, character count, retrieval time and aggregate counts. No page text, query strings, raw network errors, private records or API keys appear in the response. Source errors give `success:false` when no page can be read.

This route uses the existing internal/admin authentication. It does not require or read a Jev key and performs no model request, job claim/finish, run logging, registry update, cron modification or requeue. Other decision flags in the request do not change this behavior. Authentication denial, unsafe URLs/redirects, request bounds, response redaction and the absence of DB/model operations are covered by the actual-handler tests. Deployment/probe completion never resumes Jev automatically.
