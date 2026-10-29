# Jev integration: analysis and proposed design
29 October 2026. Approved design; implementation in progress.

## Scope and authorization
The objective is Jev integration across automations, pipelines and Review, improving quality and timeliness while minimizing intervention. The owner selected broader automation, including sensitive cases after validation.

Live registry enumeration is exhaustive. Code inspection covers shared execution boundaries and representative handlers; auditing and adopting every handler is still implementation work. Read-only queries ran over several minutes and are not a transactionally consistent snapshot. No model inference, queue claims, data/configuration changes or deployments occurred during discovery.

## Sources and workspace
- Live Supabase project xqeacpakadqfxjxjcewc: automations, DAGs/node aliases, current and legacy review registries, aggregate jobs/cases/audits, staging states and selected failure logs.
- Refetched origin/main 20b1da294: review-automation policy/worker/retrieval, review-research, Jev transactional migrations, pipeline review/commit/executor, enrichment and classification boundaries.
- The repo checkout is an older branch, fix/retire-awin-dag-node, with substantial unrelated uncommitted work. Its marketplace Jev pilot is additional work, not the production architecture. Implement in an isolated checkout of current main and import only reviewed pilot components where useful.
- Official TypeSafe index/API/models: https://docs.typesafe.ai/llms.txt, https://docs.typesafe.ai/api/system-one.md, https://docs.typesafe.ai/models.md. Firecrawl was unavailable because its credits are exhausted; alternative public documentation retrieval succeeded.
- Supabase changelog: https://supabase.com/changelog.md. Review of relevant recent changes found a TLS cipher retirement scheduled for 10 November 2026; current runtime fetch does not need legacy cipher handling.

## Verified baseline
| Measure | Observed |
| --- | ---: |
| Registered / enabled automations | 369 / 330 |
| Auto-paused automations | 8 |
| Defined / enabled DAGs | 18 / 16 |
| Current Review sources / legacy triage sources | 41 / 17 |
| Active grouped Review cases | 5,073 |
| Raw pending generic review rows | 19,133 |
| Jev queued / blocked / retry jobs | 3,632 / 1,774 / 17 |
| Total applied Jev jobs and audit entries | 10 |
| Jev examined / applied in preceding 24 hours | 1,665 / 3 |
| Jev runs / error runs in preceding 24 hours | 208 / 3 |

Raw review rows, grouped cases, jobs and audits are different populations. Do not add them together. The observed applied/examined ratio is approximately 0.18%; this is operational yield, not model accuracy or unique-case resolution.

Live review_jev is enabled, has zero consecutive failures and an active cron at 4-59/5 * * * *. The operations runbook's statement that it remains paused is stale. Preserve the actual current state during changes; never resume or pause it as an incidental deployment effect.

## Findings
1. Jev already evaluates 41 Review sources. Reuse leased jobs, fingerprints, source locks, transactional application, before/after audit, explicit machine attribution and pause controls.
2. Missing evidence dominates the blocked jobs. Missing URL=711, missing source=661, unavailable source=52: 1,424/1,774, approximately 80%. Other blockers: insufficient confidence=183, conflicting identity=151, protected review=15 and mandatory human publication=1. Greater authority cannot establish missing facts.
3. Existing source recovery follows public URLs already in projected context, with four attempts and two readable pages maximum. It cannot discover a missing URL or construct a missing source-backed correction. Review research specializes in city/venue work.
4. Policy registration does not imply positive autonomous repair. Many sources are private/human-only; generic rechecks refuse unresolved invariants; suggestions are often reject-only. Staging approval depends on the news publication gate. Add specific correction handlers rather than generic approval.
5. Jev is not a shared upstream decision layer. Generative enrichment, relevance, completeness and source trust still influence pipeline approvals. Add evidence-supported judgments before commit as well as during Review repair.
6. Tags ingestion is the only enabled DAG without the shared review-gate node. The marketplace aliases resolve to the canonical functions. Also inspect dedicated SQL drains and direct writers: a node in a DAG cannot guard an alternate mutation path.
7. Timeliness has non-model failures. There are 3,944 marketplace rows already review/validation-approved and dedup-unique but enrichment-pending, plus 60 approved merge candidates. The commit drain paused after taxonomy-trigger SQL timeouts. Do not bypass enrichment or dedup to clear them.
8. Failure logs also show Wikidata maxlag/cirrus pressure, Display Magazin/AWIN 404s, GayOut Firecrawl 402, invalid generated marketplace descriptions and a city quality SQL timeout. Retry transient pressure; repair structural problems; preserve useful partial progress.
9. Existing Review checks confidence and selected probability at 0.97, or 0.99 for safety, in TypeScript and SQL. These are routing thresholds, not validated correctness guarantees. Calibrate against labeled held-out cases before changing them.
10. Jev 1.14.0 evaluates supplied text/candidates. Keep prose generation in generators and arithmetic, dates, geospatial calculations, indexing, scheduling, retention and delivery in code. Experimental visual judgments need separate validation.
11. Retrieval has size/redirect/time limits. The shared SSRF guard explicitly does not resolve DNS; broader source discovery needs resolved-destination protection or a restricted fetching boundary.
12. The inspected worker has bounded batches/timeouts but no cumulative Jev budget reservation in its call path. Add durable usage accounting and caps before expanding volume.

## Additional boundary checks
Read-only follow-up confirmed three implementation details on origin/main:

- `_shared/accessibility-claim-check.ts` is a second reusable Jev experiment, beyond the marketplace pilot. It has atomic support/contradiction questions, deterministic quote grounding, an explicit unsettled outcome and 24 accessibility claims. Its comparison harness uses 22 hand-read queue examples, request-hash caching and a cap on actual HTTP attempts, including retries. Production handlers do not import it. Reuse its question/fixture structure, but add a separate held-out set before treating it as validated sensitive automation.
- `_shared/llm-budget.ts` counts per-caller units and deliberately returns `allowed: true, degraded: true` when its RPC fails. That fallback cannot enforce an approved dollar cap. Jev expansion needs a fail-closed reservation path with explicit budget deferral, without changing unrelated callers' established semantics.
- The legacy path in `pipeline-commit/index.ts` selects validation-approved rows with null/auto/approved review state and includes pending/duplicate/merge-candidate dedup states. These predicates do not establish a fresh Jev judgment. This is a verified alternate boundary to inspect and guard per entity type; selection alone does not prove an unsafe write, because downstream matching and database constraints also participate.

No live requests, code changes or production changes were made during these additional checks.

## Approaches
| Approach | Benefit | Trade-off |
| --- | --- | --- |
| Extend Review only | Smallest change | Upstream and direct writers continue producing avoidable review work |
| Shared typed judgment layer with existing Review and repair workers — recommended | Consistent checks at intake, mutation and repair boundaries | Requires handler adoption, budgets and database/Edge contract tests |
| Replace all AI and operational steps with Jev | Superficially uniform integration | Jev cannot generate missing facts/prose; probabilistic control-plane operations add failure modes |

## Proposed architecture
### Shared typed judgments
A server-only transport and versioned question catalog serve all relevant consumers. Initially pin jev-1.14.0. Bundle narrow independent questions about the same state: exact identity, support for the exact proposed value, explicit contradiction, category support and content relevance. Pair closed-set selection with a separate supported/no-match question. Code owns action eligibility and the complete uncertainty/error truth table.

Unify server-side JEV_API_KEY/TYPESAFE_API_KEY configuration with explicit precedence. Never expose credentials or allow request bodies to choose arbitrary provider endpoints. Record actual model, policy/questions, usage, latency and permitted payload identity. Retain exact evaluation payloads only in access-controlled artifacts with retention limits.

### Evidence and repair
Every candidate carries origin, public URL, retrieval time, supporting passage, identity/occurrence context and evidence hash. Freshness depends on field: current operation and an event occurrence differ from historical evidence.

Try canonical operator/publisher sources and structured identifiers first. Add bounded, auditable domain-specific discovery adapters when URLs are missing; verify retrieved identity. Never guess domains or certify facts from search snippets.

Cache sources within freshness limits. Cache judgments by actual model, question/policy and the complete state/evidence hash. Changed evidence, fields or candidates invalidate results.

Existing generators/extractors propose missing values. Jev verifies each exact candidate against independent source text. Supported candidates reach dedicated transactional handlers; conflicts trigger bounded additional research or a precise blocker. Unchanged blocked inputs do not incur endless new inference.

### Pipelines and automation adoption
Add shared checks for classification/relevance, tags, entity matching and generated-output verification. Preserve structural validation and hard invariants. Add the missing tags gate.

Inventory all mutation paths: node aliases, SQL commit RPCs, cron drains, direct backfills and manual/service endpoints. Enforce current evidence at mutation boundaries, not only in the UI or DAG. Use per-domain off/shadow/enforce modes with explicit treatment of historical data.

Use leased jobs, fair domain scheduling, bounded concurrency, changed-input checks, backoff and per-domain/global switches. Deterministic operational jobs continue to use code; model coverage means an explicit eligibility decision for every registry row, not an inference call in every job.

### Sensitive automation
The owner wants sensitive actions automated after validation. Replace broad queue-wide exclusions with specific action/field eligibility backed by its own evaluation set and transactional handler.

Candidate examples: preserve a sourced legal qualification; apply operator-published accessibility facts without turning unknown into accessible; repair a cited safety-note qualification; preserve a public self-description from an authorized source. Match jurisdiction, locality, exact identity and source independence.

Consent, private access and disclosure authorization remain explicit prerequisites. Jev cannot manufacture authorization. Automate where required consent/evidence already exists; otherwise expose the exact missing prerequisite. Protect human-reviewed values unless the authorized correction workflow permits the particular change.

Use independent corroboration appropriate to the field, conflict checks, stronger audit and measured precision. Two syndicated pages do not count as independent confirmation. Expand sensitive capabilities individually after validation; no blanket sensitive-queue switch.

### Operations and cost
Repair taxonomy/commit SQL timeouts separately. Preserve partial progress for generated-output failures. Honor provider retry-after and distinguish provider errors, missing evidence and structural defects. Re-enable paused jobs only after bounded verification proves their failure fixed.

Add durable request/token budget reservations, caller attribution, daily caps, provider-wide circuit breaking and reconciliation. Budget deferral stays visible and queued.

Retain the bounded five-minute Review schedule initially. Eight jobs/run gives a nominal maximum 2,304 evaluations/day, not 2,304 resolutions/day. Increase capacity after source repair and query profiling; measure oldest actionable item and useful unique resolutions.

### Review experience
Show candidate/original values, evidence passages and contradictions, evidence age, typed probabilities, model/policy and actual application result. Distinguish missing evidence, provider retry, pending repair, preview and machine-applied outcomes. Keep grouped cases open until all members resolve and never label AI decisions human-reviewed.

## Validation and release
1. Offline contracts: malformed distributions, missing/no-match candidates, uncertainty, contradictions, provider failure, bounds and deterministic truth tables.
2. Isolated PostgreSQL: leases, concurrency, stale inputs, pause between claim/apply, rollback, machine audit, budgets and alternate commit routes.
3. Representative labeled public records across domains and languages, including negatives, namesakes, missing sources and sensitive facts. Separate tuning and held-out cases; model agreement is not ground truth.
4. Shadow evaluation, cost/latency measurement and no source writes.
5. Bounded per-domain production canaries; stop on a confirmed unsupported write or privacy/authorization failure. Verify actual source-queue removal and before/after audit. Sensitive actions require their own passing validation.
6. Per-domain rollback switches and version-checked compensating corrections; retain history.
7. Reconcile coverage for all registry rows, all 18 DAGs and all 41 Review sources; update the stale runbook.

Acceptance metrics: action/domain precision with sample size and uncertainty, unsupported writes, oldest actionable age, source-to-publication latency, unique resolutions/recurrence, evidence recovery, retries and spend. Establish numerical release targets against the evaluation set before promotion. Model confidence alone is not acceptance evidence.

## Implementation sequence
1. Isolate current main; inspect all mutation entry points and run offline baseline.
2. Shared transport/catalog, budget/audit and coverage manifest.
3. Evidence recovery and supported corrections for general-review, geography, event-quality and staging.
4. Marketplace classification/relevance plus drain repair, then news, events, venues/hotels, geography, people and tags.
5. Validate and expand sensitive actions individually.
6. Shadow/canary, deployment verification, metrics and full coverage reconciliation.

## Approval recorded
The authority preference is answered. The owner approved this design and the US$5 validation cap on 29 October 2026. Approved live Jev validation budget: US$5 total with an enforced ledger, using existing server-side JEV_API_KEY or TYPESAFE_API_KEY.

Data sent: synthetic fixtures and minimized public catalog/event/place/article facts plus public source excerpts. Sensitive validation may include already-public identity, accessibility and legal/safety statements within the approved scope. Do not send reporter/account IDs, private submissions, contact details or secrets as model state. Read-only discovery performed no live inference.

## Current Review coverage and proposed extensions
| Sources | Next capability |
| --- | --- |
| general-review, cms-issues, geography, business-quality | Specific correction candidates plus invariant recheck |
| staging, news-quality | Article/type/source support and publication prerequisites |
| event-quality | Exact occurrence, category, dates, venue and field support |
| dedup-review, tag-merges, milestone-duplicates, duplicates | Canonical identity/occurrence checks with source-specific merge semantics |
| entity-links, milestone-links, org-link-review | Both identities and the exact relationship |
| quality-city, quality-venue, quality-village, quality-personality, quality-marketplace, quality-tag, quality-other | Exact-value verification and field-specific sensitive validation |
| ai-suggestions, tag-enrichment, tags | Canonical vocabulary, multilingual meaning and positive candidate application |
| milestone-review | Historical support while preserving uncertainty |
| liveness | Current operation or explicit closure evidence |
| content, editorial, tag-editorial, tag-restoration, sensitive-tags, brand-ownership, venue-kind, personality-publication | Action-specific validated eligibility instead of categorical exclusions |
| moderation, submissions, group-requests, feedback, automation, trip-geography | Authorized minimized triage; explicit consent/access/privacy prerequisites control execution |

## Pipeline inventory
| Definition | Enabled | Current shared review gate |
| --- | --- | --- |
 | city-ingestion | true | present | 
 | country-ingestion | true | present | 
 | events-ingestion-bulletproof | true | present | 
 | hotel-ingestion-pipeline | true | present | 
 | hotel-ingestion-unified | true | present | 
 | marketplace-drain | true | present | 
 | marketplace-ingestion | true | present | 
 | marketplace-merchant-onboard-2 | false | present | 
 | marketplace-merchant-onboard-3 | true | present | 
 | marketplace-reingest | true | present | 
 | marketplace-sfw-onboard | false | present | 
 | news-ingestion | true | present | 
 | personality-ingestion | true | present | 
 | queer-villages-ingestion | true | present | 
 | restrooms-ingestion | true | present | 
 | social-media-ingestion | true | present | 
 | tags-ingestion | true | absent | 
 | venue-ingestion-unified | true | present | 

## Largest active grouped queues
| Queue | Cases |
| --- | ---: |
 | general-review | 1951 | 
 | geography | 1204 | 
 | event-quality | 1002 | 
 | staging | 591 | 
 | business-quality | 212 | 
 | tag-enrichment | 31 | 
 | entity-links | 20 | 
 | org-link-review | 19 | 
 | milestone-review | 14 | 
 | liveness | 10 | 
 | news-quality | 7 | 
 | quality-venue | 5 | 
 | ai-suggestions | 2 | 
 | venue-category | 2 | 
 | dedup-review | 1 | 
 | brand-ownership | 1 | 
 | quality-city | 1 | 

