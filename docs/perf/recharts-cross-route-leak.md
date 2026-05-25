# Recharts cross-route chunk leak — still unresolved

**Status:** still open as of 2026-05-24, after a failed fix attempt that
had to be reverted
**First spotted:** Lighthouse run on /cities ([#1094](https://github.com/tmaeder/queer-guide-hub/pull/1094))

## Failed attempts (timeline)

| PR | Approach | Result |
|---|---|---|
| [#1098](https://github.com/tmaeder/queer-guide-hub/pull/1098) | `optimizeDeps.include: ['clsx', 'tailwind-merge', 'cva']` | `optimizeDeps` only affects the dev-server pre-bundle. Production rolldown ignored it. No effect. |
| [#1122](https://github.com/tmaeder/queer-guide-hub/pull/1122) | `output.advancedChunks.groups` for clsx + tw-merge + cva with priority 100 | **Made perf worse.** Reverted by [#1150](https://github.com/tmaeder/queer-guide-hub/pull/1150). See post-mortem below. |

## Post-mortem of the #1122 failure

The fix successfully removed recharts from the entry preload chunks — verified
with `grep -l '"./recharts-' dist/assets/js/{utils,dist,index}-*.js` returning
nothing. The chunking *topology* looked clean. But Lighthouse on prod showed:

| | Pre-#1122 | Post-#1122 |
|---|---|---|
| Perf score | 54-61 | **42-45** |
| TBT | 590-850 ms | **2,260-2,270 ms** |
| LCP | 2.3-2.5 s | **3.7-6.6 s** |
| Entry chunk size (`index-*.js`) | 215 KB | **794 KB** |

**Mechanism:** removing recharts as an exit door for shared deps caused
rolldown to redistribute the displaced code into the synchronous entry chunk.
The +580 KB inflation of `index-*.js` parse + execute overwhelmed the
~92 KB recharts savings. Lighthouse perf score dropped 12 points.

**Lesson:** "no recharts in entry chunks" ≠ "smaller entry chunks". The next
attempt MUST measure:

1. Total entry chunk size before/after, not just import topology
2. Lighthouse perf score on production AFTER deploy, not just the build output
3. TBT, LCP — these tell you the actual user impact

## What's still worth trying

Listed in order of likely success:

1. **`patch-package` on recharts** — externalize clsx as a peer dep so it
   never gets pre-bundled into the recharts chunk. Forces rolldown to share
   the canonical clsx instance. Multi-file patch in `node_modules/recharts/es6/`.
2. **Replace recharts** — the chart-using routes (\`AdminAnalytics\`,
   \`AdminFeedback\`, \`BudgetTab\`, \`MarketplaceItemDetail\`, \`MonitorTab\`)
   are all admin/internal. A leaner alternative (recharts ≈ 335 KB raw) would
   eliminate the leak by removing the source.
3. **rolldown chunk-strategy investigation** — `output.experimentalMinChunkSize`,
   `output.maxParallelFileOps`, or upstream rolldown options not yet tried.
4. **Wait for rolldown 2.x** — rolldown 1.0 is recent; chunking improvements
   are on the roadmap.

## What NOT to do

- ❌ `optimizeDeps.include` — doesn't apply to prod builds (proven by #1098)
- ❌ `manualChunks` rule for clsx → 'styling-utils' — rule fires (confirmed
  with `console.log`) but rolldown keeps a duplicate copy in the recharts chunk
- ❌ Inlining clsx in `src/lib/utils.ts` — `cva` (used by every shadcn UI
  component) still depends on `clsx` from the package, so the leak persists
  via that path
- ❌ `output.advancedChunks.groups` with `priority` (proven by #1122) — breaks
  the entry chunk into 794 KB and tanks perf

---

## Historical investigation (kept for context)

---
# Recharts cross-route chunk leak — open follow-up

**Status:** unresolved as of 2026-05-24
**First spotted:** Lighthouse run on /cities ([#1094](https://github.com/tmaeder/queer-guide-hub/pull/1094))
**Attempted fix:** [#1098](https://github.com/tmaeder/queer-guide-hub/pull/1098) — did NOT solve the problem in production builds
**Owner:** unassigned

## Symptom

The `recharts` chunk (~335 KB raw, ~92 KB gzipped) downloads on every page that
uses any shadcn UI component — including pages with no charts at all (e.g. `/cities`).

Verified on production:

```bash
$ curl -s https://queer.guide/cities | grep -oE '/assets/js/[^"]+\.js' | \
  while read chunk; do
    curl -s "https://queer.guide$chunk" | grep -q '"./recharts-' && echo "$chunk imports recharts"
  done
```

Output (post-#1098, still present):

```
/assets/js/utils-DaoO4-AY.js imports recharts
/assets/js/dist-D-rb78-o.js  imports recharts
```

Both `utils-*` and `dist-*` are part of the entry preload list, so the recharts
chunk lands on the first paint of every route.

## Root cause

`src/lib/utils.ts#cn()` calls `clsx`. `clsx` is also a dependency of `recharts`.
Vite/rolldown's bundler decided to **inline a duplicate copy of `clsx`** into
the `recharts-*.js` chunk during prod build, and to **route the canonical
`cn() → clsx` static-import to the recharts chunk** instead of to its own.

Inspecting the recharts chunk shows the clsx source literally inlined:

```js
function te(){for(var e,r,t=0,n="",a=arguments.length;t<a;t++)...
```

(That's clsx's `clsx()` function, minified, sitting inside `recharts-*.js`.)

Once the entry chunk needs `cn()`, it static-imports `_` (= the inlined clsx)
from the recharts chunk. The browser pulls all 335 KB.

## Things tried that did NOT work

### 1. `optimizeDeps.include: ['clsx', 'tailwind-merge', 'class-variance-authority']` (PR [#1098](https://github.com/tmaeder/queer-guide-hub/pull/1098))

Hypothesis: pre-bundle the styling-helper trio at dev time so rolldown sees
them as canonical shared modules. **Didn't apply to production builds** —
`optimizeDeps` only governs the dev-server pre-bundle. The production
rolldown pass ignores it and still inlines clsx into recharts.

### 2. `manualChunks` rule routing clsx/tailwind-merge/cva to a dedicated `styling-utils` chunk

The chunk gets created and contains tailwind-merge + cva — but `utils-*.js`
STILL imports `_` (clsx) from the recharts chunk. Rolldown keeps a duplicate
copy of clsx inside recharts even when a `styling-utils` chunk exists.

Verified by adding `console.log` to `manualChunks` — the rule fires for
`/node_modules/clsx/dist/clsx.mjs` and returns `'styling-utils'`. But rolldown
ignores that for the recharts chunk's internal copy.

### 3. Inlining clsx in `src/lib/utils.ts`

Would isolate `cn()` from the package, but every shadcn UI component imports
`cva` (which still depends on clsx), so the cross-route leak persists via
that path.

## What WOULD work but is out of scope here

- **Patch recharts** with a `package.json patch` to externalize clsx as a peer
  dep (uses pnpm patch or `patch-package`). Forces rolldown to share the
  canonical clsx instance instead of bundling.
- **Replace recharts** on the chart-using pages (`AdminAnalytics`,
  `AdminFeedback`, `BudgetTab`, `MarketplaceItemDetail`, `MonitorTab`,
  `xyflow`) with a leaner chart lib.
- **Investigate rolldown options** for de-duplicating shared deps across
  manual chunks (e.g. `output.experimentalMinChunkSize`, or vite-specific
  `splitVendorChunkPlugin`).

## Impact

~92 KB gzipped on first paint of every page. Lighthouse on /cities reports
Performance 54 baseline; the lazy-map ([#1095](https://github.com/tmaeder/queer-guide-hub/pull/1095))
plus fetchpriority ([#1099](https://github.com/tmaeder/queer-guide-hub/pull/1099))
combined lifts to ~70–80; fixing this would push closer to 90.

## Related work

- [#1084](https://github.com/tmaeder/queer-guide-hub/pull/1084) — original /cities redesign
- [#1094](https://github.com/tmaeder/queer-guide-hub/pull/1094) — added /cities to Lighthouse CI
- [#1095](https://github.com/tmaeder/queer-guide-hub/pull/1095) — lazy-mount the map (~1.1 s TBT win)
- [#1098](https://github.com/tmaeder/queer-guide-hub/pull/1098) — attempted fix via optimizeDeps (didn't work in prod)
- [#1099](https://github.com/tmaeder/queer-guide-hub/pull/1099) — fetchpriority on top-3 thumbnails

If you pick this up, the highest-leverage next step is probably the recharts
patch — it removes clsx duplication at the source and unblocks the rolldown
chunking heuristic.

## Measured impact of the wins that DID land

Two Lighthouse runs against https://queer.guide/cities post-#1095/#1099,
desktop preset:

| Metric | Baseline (#1094) | Run 1 | Run 2 |
|---|---|---|---|
| Performance | 54 | 50 | 61 |
| TBT | 850 ms | 1390 ms | 590 ms |
| LCP | 2.5 s | 2.4 s | 2.3 s |
| TTI | 2.7 s | 3.2 s | 2.4 s |
| maplibre scripting | 1.1 s | — | 0.24 s ✓ |

Big variance between runs (CF bot-challenge script dominates at ~1.4 s scripting
regardless), so the score number is noisy. The unambiguous signal: **maplibre
scripting dropped from 1100 ms to 240 ms** — the lazy-mount in #1095 is doing
its job. That alone is the biggest individual win and it's real.

The score isn't climbing as fast as the bytes-on-the-wire savings would predict
because Cloudflare's challenge platform is doing 1.3-1.5 s of scripting on
every cold load. That's outside the app's control.

Take with several grains of salt: Lighthouse on this site fluctuates ±10 points
run-to-run because of CF challenge timing.
