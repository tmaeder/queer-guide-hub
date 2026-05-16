# Security audit — manual-action follow-ups

The whole-app audit (2026-05-16) shipped most fixes automatically. A handful
need actions outside the CLI/SQL surface (dashboard or longer-term refactor).
Track here so they don't fall off the radar.

## 1. JWKS migration for `workers/submit` (P1 #13)

**State:** Worker verifies user JWTs with HS256 against `SUPABASE_JWT_SECRET`
([workers/submit/src/auth.ts](../../workers/submit/src/auth.ts)). The symmetric
key sits in worker env; if exposed (logs, supply chain), an attacker can mint
arbitrary user JWTs including service-role.

**Action (manual, ~30 min):**

1. Supabase dashboard → Project → Authentication → JWT Keys → "Add new signing
   key" → choose `ES256`. Old HS256 key stays valid during rotation.
2. Wait until the new key appears at
   `https://xqeacpakadqfxjxjcewc.supabase.co/auth/v1/.well-known/jwks.json`.
3. Update worker to verify against JWKS:
   ```ts
   import { createRemoteJWKSet, jwtVerify } from 'jose'
   const JWKS = createRemoteJWKSet(new URL(
     `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
   ))
   const { payload } = await jwtVerify(token, JWKS, { algorithms: ['ES256','HS256'] })
   ```
4. Deploy worker, monitor. After ~24h with no HS256 verifications, remove the
   HS256 fallback in code.
5. Dashboard → revoke old HS256 key.

**Verification:** `curl /auth/v1/.well-known/jwks.json` returns non-empty `keys` array.

## 2. CSP `unsafe-inline` → nonces (P1 #6)

**State:** [public/_headers](../../public/_headers) line 18 allows
`script-src 'unsafe-inline'`. Any reflected/stored XSS that slips past
DOMPurify becomes script execution. Critical because users may be in hostile
jurisdictions.

**Why deferred:** Vite injects small inline scripts into `index.html` during
build. To use nonces we must:

1. Add a vite plugin that replaces inline `<script>` content with hashes, OR
   tags them with a placeholder nonce.
2. On Cloudflare Pages, inject a per-request nonce via a Pages Function
   middleware that rewrites the placeholder and emits matching
   `Content-Security-Policy: ... 'nonce-<value>'` header.
3. Drop `'unsafe-inline'` from `_headers`.

**Estimated effort:** 1–2 days including a staging rollout. The vite plugin
[vite-plugin-csp-guard](https://github.com/clevercanyon/vite-plugin-csp-guard)
handles step 1 cleanly; the Pages Function for step 2 is ~30 lines.

**Acceptance:**
- All inline scripts in built `index.html` carry `nonce="..."`.
- Network response carries `script-src 'self' 'nonce-...' https:`.
- No `unsafe-inline` in production CSP.
- Manual XSS attempt via DOMPurify bypass fails to execute.

## 3. Edge function & worker test coverage (P1 #15)

**State:** 8 of 179 edge functions tested; 4 workers tested. Critical paths
(stripe-webhook, marketplace-relevance, news-commit_staging_batch) had no
unit tests until this audit.

**Already added:** `_tests/stripe-webhook-helpers.test.ts` (10 Deno tests for
checkout completion + renewal builders).

**Suggested next:** Extract pure helpers from the following and add deno
tests under `supabase/functions/_tests/`:

- `marketplace-relevance` — LGBTQ gate scoring (Claude Haiku prompt builder)
- `pipeline-commit/helpers` — `buildRecord()` per target table
- `pipeline-deduplicate` — dedup key generators
- `news-commit_staging_batch` RPC — write a SQL test using pgTAP

## 4. Oversized page splits (P2 #19)

`Events.tsx` 1024 LOC, `News.tsx` 945, `SearchResults.tsx` 921,
`AdminEvents.tsx` 924, `Places.tsx` 864. Each carries 20+ `useState`, multiple
effects, inline data fetching. Maintenance + re-render cost.

**Approach:** Per page, extract:
- Filter state into `useReducer` (`useEventsFilters.ts`)
- Data fetchers into hooks (`useEventsList.ts`)
- View modes (grid/list/map) into separate components

Each takes 2–3 days. Worth doing one at a time; no urgency.

## 5. Admin batch test rewrite (P2 #18)

The 50+ admin component tests merged in batches 32–54 are mostly 17–35 line
"renders without crashing" smoke tests with all hooks mocked to `[]`. They
inflate coverage % but do not catch logic regressions.

**Action:** Pick 10–15 highest-risk admin flows (review-gate commit, bulk
merge, pipeline trigger, role grant) and rewrite as interaction tests with
`userEvent` + mutation-argument assertions.

## 6. Remaining lint warnings (P2 #27)

223 warnings remain. Top categories:

- 71 `jsx-a11y/click-events-have-key-events` — non-button elements with
  click handlers. Fix by either using `<button>` or adding `onKeyDown`.
- 67 `jsx-a11y/no-static-element-interactions` — same root cause.
- 40 `jsx-a11y/no-noninteractive-element-interactions` — same.
- 23 `react-refresh/only-export-components` — move non-component exports
  to separate files for HMR.
- 7 `react-hooks/exhaustive-deps` — careful per-file review.

**Approach:** Tackle one component cluster at a time. Don't bulk-fix
a11y warnings — each may indicate a real keyboard-navigation gap.

## 7. Dispatcher backoff / DLQ stage map verification

`pipeline-dlq-consumer` and `workflow-dispatcher` were hardened this audit
but the changes have not been exercised by a real failure. After the next
DLQ scenario, verify:

- DLQ rows from news pipeline route to `pipeline-enrich-news` (not the old
  `enrich-venue` map).
- Retries respect exponential backoff with maxAttempts boundary.

Search Sentry / `pipeline_errors` for `unknown_stage` events to confirm
no surprises.

---

*Last updated: 2026-05-16. Maintained alongside the whole-app audit
artefacts.*
