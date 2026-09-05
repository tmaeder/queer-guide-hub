# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### STI guide redesigned as a wall chart — /tags/sti-guide (2026-09-04)
- **The transmission chart printed two of its four practice bands twice.** `sti_transmission_matrix()` returns practices unsorted (`mutual-masturbation` after `cunnilingus`, `scat` last) and the page grouped columns by run-length encoding arrival order, so it rendered six `colgroup` headers with "Anal sex & play" and "Oral & touching" at opposite ends of the chart. Grouping is now by key against a declared vocabulary (`groupPractices`), and an unknown group is kept under its raw key rather than dropped.
- **Every filled risk cell was drawn with no border, against an explicit contract.** `stiRisk.ts` states "never render a fill without it" because the tints measure under 3:1 against paper and clear WCAG 1.4.11 only against their ink edge — and its own test proves that. All 183 marks computed `border-width: 0`. There is now one `RiskMark` component, the only thing allowed to draw a fill, with a test that reads the produced DOM. The border colour is a mode-independent literal (`RISK_MARK_BORDER`): `border-foreground` would have inverted to paper in dark mode, on light tints, in the mode where it is hardest to notice.
- **Nothing on the page is diagonal any more.** Both wide tables rotated their column labels -45° in a 128px header — 23% and 28% of their height — and the labels overflowed the table box and drifted off the columns they named. Labels are upright and wrap in their own column.
- **The chart no longer has to be dragged.** The transmission grid needed 3.66× the viewport at 375px, so a phone showed 3 of 13 practices at a time; the testing table needed 640px in a 343px scroller and pushed "Sample" and "Vaccine?" off-screen. Below `lg` both become blocks — one per infection, worst route first. There is now no horizontal scroll container anywhere on the page at any width.
- **"Match & protect" is gone**, replaced by one block per prevention method carrying its description and the infections it covers. It was an 11×8 dot grid, 663px wide in a 1376px container, followed by the same eight methods repeated as a description list.
- **The testing bars now sit on a labelled 0–16 week axis** with ticks behind them, and each window's value is text beside its bar instead of inside it — at 375px "Rapid test / self-test · 12w+" had been wrapping to three lines inside a 28px box and rendering the overflow paper-on-paper, slicing the number in half.
- **A failed RPC said "0 infections across 0 practices"** over an empty but otherwise complete-looking chart. On a page about which activities carry risk, a blank grid reads as "no risk here"; it now says the reference could not be loaded and links the source.
- **A deep link to a plate no longer decays to plate 01.** `/tags/sti-guide#testing-h` scrolled correctly, then relabelled the route strip and rewrote the URL to `#transmission-h`.
- Also: an infection with no testing-window row vanished from "When to test" entirely, name and vaccine note included; `'toString'` passed the risk-key check and white-screened the route; "Protects against" ordering was whatever Postgres returned and disagreed with the same list on `/tags/<slug>`; the practice bands had `scope="colgroup"` with no `colgroup` elements to name.

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
