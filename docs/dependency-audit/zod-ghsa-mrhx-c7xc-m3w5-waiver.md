# zod GHSA-mrhx-c7xc-m3w5 — dismissed as not-used (28 October 2026)

Dependabot alert 434, `high`, opened 2026-10-23 against `package-lock.json`.
Dismissed `not_used`. **The vulnerable code ships on disk and is unreachable.**
Every claim below is a measurement; each has a positive control, because a grep
that finds nothing is otherwise indistinguishable from a grep that never reached
the code — which is how the first attempt at this analysis went wrong (see
_Vacuous readings_ below).

## The advisory

> Zod schema-validation library through 4.6.5 contains an uncontrolled resource
> consumption vulnerability … Attackers can exploit the `handleArrayResult` parse
> logic in `$ZodArray`, which accumulates every validation issue for each failing
> element with no cap or early termination.

Range `< 4.6.6`, first patched `4.6.6`, CVSS `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`.
The `$`-prefixed class name is zod **4**'s core (`zod/v4/core`); zod 3's classic
`ZodArray` uses a different parse implementation and has no such function.

**Note the advisory's summary contradicts its own description** — the summary says
"oversized _constrained_ collections", the description says "an array schema
_without_ a length constraint". The description names the code path, so that is
what was tested.

## What is actually installed

| Copy                                                           | Version     | Status                     |
| -------------------------------------------------------------- | ----------- | -------------------------- |
| `node_modules/zod` (the only copy this app's own code imports) | **4.6.7**   | patched, above 4.6.6       |
| 11 nested copies hoisted under `@atproto/*`                    | **3.25.76** | in range, raised the alert |

The alert is therefore entirely about the nested atproto copies, not about the
zod this product calls.

## Why 3.25.76 is not exploitable here

**1. 3.25.76 really does carry the vulnerable v4 tree, so the range is correctly
tagged.** This was checked rather than assumed, because it is the step that would
turn the whole waiver into wishful thinking. The published tarball holds 292 files
under `package/v4/`, and `v4/core/schemas.cjs` contains `handleArrayResult` at
line 842. A mis-ranged advisory was the convenient hypothesis and it is false.

**2. But the root export does not reach it.** `exports["."]` → `./index.js`, whose
entire body is `export * from "./v3/external.js"`. The v3 tree is 26 files and
contains **0** instances of `handleArrayResult`. The function is reachable only
through the explicit `zod/v4`, `zod/v4-mini`, `zod/v4/mini` or `zod/v4/core`
subpaths.

**3. No atproto package uses those subpaths.** All 11 packages that carry a nested
zod were downloaded at their exact lockfile versions and grepped:

- files importing any `zod/v4*` subpath: **0**
- files importing plain `'zod'`: **120** ← positive control

The 120 is what makes the 0 meaningful. Measured on `@atproto/api` 0.29.1,
`lexicon` 0.7.17, `oauth-types` 0.7.7, `common-web` 0.5.15, `did` 0.5.6, `jwk`
0.7.4, `jwk-webcrypto` 0.3.4, `oauth-client` 0.8.10, `xrpc` 0.8.16,
`@atproto-labs/did-resolver` 0.3.11, `@atproto-labs/handle-resolver` 0.4.10.

## Why there is nothing to upgrade

`@atproto/api@latest` (0.29.5, checked live) still declares `zod: ^3.23.8`, so
bumping atproto resolves to the same 3.25.76. zod published **no 3.x backport** —
first patched version is 4.6.6. Forcing zod 4 through npm `overrides` would put
`@atproto/lexicon` on an incompatible major and break the Bluesky integration, so
it buys a green alert by risking a live feature. Not done.

## Blast radius if the analysis were wrong anyway

atproto is browser-only here and lazily imported: `src/lib/atprotoClient.ts` and
`src/lib/atprotoModeration.ts` both `import()` it on demand, and no edge function,
Cloudflare Worker or script imports `@atproto/*` (grepped across `supabase/`,
`functions/`, `workers/`, `scripts/` — only migration _comments_ match). The
attacker position is a Bluesky PDS returning an oversized array to the browser of
a user who chose to authenticate against it; the impact ceiling is that user's own
tab. It is not a server-side denial of service.

## Vacuous readings encountered while measuring this

Worth keeping, because each one read as a clean result:

- **The worktree has no `node_modules`.** The first grep for `handleArrayResult`
  returned 0 — and so did its positive control against top-level zod, which is
  what exposed it. Resolution walks upward to the main checkout.
- **The main checkout's install is stale and has no `@atproto/*` at all.** The
  grep for `zod/v4` imports there returned 0 with a positive control of **0 files
  importing plain zod** — proof the packages were absent, not that they were
  clean. This is why the tarballs were fetched instead.
- **The main checkout's top-level zod is 4.6.2, not the lockfile's 4.6.7.** An
  installed tree is not evidence about what CI deploys; `npm ci` builds from the
  lockfile, so the lockfile is the deployed truth.

## Re-open when

- any `@atproto/*` package starts importing `zod/v4*`; or
- atproto moves to zod 4 — at which point top-level 4.6.7 already satisfies it and
  the nested copies disappear; or
- zod backports a 3.x fix, making the upgrade free.
