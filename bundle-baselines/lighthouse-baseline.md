# Lighthouse baseline — 2026-05-14

Captured against live `https://queer.guide` (Cloudflare Pages production), homepage only, headless Chromium.

| Metric | Desktop | Mobile |
| ------ | ------: | -----: |
| **Performance** | 30 | 30 |
| **Accessibility** | 97 | 97 |
| **Best Practices** | 73 | 73 |
| **SEO** | 100 | 100 |
| First Contentful Paint | 1.2 s | 6.0 s |
| Largest Contentful Paint | 3.0 s | **16.3 s** |
| Total Blocking Time | 1 830 ms | **3 540 ms** |
| Cumulative Layout Shift | 0.272 | 0.03 |
| Speed Index | 3.0 s | — |
| Time to Interactive | 4.8 s | 20.3 s |
| Total transfer | 2 567 KB | 7 609 KB |

## Reading

- **Performance 30 / 30** is bad in both form factors. Same score in spite of vastly different conditions strongly suggests we're CPU/main-thread bound, not transfer-bound — TBT of 1.83s desktop and 3.54s mobile dominate the score.
- **Mobile LCP of 16.3s** is the hero metric to move. Likely cause: 304 KB gz main `index` + 162 KB gz `lucide` parsing on a slow CPU before React can mount.
- **CLS 0.272 desktop** is poor (target ≤ 0.1). Layout shift is independent of bundle work — needs a separate dimension/aspect-ratio audit on hero / map components.
- **Best Practices 73**: low for a site that already has solid headers. Likely deductions from third-party scripts (Cloudflare Turnstile, GetYourGuide, Clarity) and possibly missing CSP source attribution on inline scripts.
- **A11y 97 / SEO 100**: already healthy. Don't regress.

## Targets after Phase 1

- Mobile LCP: ≤ 4.0 s
- Mobile TBT: ≤ 600 ms
- Performance score: ≥ 70 desktop, ≥ 50 mobile
- CLS: ≤ 0.1 both
