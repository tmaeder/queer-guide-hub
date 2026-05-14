# Bundle baselines — Phase 0 snapshot (2026-05-14)

Captured before any code changes. All subsequent PRs should regenerate `stats.html` (via `BUNDLE_STATS=1 npm run build`) and compare deltas in their PR description.

## Initial JS payload (gzipped)

Chunks listed in `dist/index.html` as `<link rel="modulepreload">` — i.e. fetched on first paint regardless of route:

| Chunk | gz (B) | raw (KB) | Contents |
| ----- | -----: | -------: | -------- |
| `index-CKaXGKt5.js` | 304 577 | 897 | App entry: routes, providers, shared components |
| `lucide-B6lUxiJ2.js` | 161 742 | 606 | All of `lucide-react` |
| `vendor-BJai9gfu.js` | 60 742 | 189 | React + react-dom + scheduler |
| `radix-Cmx4SOz0.js` | 51 192 | 167 | All `@radix-ui/*` primitives |
| `motion-BFw_C0aO.js` | 47 313 | 139 | `motion` (Framer) |
| `utils-CqkEPRCe.js` | 22 550 | 94 | `date-fns` |
| `i18n-WjbK1DXP.js` | 21 904 | 64 | `i18next` + `react-i18next` |
| `router-coxxpUIY.js` | 13 525 | 36 | `react-router` v7 |
| `react-query-cF-knN-S.js` | 11 674 | 38 | `@tanstack/react-query` |
| `ui-extras-BheMQQc6.js` | 4 877 | — | `cmdk` + `embla-carousel-react` |
| `sentry-DmWnjrTE.js` | 3 966 | — | `@sentry/react` core |
| **Total initial JS (gz)** | **704 062** | — | **≈ 688 KB** |

### Largest non-initial chunks (loaded lazily)

| Chunk | gz (B) | Notes |
| ----- | -----: | ----- |
| `index.esm-CXSStdAS.js` | 565 384 | `@zxcvbn-ts/language-common` — already dynamic-imported by `PasswordStrengthMeter.tsx` |
| `index.esm-j3rBFOOH.js` | 231 902 | `@zxcvbn-ts/language-en` (same dynamic import) |
| `maplibre-D7Wkg5g4.js` | 281 762 | `maplibre-gl` + `@protomaps/basemaps` |
| `exceljs-1m0zBiG5.js` | 269 243 | `exceljs` — admin export |
| `tiptap-C56LBl3g.js` | 188 569 | `@tiptap/*` (16 extensions) |
| `mammoth-DTdYbKZA.js` | 130 840 | `mammoth` — docx import |
| `pdfjs-H4Ws1JNX.js` | 119 611 | `pdfjs-dist` |

Total `dist/assets/js` raw size: **~11.2 MB** across 137 JS chunks.

## Top targets for Phase 1

1. **`lucide-react` is eager (162 KB gz).** Either tree-shaking is broken (check for `import * as Icons` or dynamic property access) or every single icon is actually referenced from the eager path. 596 source files import from `lucide-react`. Worth a grep audit before assuming this is unavoidable.
2. **The 305 KB gz main `index` chunk** likely contains a route-component tree imported statically. Investigate what's reachable from `App.tsx` without `lazy()`.
3. **`exceljs` (269 KB gz lazy)** — already lazy, but if it's reachable from any public route's static graph we want to confirm.

## Lighthouse

See `lh-desktop.json` / `lh-mobile.json` and `lighthouse-baseline.md` for the four category scores + Core Web Vitals. (Captured against live `https://queer.guide`, not localhost.)

## Security headers

See `headers-baseline.txt`. Live `queer.guide` already serves: HSTS preload, CSP (with documented allowlist of Stripe / Cloudflare Turnstile / GetYourGuide / Maps / Sentry / Clarity), X-Content-Type-Options, X-Frame-Options, Referrer-Policy `same-origin`, Permissions-Policy, COOP `same-origin`, Tor onion-location. CSP is on the strict side, no `'unsafe-eval'`. Phase 3's "set security headers" item is largely already done; should focus on tightening `'unsafe-inline'` in `script-src` if feasible (CSP nonces).

## NPM hygiene

- `npm audit --omit=dev`: **0 vulnerabilities**. No high/critical to chase.
- `npm outdated`: see `npm-outdated.json`. Mostly minor/patch (sentry 10.47→10.53, react 19.2.4→19.2.6, dompurify 3.4.0→3.4.3). Notable majors deferred: eslint 9→10, vite 6→8, typescript 5.8→6, i18next 25→26, jsdom 28→29, lint-staged 16→17, eslint-plugin-react-hooks 5→7, @eslint/js 9→10.
- `esbuild ^0.28.0` in runtime deps: **zero `import 'esbuild'` references in `src/` or `scripts/`**. Safe to move to `devDependencies` in Phase 1. (Note: Vite uses esbuild internally via its own dependency tree, so removing the top-level dep doesn't break anything.)
- `uuid ^14.0.0` override: v14.0.0 exists on npm — pin is real, not aspirational.
- `lucide-react ^1.14.0`: confirmed real version (latest 1.16.0). Not a typo for the more familiar 0.x line; this is a different fork/release stream — worth confirming with the team that this is intentional.
