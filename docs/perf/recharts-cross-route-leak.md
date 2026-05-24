# Recharts cross-route chunk leak — RESOLVED

**Status:** resolved by [#1122](https://github.com/tmaeder/queer-guide-hub/pull/1122) on 2026-05-24
**First spotted:** Lighthouse run on /cities ([#1094](https://github.com/tmaeder/queer-guide-hub/pull/1094))
**Failed attempt:** [#1098](https://github.com/tmaeder/queer-guide-hub/pull/1098) — `optimizeDeps.include` didn't apply to prod builds
**Working fix:** [#1122](https://github.com/tmaeder/queer-guide-hub/pull/1122) — `output.advancedChunks.groups` with priority-based assignment

## TL;DR of the fix

```ts
// vite.config.ts > build > rollupOptions > output
advancedChunks: {
  groups: [
    {
      name: 'styling-utils',
      test: /[\\/]node_modules[\\/](clsx|tailwind-merge|class-variance-authority)[\\/]/,
      priority: 100,
    },
  ],
}
```

Priority 100 wins over rolldown's default chunking, so clsx is owned by its
own `styling-utils` chunk and rolldown stops baking duplicate copies into
recharts/pdf chunks that happen to use it. The same fix also broke the
**pdfjs leak (~122 KB raw)** and split recharts into per-chart-type chunks
that only load on chart-using routes. Total /cities entry-preload bytes
saved: ~457 KB raw (recharts 335 KB + pdf 122 KB).

The historical investigation below is kept for reference.

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
