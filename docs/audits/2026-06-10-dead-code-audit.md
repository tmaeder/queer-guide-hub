# Dead / Orphaned / Redundant / Broken Code Audit — 2026-06-10

Detect-only pass. No code was changed. Builds on the 2026-05-31 declutter
([DECLUTTER_CANDIDATES.md](../../DECLUTTER_CANDIDATES.md)) — resolved items from that pass are
not re-listed.

**Method:** `tsc --noEmit` (root + scraper) · `eslint .` · knip (scoped config, default run is
useless here — 390 FPs from multi-entry-point monorepo) · depcheck (root + scraper) · vite build ·
vitest (root + scraper) · per-candidate `git grep` across strings/configs/dynamic dispatch ·
live-DB gate (cron.job, pipeline_definitions/pipeline_node_types, workflow_definitions,
admin_automations, pg_proc bodies) · Supabase deployed-function list · CF deployed-worker list.

**Baseline (this branch, eed825b3):** typecheck ✅ · lint ✅ (1 warning) · vite build ✅ ·
scraper tsc+tests ✅ (130/130) · frontend vitest 5333/5334 passed — the 1 failure is a
vitest fork-worker startup timeout on `brand.test.tsx` (infra flake under concurrent load,
not an assertion failure; 19 such pool errors). Code-level baseline is green.

---

## Summary

| Category | High confidence | Medium | Low / report-only |
|---|---|---|---|
| Orphaned | 12 findings (7 src files, 5 _shared modules, 2 extension files, 8 root images, 1 script) | 7 (zero-ref edge fns, one-shot scripts) | unused exports (88, knip) |
| Dead | 1 (lint dead assignment) | 1 (`content-classifier` subsystem never wired) | — |
| Redundant | 2 (dup validation-logic cluster, /api/geo double impl) | 2 (unused deps) | CLAUDE.md repo-stats cruft |
| Broken | 3 (**bookings table missing**, **5 crons → nonexistent fns**, **16 live fns missing from git**) | 2 (config.toml drift, send-welcome-email never ran) | 64 duplicate migration timestamps |

The headline is NOT classic dead code — it's **source-of-truth drift**: production runs code
that main doesn't have, and references code that doesn't exist anywhere.

---

## BROKEN (highest priority)

### BR-1 — 16 production-live edge functions missing from main
**Evidence:** Supabase deployed list (288 fns) vs repo (202 dirs); cross-checked against live
cron/pipeline/workflow references and frontend `functions.invoke` calls.

Live in production (cron/pipeline/frontend-invoked), **no source on main**:

| Function | Live via | Source location |
|---|---|---|
| hotel-agentic-enrich | cron | branch `claude/nostalgic-shtern-f14833` (unmerged) |
| hotel-liveness-checker | cron | same branch |
| marketplace-categorize | cron | branch `claude/crazy-mayer-dfd81f` (unmerged) |
| marketplace-enrich | cron | same branch |
| marketplace-relevance-rescore | cron | same branch |
| marketplace-translate | cron | same branch |
| personality-extract-from-bio | cron | branch `claude/awesome-gagarin-61e8f9` (unmerged) |
| pipeline-enrich-country-editorial | workflow | branch `claude/amazing-mestorf-7f7cd9` (unmerged) |
| source-shopify-public | pipeline node | branch `claude/hardcore-germain-95e218` (unmerged) |
| import-foursquare-venues | AdminVenues.tsx:159 dispatch | branch `chore/cf-pages-auto-deploy` |
| scrape-gaycities-events | ImportJobCreator.tsx:75/237 invoke | same branch |
| marketplace-image-mirror | pipeline node | **no git history — deployed copy is the only source** |
| marketplace-relevance | pipeline node | **no git history** |
| marketplace-tag-backfill | DB function body | **no git history** |
| refresh-watched-urls | cron | **no git history** |
| generate-trip-pdf | useTripExport.ts:19 invoke | **no git history** |

**Cause:** functions deployed from sessions via MCP `deploy_edge_function` without committing, plus
`claude/*` branches that never auto-landed (memory says they should auto-merge — these didn't).
**Blast radius:** a `supabase functions deploy` sweep or repo-driven redeploy would overwrite
or lose live behavior; disaster recovery from git is impossible for the 5 no-history fns.
**Proposed action:** recover all 16 into main (11 via cherry-pick/checkout from branches; 5 by
downloading deployed source via `supabase functions download`), then make repo the single source.
**Coverage:** none of the 5 no-history fns have tests anywhere.

### BR-2 — In-app hotel booking writes to a table that doesn't exist
**Evidence:** `hotel-booking/index.ts:37`, `booking-webhook/index.ts:105`,
`booking-confirmation/index.ts:25` all `.from('bookings')`; live DB has **no `bookings` table**
(only `trip_booking_clicks`). The flow is reachable: TripPlannerPage → TripBookingAssistant →
HotelBookingFlow → `invoke('hotel-booking')` (HotelBookingFlow.tsx:87, impala.ts:60+).
**Blast radius:** any user attempting in-app booking gets a runtime failure. Affiliate-link
booking (bookingUrl.ts) is unaffected.
**Proposed action (user decision):** either create the table (revive feature) or remove the
in-app booking path (3 edge fns + HotelBookingFlow/impala provider) and keep affiliate links.
**Confidence:** High that it's broken; remediation direction is a product call.

### BR-3 — 5 active crons invoke functions that exist nowhere
**Evidence:** cron commands reference `/functions/v1/fetch-{city,country,personality,venue,village}-images`;
none of the five is deployed (not in the 288-fn list) nor in the repo. `fetch-images` (in repo,
deployed, entity-parameterized; BACKFILL_JOBS config dispatches to it) appears to be the
replacement. Cron run status not verified against logs (DB query stopped at user request) —
classification rests on the gateway necessarily 404ing a nonexistent function.
**Proposed action:** repoint or remove the 5 crons (one migration).
**Blast radius:** none functional today (they already do nothing but log 404s).

### BR-4 — config.toml drift: 22 `[functions.*]` entries with no repo dir
**Evidence:** `supabase/config.toml` vs `supabase/functions/*`: create-booking,
compute-tag-relationships, fetch-*-images (6), get-wikipedia-info, manage-email-templates,
manage-placeholder-images, marketplace-image-mirror, marketplace-relevance, marketplace-ingestion,
news-pipeline, personality-pipeline, refresh-watched-urls, scrape-events-daily, search-flights,
search-hotels, secure-mapbox-token, social-media-ingestion.
Some are BR-1 fns (entry is correct, source is missing); the rest are stale.
**Proposed action:** resolve after BR-1 — recovered fns keep entries, the rest get removed.

### BR-5 — `send-welcome-email` has never run
**Evidence:** function header says "Triggered by Supabase auth webhook"; no auth send-email hook
in config.toml (only `custom_access_token`); zero repo references; live DB:
`count(welcome_email_sent_at IS NOT NULL) = 0` across all profiles.
**Classification:** Broken-by-never-wired. **Medium** — may be an intended-but-unfinished feature.
**Proposed action (user decision):** wire the auth hook, or delete fn + undeploy.

### BR-6 — `let status = 'skipped'` dead initializer
**Evidence:** ESLint `no-useless-assignment`, `amenity-truth-backfill/index.ts:127` — reassigned
before any read. Only lint finding in the whole repo. Trivial fix.

---

## ORPHANED

### OR-1 — src/ zero-importer files (High, knip + grep-verified individually)
| File | Evidence |
|---|---|
| `src/components/map/ContextualMap.tsx` | zero refs incl. lazy/string |
| `src/components/pride/PrideEventCard.tsx` | zero refs |
| `src/components/admin/AsyncActionButton.tsx` | zero imports; only a *comment* in useAsyncAction.ts (hook itself is live, 2 importers) |
| `src/hooks/usePresence.ts` | zero imports; only a comment in lib/presence.ts (presence.ts is live); TripChatTab mocks `useTripPresence`, a different hook |
| `src/hooks/useTripGroupLinks.ts` | zero refs |
| `src/test/mockSupabase.ts` | zero refs (test helper nothing uses) |
| `src/App.css` | zero refs (`main.tsx` imports `index.css` only) |

Guardrails checked: no dynamic import, no string-built component names, not lazy routes.
**Action:** delete (7 files). Verify: typecheck + build + vitest.

### OR-2 — `_shared` orphan cluster: dedup/validation engine (High)
`dedup-engine.ts`, `event-validation-rules.ts` — zero importers; `confidence-scoring.ts`,
`fuzzy-match.ts` — imported ONLY by those two. The live pipeline (`pipeline-deduplicate`,
`pipeline-validate`) implements its own logic and imports none of these.
**Redundancy link (RD-1):** the same three files are duplicated at `src/lib/{fuzzy-match,
event-validation-rules,confidence-scoring}.ts` where the only importers are their own unit tests
(`src/lib/__tests__/*`) — production-orphaned in BOTH trees, kept alive by self-tests.
docs refs only in repo-map.md + one plan doc.
**Action:** delete 4 _shared files + 3 src/lib files + 3 test files; update repo-map.md.
**Blast radius:** none in prod code; −~1,500 LOC.

### OR-3 — `_shared` standalone orphans (High)
`infer-timezone.ts`, `moderation-flag-utils.ts`, `pii-redact.ts` (+ its only consumer, its own
test), `trip-context.ts` — zero references repo-wide outside their own files/md.
**Action:** delete. (Keep: `ai-gateway.ts`, `feedback-redact.ts` — transitively live via
llm-client/openai-client and build-story-prompt→claude-routine-dispatch.)

### OR-4 — `_shared/content-classifier.ts` (High orphan, Medium for action)
Zero importers; header claims consumers (`pipeline-executor`, a `content-classifier` edge fn)
that don't exist; the seeded automation cron `wf-automation-content-classifier` is gone from
live cron.job. Matches the 2026-06-05 "classification never ran" audit.
**Action: user decision** — delete, or keep as the seed of the planned classification work.

### OR-5 — Extension content scripts never registered (High)
`extension/src/content/overlay.ts` (M9.1), `extension/src/content/bulk-extract.ts` (M8.2) —
not in manifest.json, not injected via `chrome.scripting`, zero imports.
**Action:** delete or wire; they look like shipped-then-abandoned milestones.

### OR-6 — Root-level screenshot/mockup images (High)
8 files, ~2.7 MB: `city-berlin-full.jpeg`, `home-full.jpeg`, `home-mobile.jpeg`,
`home-desktop.png`, `map-fixed.jpeg`, `prod-map-live.jpeg`, `prod-map-live2.jpeg`,
`search-berlin.jpeg` — zero references in code or HTML. Session artifacts committed by accident.
**Action:** delete.

### OR-7 — Zero-ref deployed+repo edge fns (Medium — operator-reachable or webhook-shaped)
| Function | Evidence | Nuance |
|---|---|---|
| `backfill-countries-images` | zero static refs anywhere | reachable via `scripts/backfill-images-drive.mjs` `FN=` env; 2026-06-05 audit says country images complete |
| `backfill-personality-images` | zero static refs | same driver; audit says all missing are drafts — work done |
| `booking-webhook` | zero refs; writes to nonexistent `bookings` table | part of BR-2 |
| `whatsapp-webhook` | zero refs; self-described "placeholder" | never wired to Meta |
| `backfill-news-images` | only a comment ref (event-image-backfill:9) | same driver class |

**Action:** bundle with BR-2 / feature decisions; deleting repo dir + undeploying is low risk.

### OR-8 — One-shot operator scripts (report-only, keep by convention)
12 unwired scripts under `scripts/` (backfill-*.sh, boundary pipeline, `setup-all.sh` — which
calls the deleted `configure-meili.sh`, so it's broken too), `scripts/search-eval/search-test.mjs`,
`scripts/fix-unused-vars.mjs`, plus 17 `scraper/scripts/test-*.ts` harnesses. The repo's
convention (CLAUDE.md: "scripts/ — one-shot operator scripts") protects these; only
`setup-all.sh` (broken reference) and `fix-unused-vars.mjs` (generic codemod, superseded by
eslint --fix) are real candidates.

---

## REDUNDANT

### RD-1 — fuzzy-match/validation cluster duplicated src/lib ↔ _shared
See OR-2. Both copies production-orphaned; "canonical source" comment points at the _shared copy.

### RD-2 — `/api/geo` implemented twice; Pages function unreachable (High)
`workers/geo` (deployed, route `queer.guide/api/geo`) **shadows** `functions/api/geo.ts`
(added in #1391 under the belief the endpoint 404'd). Verified live: response carries the
worker's `Cache-Control: private, max-age=300` (Pages fn sends `no-store`). Both return
compatible shapes, but two sources of truth for one endpoint, and the worker silently wins.
**Action (user decision):** delete `workers/geo` + its route (Pages fn takes over, has the
richer payload + stricter cache policy), or delete the Pages fn. Recommend keeping the Pages fn.

### RD-3 — Unused direct deps (Medium)
- `file-selector` (deps): zero imports; it's react-dropzone's own transitive dep (v15 declares
  `file-selector ^2.1.0`). Added in redesign commit cbb8e2e6, likely accidental. Remove.
- `@fontsource-variable/inter` (devDeps): zero imports; fonts are self-hosted woff2 in
  `public/fonts/inter/` per design system. Remove.
- depcheck FPs verified live, keep: husky/lint-staged/prettier (scripts), tailwindcss
  (`@import "tailwindcss"`), postcss (peer of @tailwindcss/vite), scraper `pino-pretty`
  (dynamic `transport.target` string, logger.ts:8).

### RD-4 — CLAUDE.md cruft (Low)
"Repo stats" holds ~60 stale duplicate count lines (bot sync artifacts), and the Amenity Truth
Engine paragraph is duplicated wholesale. Trim to current values.

---

## DEAD

### DE-1 — `amenity-truth-backfill/index.ts:127` dead initializer (see BR-6).
### DE-2 — knip unused exports: 88 named exports across src/ (report-only, Low)
Mostly intentional surface (shadcn barrel parts, variant exports, constants). Worth a later
sweep only for the non-shadcn ones; no action now.

---

## Report-only observations

- **64 duplicate migration timestamps** (e.g. 3× `20260524500000`). Already applied — do NOT
  rename retroactively; just avoid new collisions.
- **Deployed-but-dead functions on Supabase: ~70** (algolia-*/meili-*/redis-*/n8n-*/automation-*/
  search-flights/search-gifs/secure-mapbox-* era, plus `_debug-echo-meili-url`). Zero live DB
  refs, zero (or comment-only) repo refs. Undeploy list available — infra action, not repo.
- **CF account has non-repo workers** (telegram-ingest, email-ingest, scraper-api ×2, nlweb ×2,
  geo-boundaries, operator-notify-inbound, protomaps-tiles, queer-guide-mcp) — external infra,
  out of scope, flagged for inventory only.
- **e2e:** all 60 specs included by playwright.config; `auth.setup.ts` is wired (testMatch).
- **Workers source trees:** no orphan files; entry points/bindings all accounted for.
- **Scraper:** clean — registry-driven sources, all tests import cleanly, disabled adapters
  already removed.

---

## Remediation log (executed 2026-06-10, same day)

| Finding | Action | Verification |
|---|---|---|
| BR-1 | All 16 fns recovered into repo from **deployed source** (`supabase functions download` — authoritative over stale branches); 6 deployed-only `_shared` modules added; repo `_shared` kept (newer). config.toml entries mirror deployed verify_jwt. | lint 0 errors, tsc green |
| BR-3 | 5 dead `enrich-*-images` crons unscheduled (migration `20260610200000`, applied) | jobs gone |
| **BR-7 (new)** | Found during remediation: 4 crons (incl. every-minute `pipeline-dlq-consumer`) referenced vault secrets `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` that were **never created** → `net.http_post(url := NULL)`, dead since migration `20260610000000`. Repointed to hardcoded URL + existing `internal_invoke_secret`. | DLQ cron succeeding per minute post-fix |
| BR-4 | 19 stale config.toml entries removed; every remaining entry maps to a repo dir | diff vs dirs clean |
| BR-6/DE-1 | dead initializer fixed; repo eslint-error-free | eslint 0 errors |
| OR-1 | 7 src files deleted; stale comments updated | tsc+lint+build green |
| OR-2/3+RD-1 | orphan cluster deleted in both trees; `confidence-scoring.ts` (_shared) **kept** — recovered `pipeline-enrich-country-editorial` imports it; `content-classifier.ts` kept (classification roadmap) | tsc+lint green |
| OR-5 | extension orphans deleted | extension tsc green |
| OR-6 | 8 root images deleted | — |
| OR-7 | whatsapp-webhook + backfill-{countries,personality,news}-images deleted from repo **and undeployed**; `backfill-cities-images` kept (driver default) | — |
| RD-2 | `queer-guide-geo` worker deleted (deployed + repo + dependabot); live `/api/geo` verified serving the Pages function (no-store header, full payload), zero downtime | live curl |
| RD-3 | `file-selector` + `@fontsource-variable/inter` removed | build + 17 upload tests green |
| RD-4 | CLAUDE.md repo-stats collapsed, dup paragraph removed | — |
| Undeploy sweep | **74 dead deployed functions deleted** (69 legacy + `_debug-echo-meili-url` via Mgmt API + 4 OR-7). Source backed up first: `~/QG-edge-fn-undeploy-backup-2026-06-10.tgz`. Cross-checked: every repo/corpus reference was comment-only ("Replaces:" headers). function-monitor registry pruned. | **deployed 214 = repo 214, zero drift both ways** |
| Drift re-sync | 4 fns whose repo copy got lint touch-ups redeployed (verify_jwt flags confirmed unchanged) | Mgmt API flag check |

## Still open (user decisions)

- **BR-2** booking feature: 3 edge fns + HotelBookingFlow write to nonexistent `bookings` table — revive (create table) or remove the in-app path. Left untouched.
- **BR-5** send-welcome-email: never wired (no auth hook, 0 emails ever). Wire or delete.
- **OR-4** `_shared/content-classifier.ts`: kept as seed of the planned classification work.
- **Security:** `venue-url-checker` + `marketplace-link-checker` have **no auth at all** (verify_jwt=false, no secret check) — missed by the #1542 gating pass (not `pipeline-*`/`source-*` prefixed).
- 64 duplicate migration timestamps: live with it; avoid new collisions.
