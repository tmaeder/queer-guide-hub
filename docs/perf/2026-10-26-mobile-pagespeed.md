# Mobile PageSpeed optimization — 2026-10-26

Source: [supplied mobile PageSpeed report](https://pagespeed.web.dev/analysis/https-queer-guide/cx5ctbs0ux?form_factor=mobile).

## Findings

The supplied lab report scored performance at 74, accessibility at 100, best
practices at 96, and SEO at 100. It had no sufficient CrUX field data.

| Metric | Supplied mobile report |
| --- | --- |
| First Contentful Paint | 2.1 s |
| Largest Contentful Paint | 2.5 s |
| Total Blocking Time | 60 ms |
| Cumulative Layout Shift | 0.45 |
| Speed Index | 3.5 s |

The footer contributed 0.419 CLS: it appeared beneath a short route-loading
placeholder, then moved out of view when the lazy homepage mounted. A fresh
Chromium visit at 412 × 823 under 150 ms latency and 200 KiB/s download reproduced
that 0.419 footer shift and additional contribution-button shifts.

The button initially used the desktop offset until an effect detected mobile.
Its `transition-all` also animated `bottom` as consent clearance was published,
producing repeated layout shifts and a non-composited-animation warning.

Sentry transferred 149.1 KiB in the report, with 131.6 KiB classified unused.
Initialization was consent-gated, but multiple static SDK imports still fetched
it for every visitor. After replacing those imports, browser verification
exposed another path: the startup Web Vitals module imported shared functions
that the bundler had placed in the Sentry chunk.

## Changes

- Reserve the homepage's existing viewport-height minimum in the layout shell,
  including while the route is loading.
- Recognize bare supported locale roots such as `/de`, preserving `/me` as a
  route rather than treating it as a locale.
- Position the contribution button responsively in CSS from first paint. Use
  a transform for measured audio/consent clearance and avoid animating `bottom`.
- Load Sentry through a shared consent-gated import. Recheck consent after
  loading, coalesce concurrent imports, and contain SDK/reporting failures.
  Keep search scope metadata and error/breadcrumb reporting.
- Give `web-vitals` its own neutral chunk, and enforce that neither the static
  entry graph nor the dynamically imported startup metrics graph reaches Sentry.

## Verification

Production-preview browser checks used fresh contexts, 150 ms network latency,
200 KiB/s download, and an extra 800 ms delay on the lazy homepage chunk. They
observed startup through eight seconds after the headline appeared.

| Route / viewport | Observed CLS | Sentry SDK requests | Page errors / horizontal overflow |
| --- | --- | --- | --- |
| `/`, 412 × 823 | 0 | 0 | None |
| `/de`, 390 × 844 | 0 | 0 | None |
| `/`, 1280 × 900 | 0 | 0 | None |

The contribution button cleared the measured consent banner at every tested
viewport. Production build, bundle-shape checks, changed-code lint, focused
regression tests, and the repository typecheck ratchet passed. The ratchet
reported 660 existing errors against a 772-error baseline, with none new.

These are local startup checks, not a new Lighthouse score or field-data
measurement. Production deployment and a fresh PageSpeed run remain necessary
to measure the released score and comparable FCP/LCP timings.

## Lower-priority report items

The render-blocking stylesheet had an estimated 160 ms saving. It remains on
the critical path to preserve styled first paint; this change addresses the
larger verified layout and SDK costs first. The existing ES2022 browser target
is retained rather than changing compatibility to chase dependency polyfill
diagnostics. The image CDN connection hint is not removed merely because the
initial viewport makes no image request: lazy images below the fold use it.
