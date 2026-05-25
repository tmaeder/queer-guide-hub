# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Marketplace Editorial Atlas — Wirecutter-style redesign (2026-05-24)
- **Editorial guides as first-class content** — `marketplace_guides`, `_picks`, `_sections`, `_reads` schema with RLS; admin authoring at `/admin/marketplace/guides` (publish gate: ≥80-char intro + hero + ≥3 picks + ≥1 `top`).
- **New routes** — `/marketplace/guides` index, `/marketplace/guides/:slug` Wirecutter-style detail page with hero, intro, tiered PickBlock (sticky image on desktop, pros/cons, shop-now CTA with `rel="sponsored nofollow"`), "At a glance" comparison table, `Article` JSON-LD.
- **GuidesStream on `/marketplace`** — personalized guide cards (16:9 hero, eyebrow + dek italic, "Why this guide?" chip).
- **Personalization scorer** — `public.recommend_guides(user_id, limit)` SQL: city match + interest overlap (jaccard) + category affinity + freshness decay + editorial boost + continue-reading; demotes already-completed + stale. `boost_reason` emits the dominant positive contributor.
- **Filter polish (Phase 1)** — community-owned chips, currency, last-verified window, hide sold-out switch, minimum LGBTQ+ relevance slider. Empty state rewrites to "No {filter X} listings in {Y}." with concrete loosening suggestion.
- **"Featured in" backlinks** — listing detail pages show tier chip + rationale pull-quote linking back to the guide; merchant pages get a 3-up rail of guides featuring any of their products. Pure-additive — renders nothing when there are no appearances.
- **Reading tracking + streak** — `useGuideReadTracker` upserts `marketplace_guide_reads` on guide-detail mount, auto-completes at 90% scroll. `marketplace_guide_reading_streak()` SQL counts consecutive ISO weeks. ContinueReadingRail on `/marketplace`, plain-text streak caption only when ≥2 weeks (no shaming on loss).
- **Local Supporter** — per (user, city) score: +5/saved queer-owned listing in city, +2/completed guide pick in city, +10/in-city review, −1/week decay, capped 0–100. Tiers: Visitor / Local / Local Supporter / Champion. `/marketplace/missions` page aggregates streak + in-progress guides + per-city scores; CityDetail surfaces a quiet caption when score > 0.
- **Edge functions** — `marketplace-recommend` (wraps the scorer, resolves user from JWT, returns featured-first for anon), `geo-resolve` (CF-IPCountry/CF-IPCity → cities lookup for soft anon personalization, no IP storage).
- **Soft anon personalization** — IP-geo through CF headers; `home_city` candidate via `cities` lookup. Falls back to country-only when CF-IPCity not available.
- **Index cleanup (Phase 6)** — dropped `price-drops` and `most-relevant` rails on `/marketplace` (redundant with the guide stream); kept `new` + `featured` for chronology + manual editor curation. Dead legacy sort tokens removed from `VALID_SORTS` (`LEGACY_SORT_MAP` still coerces old URLs).
- **Admin sidebar** — Marketplace Guides nav entry under Content with `marketplace_guides` count badge.
- **Design** — strictly monochrome, no new tokens. Italic dek as the one editorial flourish; tier labels are typographic ("OUR PICK"); no badge icons; functional motion only; semantic radius trio throughout.

See [`docs/plans/2026-05-24-marketplace-redesign.md`](docs/plans/2026-05-24-marketplace-redesign.md).

## [1.1.0] - 2026-05-21

### Added
- **Chrome extension** (`extension/`) — capture venues, events, hotels, marketplace items, and news from any webpage. Submissions flow through the same review pipeline the scraper uses.
- **`workers/submit/`** — Cloudflare Worker that verifies user Supabase JWTs and stages submissions into `ingestion_staging`. Shares the scraper's stable hash so dedupe works across both sources.
- **Four new Cloudflare Workers** — `geo` (geocoding proxy), `image-cdn` (image transform + cache), `image-ingest` (R2 mirror with SHA-256 dedup), `trip-inbox` (trip-planning ingestion).
- **Two-pane InstantSearch popover** — global search now shows results and previews side by side.
- **Queer-first `/places`** — top destinations, legality badges, neighborhood zones, pride-first photography. Long-tail filtering instead of dumping everything.
- **3-zone Neighborhoods tab** with editorial whitelist for Popular Destinations (no more raw population sort).
- **`/resources` rework** — help-first layout, paginated tag search, topic hubs moved to Supabase, full i18n coverage across 10 locales.
- **StatusBadge component** + monochrome recharts palette (`src/lib/chartPalette.ts`).
- **Semantic radius trio** — `rounded-container` (16px), `rounded-element` (8px), `rounded-badge` (4px). One source of truth for the entire visual rhythm.
- **Typography token registry** — `--text-hero-xl`, `--text-hero`, `--text-display`, `--text-headline-lg/-`, `--text-title`, `--text-body-lg`, `--text-15`, `--text-13`, `--text-xs2`, `--text-2xs`, `--text-3xs`, `--tracking-label`. ESLint guards block arbitrary `text-[NN]` values in admin, warn in public.
- **`docs/SEO.md`**, axe baseline doc, design-token docs.

### Changed
- **Design system → monochrome.** Black/white + grayscale only across public UI. Removed brand magenta, decorative shadows, gradients, Aurora, ScrollReveal, SpotlightEffect, TextGenerateEffect, WordRotate, MagneticButton, Parallax, and other Aceternity components from the public tree. Aceternity remains usable in `/aceternity` showcase only.
- **Strict 8 pt spacing grid.** Odd-step Tailwind utilities (`p-3`, `gap-3`, `p-5`, …) removed across 1600+ sites. `.5` increments stay for icon-level offsets.
- **Inline style → className codemod** across ~1700 sites. Icons use Tailwind sizing instead of inline `style={{ width, height }}`.
- **`/travel`, `/marketplace`, `/news`, `/events`, `/venues`, `/places`** — chrome reduced, hierarchy tightened, low-signal entries hidden, default query limits raised so Asia/Africa stop disappearing.
- **Search-proxy worker config** — dropped non-existent hotels/festivals indexes.
- **Sync `news_articles` pipeline** is now the canonical news path (cron `0 * * * *` → `wf-news-pipeline` → 10-node DAG with fingerprint dedup, auto-pause sources at 8 consecutive failures).
- **Marketplace pipeline hardened** — multi-source fan-in (Awin + Shopify + Etsy), Claude Haiku LGBTQ+ relevance gate, price-history tracking, image mirror to R2, link-rot sweeper.

### Fixed
- **Accessibility** — axe baseline now 0/0/0/0 across 17 production routes. Closed 6 axe regressions, 3 horizontal scrollers made keyboard-accessible, DB category colors darkened to clear 4.5:1 on white, FloatingInput peer-CSS resolution preserved, `prefers-reduced-motion` honored on crisis/safety pages.
- **WCAG tap targets** — 44pt minimum across the app.
- **Performance** — non-layout hover transforms, `scaleX` progress bars instead of width animation, memoized expensive components, explicit image dimensions to stop CLS.
- **Responsive widths** — tables overflow cleanly on narrow viewports.
- **`workers/image-cdn`** — dropped broken Cloudflare Image Resizing path.
- **`workers/submit`** — migrated to Zod 4 `z.record` signature.
- **Hooks** — adopted `eslint-plugin-react-hooks` v7 and fixed 1 real bug it surfaced.
- **`/places`** city query limits raised; `refuge-restrooms` excluded by data_source mismatch fix.

### Security
- Bumped `ws` to 8.20.1 across all workers (CVE-2026-45736).
- Pinned `brace-expansion` ≥5.0.6 (DoS).
- `jose` 5.10.0 → 6.2.3 in `workers/submit`.

### For contributors
- **Toolchain bump** — TypeScript 5.8 → 6.0, Vite 6 → 8, i18next 25 → 26, jsdom 28 → 29, Zod 3 → 4, ESLint 9 → 10, `@types/node` 22 → 25, lint-staged 16 → 17, Playwright/Sentry/pg minor sweeps.
- **Build** — swapped `@vitejs/plugin-react-swc` for `@vitejs/plugin-react`; added manual chunks for `@xyflow` and `@dnd-kit`.
- **`tsconfig`** — dropped deprecated `baseUrl`.
- **ESLint** — color, radius, spacing, and shadow rules now error in public tree, warn in admin.
- **i18n** — full key coverage on `/resources`, `/events`, `/travel`, `/places`; backfill across de/fr/es/it/pt/ja/ko/zh/ru/ar/en (11 locales total).
- **CI** — i18n-check always runs on PRs so the required check resolves; PR smoke retargeted at PR build; dependabot now sees every worker `package-lock.json`.
- **Docs** — `CLAUDE.md` repo counts synced (edge fns 180, migrations 315), typography + spacing rhythm codified, design system files documented.

## [1.0.1] - 2026-04-18

### Fixed
- Correct useEffect dependency array syntax and remove unused useAuth() calls in feedback component
- Remove non-existent hotels and festivals indexes from search-proxy worker config

### Chore
- Update search-proxy worker submodule reference

## [1.0.0] - 2026-04-15

Initial release
