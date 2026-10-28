# Jev Review automation

The owner approved autonomous evidence-backed Review decisions on 28 October 2026. `review-automation` is an internal/admin-authenticated Supabase Edge Function. Jev 1.14.0 evaluates typed decisions across all 41 registered Review sources; application code owns evidence retrieval and mutations.

## Operation

`review_jev` is independently pausable in Admin Automations. Its five-minute cron calls the function with a bounded batch and `dry_run=false`. The Review queue includes Jev status, counts, pause/resume and case blocker details once the frontend change is released. The existing ready/research/blocked filters reflect durable Jev jobs immediately after the database migration.

Production configuration uses the server-side `JEV_API_KEY`, optional `JEV_MODEL` (default `jev-1.14.0`), existing `FIRECRAWL_API_KEY`, and existing internal Supabase invocation secrets. Never put a vendor key into a browser build or the repository. A POST with `probe=true` checks authentication using synthetic arithmetic without reading cases. A POST with `dry_run=true` records previews and blockers but does not change source records. Requests require the internal secret, a service token, or an authenticated admin.

## Decision contract

Each active case has a leased durable job and fair scheduling across sources. The worker fetches at most two source pages; bounded Firecrawl search can recover missing source URLs. Search snippets alone are not verification. Private requests, consent and mandatory human publication gates are screened before any external model request. The model receives a projection of public record fields without reporter IDs, author IDs, private submission payloads or contact details.

Jev selects among application-defined candidates, evaluates support for each exact candidate, and checks risk independently. Confidence and selected probability must both meet 0.97, or 0.99 for safety cases. These values are routing thresholds, not proof of factual accuracy. Missing, malformed, conflicting or uncertain answers cannot mutate records. Jev distributions rounded by the API are accepted only within the rounding tolerance; their probabilities are not increased.

Execution locks current inputs, rechecks their snapshot hash, and resolves the original source workflow transactionally. It records the evidence, model, policy, previous/next record projection and a null human actor with explicit AI provenance. Failed application guards roll back data and audit together. Source membership must actually disappear before an action counts as applied. Grouped cases stay open while any member remains unresolved. Temporary service failures retry with backoff and are not counted as evidence blockers. Jobs re-evaluate on changed case fingerprints and periodically recheck blocked evidence.

Proposal-integrity decisions are explicitly narrower than fact verification. For example, rejecting a detector which flags historical uncertainty alone and supplies no replacement preserves the existing qualified wording without certifying the historical claims. A missing link candidate can invalidate a relationship proposal without asserting the named entity does not exist. These decisions use the current proposal snapshot as evidence and label that limited scope.

Jev does not generate replacement prose or discover facts on its own. Source-backed corrections and existing proposals can be applied by dedicated handlers. Missing source-supported replacements, ambiguous canonical identities, conflicting geography, consent, protected human-reviewed fields, and visual judgments remain open. Existing enrichment and identity research workers continue to provide new candidates and trigger re-evaluation. Rechecking an invariant never waives it.

Automatic visual judgment is deliberately disabled: TypeSafe describes its image support as experimental and not ready for production. Those cases retain an explicit visual-review blocker. No experimental image flag is sent.

## Validation

Run:

```sh
node_modules/.bin/tsx --test supabase/functions/review-automation/*.test.ts
python3 supabase/tests/isolated/run_jev_review.py
deno check --no-lock --node-modules-dir=none supabase/functions/review-automation/index.ts
node_modules/.bin/vitest run src/components/admin/review-workspace/__tests__/ReviewCaseDetail.test.tsx
```

The isolated PostgreSQL test runs the real migrations and exercises dry runs, stale source refusal, duplicate refusal, source-backed application, atomic rollback, pause between claim/application, machine audit and service permissions. Initial production previews are recorded in the job outcomes; they must not be reported as applied decisions or as a completed backlog cleanup.

Official references: [System One API](https://docs.typesafe.ai/api/system-one.md), [confidence](https://docs.typesafe.ai/confidence.md), [models and context limits](https://docs.typesafe.ai/models.md), [experimental images](https://docs.typesafe.ai/images.md).

Production activation on 28 October 2026: Jev authentication passed against `jev-1.14.0`; the dry-run canary applied no source writes. The first live canary rejected a structurally invalid historical-wording detector proposal, preserved the milestone description, closed the source case, and wrote both the evidence audit and an `actor_kind=automation` decision with no human identity. The shared ledger still requires a real account for `actor_kind=staff`. The five-minute `review_jev` cron is enabled; the remaining backlog continues in bounded batches. This is not a claim that all pending cases have already been resolved.
