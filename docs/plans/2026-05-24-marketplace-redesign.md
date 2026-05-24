# Marketplace v2 — Editorial Atlas Redesign

**Date:** 2026-05-24
**Status:** Approved design, not yet implemented
**Author:** tmaeder (with brainstorming via Claude)
**Surface:** `/marketplace` and all sub-routes

## Problem

Today's `/marketplace` is a generic faceted commerce grid:
- One mixed batch of listings regardless of who's looking — `home_city_id`, `interests`, `marketplace_favorites`, recent views all exist in the DB but are unused on this page.
- Filters work but lack the dimensions queer travellers actually care about (community-owned, ships-to, near-me).
- No editorial voice — the page promises a curated LGBTQ+ marketplace but reads like a category dump.
- No mechanism to surface why a listing matters or who picked it.

## Goal

Transform `/marketplace` into a Wirecutter-style editorial atlas of LGBTQ+ commerce:
- Recommendation-first, with editor-written rationale on every pick.
- Personalized by city, interests, and behaviour (soft for anons via IP-geo, deeper for signed-in users).
- Honest discovery gamification (collection progress, reading streaks, "local supporter") — no XP, no badges, no leaderboards.
- Browse mode preserved as the shopping escape hatch behind one route.

## Approach selected

**C — Guide-First Atlas.** Marketplace as a stream of weekly *Guides* in the Wirecutter tradition. Each guide has an editor intro, "Our pick / Also great / Upgrade pick / Budget pick" tiers with rationale, a comparison table, and exclusion notes. Personalization decides which guides surface, in what order, and re-ranks ties inside picks. Browse mode (the current grid + extended filters) lives at `/marketplace/browse`.

Rejected alternatives:
- **A — Editorial spine (pure rails).** Easy, but doesn't earn the Wirecutter authority framing.
- **B — Two-pane recommend + browse.** Reuses code but looks like today's page with personalization tacked on; weak differentiation.

---

## §1 — Information Architecture

### Routes

| Route | Purpose | Content |
|---|---|---|
| `/marketplace` | Editorial home | Personalized stream of guide cards + "Continue reading" + spotlight + 1–2 dynamic rails. **No raw grid.** |
| `/marketplace/guides` | Guide index | All guides, filterable by city/interest/category. Magazine archive feel. |
| `/marketplace/guides/:slug` | A guide | Editor intro → tiered picks with rationale → comparison table → "Why not the rest" → related guides. |
| `/marketplace/browse` | Shopping mode | Current grid + full filter rail (§4). The escape hatch. |
| `/marketplace/c/:slug` | Category | Generated guide-style page (top picks for category in your city) — not a raw grid. |
| `/marketplace/m/:slug` | Merchant | Keep, add "Featured in N guides" backlinks. |
| `/marketplace/p/:id` | Item detail | Keep, add "Why we picked this" + "Compared against" cross-links when listing is a guide pick. |
| `/marketplace/missions` | Progress | Collection progress, streaks, guide completion. Signed-in only. |

### `/marketplace` index stack
1. PageHero (kept).
2. **Pickup strip** — "Continue reading" guides (signed-in only).
3. **Hero guide** — one featured guide as oversized editorial card with first picks inline.
4. **Personalized guide stream** — 6–10 ranked guide cards (§3).
5. **Dynamic rail** — one contextual rail ("Near you in Berlin", "New this week") for serendipity.
6. **City chips** — kept, jumps to city-filtered guide index.
7. **Footer CTAs** — "Browse everything", "List your business".

### Cuts from current page
- Category tiles (absorbed into guide index facets).
- Four stacked rails on index (new / price-drops / most-relevant / picks) → replaced by guide stream + one rotating rail.
- Sort dropdown on index (only on `/browse`).
- View-mode toggle on index (only on `/browse`).

---

## §2 — Guide data model + authoring

### Schema

```sql
marketplace_guides
  id uuid pk
  slug text unique
  title text
  dek text                    -- 1–2 line subhead
  intro_md text
  hero_image_path text        -- R2
  category_slug text fk       -- maps to subcategory_slug
  city_id uuid fk nullable
  audience_tags text[]        -- ['trans','leather','parents','nsfw','health',…]
  status enum                 -- draft|review|published|archived
  published_at timestamptz
  updated_at timestamptz
  author_id uuid fk auth.users
  reading_time_min int
  pick_count int              -- denormalised
  review_due_at timestamptz   -- default published_at + 90d
  meta jsonb                  -- seo overrides

marketplace_guide_picks
  id uuid pk
  guide_id uuid fk
  listing_id uuid fk marketplace_listings
  tier enum                   -- top|also_great|upgrade|budget|avoid
  rationale_md text
  pros text[]
  cons text[]
  position int
  unique(guide_id, listing_id)

marketplace_guide_sections    -- optional, long-form guides
  id, guide_id, position, kind ('prose'|'callout'|'comparison'), body_md

marketplace_guide_reads
  user_id, guide_id, started_at, completed_at, scroll_pct
  pk (user_id, guide_id)
```

### Why this shape
- Picks reference existing `marketplace_listings` — guides ride the existing ingestion pipeline, never duplicate product data.
- `tier` enum is the Wirecutter pattern. Comparison table renders from `pros`/`cons` arrays.
- `city_id` + `audience_tags` are the personalization keys for §3.
- `marketplace_guide_reads` is the only new write-path for gamification.

### Authoring
- New admin route `/admin/marketplace/guides` — list + filter by status.
- Editor: Tiptap (already in stack) for intro + section prose. Picks added via listing search/picker. Drag to reorder, click to assign tier, inline pros/cons table.
- **"Generate draft"** button → existing relevance scorer + Haiku prompt proposes first-cut tier ranking + rationale text. Editor edits, doesn't accept blindly. Reuses the `marketplace-relevance` edge function pattern.
- **Publish gate**: ≥3 picks, ≥1 `top` tier, intro ≥80 chars, hero image present. Pre-flight checker shows what's missing.
- Versioning: existing `snapshot-archiver` worker, point it at `marketplace_guides`.

### Lifecycle
- `review_due_at` default `published_at + 90 days`. Admin dashboard surfaces stale guides.
- Auto-pause guide if >30% of picks are `link_health = broken` (weekly `marketplace-link-checker` already runs).
- Picks inherit listing changes — inactive listings render muted with "no longer available" but stay for comparison context.

### Migration
- One new migration: 4 new tables + RLS (admin write, anyone read published).
- Seed: convert existing 5 Editor's picks + Spotlight content into 1–2 starter guides so index isn't empty on day one.

---

## §3 — Personalization engine

### Signals (all exist except IP-geo)

| Signal | Source | Weight |
|---|---|---|
| Home city | `user_preferences.home_city_id` | high |
| Interests | `user_preferences.interests[]` | high |
| Favorited listings → categories/tags | `marketplace_favorites` | high |
| Recent listing views | `marketplace_listings.views_count` log (add) | medium |
| Recent search queries / saved searches | `saved_searches` | medium |
| Recent guide reads | `marketplace_guide_reads` | medium |
| Trip destinations | `trips` | medium |
| IP-geo city (anon) | new edge function `geo-resolve` (CF `request.cf.country/city`) | low (anon only) |
| Locale / language | `i18next` resolved locale | low |
| Time of year | now() vs Pride dates, holidays | low |

### Ranking — guide stream

```
score(g, u) =
    1.0 * city_match(g, u)
  + 0.8 * interest_overlap(g, u)        -- jaccard(audience_tags, interests)
  + 0.6 * category_affinity(g, u)       -- share of favs/views in g.category
  + 0.4 * freshness(g)                  -- exp decay since published_at
  + 0.3 * editorial_boost(g)            -- manual is_featured
  - 1.0 * already_completed(g, u)       -- demote, don't hide
  - 2.0 * stale(g)                      -- review_due_at passed
```

- Computed in a single Postgres function `recommend_guides(user_id, limit)` returning ordered ids + per-row debug `boost_reason` (mirrors existing `useSearch._boostReason` at `src/hooks/useSearch.tsx:31`).
- Cached per user 15 min in CF KV via `search-proxy` worker.
- **"Why this guide?"** chip on each card surfaces the dominant boost reason.

### Anon path
- IP-geo → home_city candidate (CF `request.cf.city` → match against `cities` table, fall back to country).
- No interests → top-3 popular `audience_tags` globally.
- Soft inline prompt after 30 s scroll: "Set your home city + 3 interests, get this tailored." Stored in `localStorage.qg.softPrefs` until sign-in, then merged into `user_preferences` (existing pattern from `useTravelPreferencesEditor`).

### Signed-in path
- Full scorer with user-only signals.
- "Continue reading" = guides with `marketplace_guide_reads` rows where `completed_at IS NULL`.

### Picks ranking inside a guide
- Manual tier ordering wins. Within a tier, re-rank ties by personalization (merchant location vs user city, price-band proximity to saved-search history). Top-pick label stays; only positions of ties shift.

### Safety rails
- Diversity floor: ≥1 guide from each of 3 categories in top 6 results.
- Hide guides with `audience_tags` containing `nsfw` unless opted in via existing `AdultContentGate`.
- Never personalize away the manually-pinned hero guide.

### Implementation surface
- One new edge function `marketplace-recommend`.
- One new hook `useRecommendedGuides()`.
- Extend `MarketplaceRow` to accept a guide-stream source.
- Zero changes to ingestion / listings code.

---

## §4 — Filters + sort (browse mode)

Only `/marketplace/browse` carries the full filter/sort load.

### Layout
- Desktop: sticky left rail (240px), grid right. Tablet: collapsible top sheet. Mobile: bottom-sheet trigger.
- URL-param state (deep-linkable, shareable) — extends `setSearchParams` pattern at `src/pages/Marketplace.tsx:212`.
- Live result count in apply button: "Show 84 listings".

### Filters — keep
Search, type (products/services), subcategory chips, price range slider (0–500 + 100k tail), location free-text, business type, tags.

### Filters — add

| New filter | Source | Why |
|---|---|---|
| **Community-owned** | `marketplace_listings.community_owned_tags[]` (extend ingestion — relevance scorer can infer ~70%, manual review for the rest) | Core value-prop, currently invisible |
| **Ships to** | `merchant.ships_to_countries[]` | Cuts "looks great, won't ship here" |
| **Price tier** | preset € / €€ / €€€ / €€€€ chips (percentiles of `price_usd`) | Faster than slider for casual users |
| **Currency** | `marketplace_listings.currency` | In-region browsing |
| **Stock / availability** | existing `availability` | Hide sold-out by default |
| **Relevance score floor** | existing `relevance_score` | "Strict mode" ≥0.8 |
| **Featured in a guide** | join `marketplace_guide_picks` | Connects browse to editorial |
| **Near me** | §3 home_city / IP-geo + radius chip (25/100/500 km) | Local supporter use case |
| **Verified** | `last_verified_at < N days` | Trust signal |

### Filters — demote
- Free-text `location` input → behind "Other".
- `tags` TagSelector → behind "More" drawer.

### Sort — refine

| Current | New | Notes |
|---|---|---|
| Most relevant | **Recommended for you** | Wraps §3 scorer; default signed-in |
| Newest | Newest | Keep |
| Price ↑/↓ | Price ↑/↓ | Keep |
| Most viewed | **Most loved** | 7-day weighted favorites + views — less gameable |
| — | **Best value** | `relevance_score × inverse_price_pct` |
| — | **Closest to me** | uses §3 geo |
| Oldest | — | Cut |
| A→Z / Z→A | — | Cut (verify via analytics first) |

### Active filters UI
- Chip row above grid, each chip removable, "Clear all" at end.
- Empty-state messaging gets specific: "No queer-owned listings under €50 in Berlin." + suggested loosening.

### Saved searches
- Already exists. Surface in filter-rail header + auto-prompt "Save this search?" toast after 2 filter changes without nav.
- New: optional weekly email digest toggle on each saved-search row (reuses existing email infra).

---

## §5 — Discovery gamification

Subtle. Honest progress + light streaks. No XP, no badges, no leaderboards.

### 1. Collections (passive progress)

```sql
marketplace_collections
  id, slug, title, description, listing_ids uuid[], scope ('global'|'city'), city_id?
```

- Editor-defined sets ("Berlin queer-owned coffee", "Trans-owned skincare", "Pride 2026 reading list").
- Progress computed from existing `marketplace_favorites` + view log.
- UI: thin horizontal progress bar at top of guide pages + strip on `/marketplace/missions`. Hover → list of remaining items.
- No "complete the set!" copy. Just the count.

### 2. Guide reading streak
- `marketplace_guide_reads.completed_at` already captured (§2).
- Streak = consecutive ISO weeks with ≥1 completed read.
- Surface: small "3-week reading streak" caption on `/marketplace` for signed-in users with streak ≥2. Plain text, no flame icon, no shaming when broken.
- Rationale: rewards habit without punishing absence.

### 3. Local Supporter
- Single computed score per user × city, capped at 100.
  - +5 per saved queer-owned listing in city
  - +2 per visited guide pick in city
  - +10 per completed merchant review
  - Decays −1/week
- Tier labels: Visitor / Local / Local Supporter / Champion.
- Surface: one line on `/marketplace/missions` per city; appears on `CityPage` near "Marketplace" tab.
- Anchors gamification in the real product mission (support queer-owned local biz).

### Deliberately omitted
- No XP / points (cheapens editorial brand, invites farming).
- No badges with shareable icons (off-brand, moderation risk).
- No leaderboards (privacy stance; could out users by activity).
- No streak-loss notifications (anti-pattern for a queer audience with high-stress life situations).
- No daily-missions treadmill — only the weekly editorial guide acts as cadence.

### Privacy + opt-out
- All three opt-in via existing privacy settings ("Show me discovery progress" toggle, default ON for signed-in, OFF for anon).
- No public visibility of progress on profile by default; opt-in to a single line ("Supports queer-owned biz in Berlin · Local Supporter") if user wants.

### Implementation surface
- One new table (`marketplace_collections`), one new view (`v_user_local_supporter_score`), one new route, one new hook.

---

## §6 — Visual system fit

Wirecutter authority inside the existing monochrome design system. **No new tokens.**

### Typography (existing tokens from `src/index.css`)

| Element | Token | Notes |
|---|---|---|
| Guide title (detail) | `text-hero` 64px | Generous tracking |
| Guide title (card) | `text-headline-lg` 32px | |
| Dek | `text-body-lg` 17px italic | The one editorial flourish |
| Eyebrow ("Guide · Berlin · 6 min read") | `text-xs2` 11px uppercase letter-spaced | |
| Section H2 inside guide | `text-display` 40px | |
| "Our pick" label | `text-13` 13px uppercase | Bordered chip, not a badge |
| Pick title | `text-title` 22px | |
| Rationale | `text-body-lg` 17px | Wirecutter signature voice |
| Pros / cons | `text-15` 15px | 2-col desktop, stacked mobile |
| Body prose | `text-body-lg` 17px max-w 65ch | |
| Caption | `text-13` 13px text-muted-foreground | |

### Layout patterns
- **Guide card (stream):** 16:9 hero top, eyebrow + title + dek beneath, 3 pick thumbs as inline strip, "6 min read · 12 picks" caption. `rounded-container` (16px). `border` for depth, **no shadow**.
- **Hero guide:** double-height, image left or full-bleed top, content right, inline "Our pick" rendered so the page reads as one magazine spread.
- **Pick block inside guide:** image left (sticky on desktop), tier label + title + rationale right, pros/cons table beneath. `border-t border-border` between picks, no card containers.
- **Comparison table:** monospace numerics, alternating `bg-muted` rows, `rounded-element`, 24px row padding.
- **"Why this guide?" chip:** small `rounded-badge`, single dot indicator, `text-2xs` 10px. Reuses `StatusBadge` pattern.

### Imagery
- Every guide REQUIRES a hero image (publish gate).
- Pick images: 4:5 portrait mobile, 16:9 landscape desktop, served via existing R2 + on-the-fly resizer.
- One image per pick, NO carousels.
- Scrim allowed per existing exception (`from-black/15 to-black/65`).

### Motion
- Functional only. Sticky pick image scrolling via native CSS sticky.
- `StaggerGrid` on guide stream. No stagger inside guides.
- `prefers-reduced-motion` honored.

### Components

| Component | Status |
|---|---|
| `GuideCard` | NEW |
| `GuideHeroCard` | NEW |
| `GuidePickBlock` | NEW |
| `GuideComparisonTable` | NEW |
| `WhyThisGuideChip` | NEW (StatusBadge-derived) |
| `CollectionProgressBar` | NEW |
| `MarketplaceRow` | reuse, extended for guide stream |
| `MarketplaceSpotlight` | reuse as hero guide variant |
| `MarketplaceFilters` | reuse, extended per §4 |
| `MarketplaceCard` | reuse on /browse, compact variant for inline picks |

### Self-imposed constraints
- No new colors. Not even a "guide accent".
- No badge icons — tier labels are typographic only ("OUR PICK", "ALSO GREAT", "UPGRADE PICK").
- No gradients, no shadows, no hover lifts.
- All `rounded-*` from the semantic trio.
- Guides covering HIV/PrEP, mental health products, or harm reduction inherit the `/help` animation ban (gated on `audience_tags` containing `health` or `harm-reduction`).

---

## §7 — Rollout phases

Six phases, ~22 working days. Each ships behind `marketplace_v2_*` flags.

### Phase 0 — Foundations · ~2 days
- Migration: 4 new guide tables + `marketplace_collections` + RLS.
- New edge functions `marketplace-recommend` (empty stub), `geo-resolve`.
- Risk: zero.

### Phase 1 — Browse mode polish · ~3 days
- §4 filter additions + sort changes + active-filter chip row + improved empty states on current `/marketplace`.
- Extend `useMarketplace`. Add `community_owned_tags` with relevance-scorer backfill + manual admin review.
- **Verify on prod after deploy.**

### Phase 2 — Guide authoring + first guides · ~5 days
- Build `/admin/marketplace/guides` (Tiptap, pick picker, comparison editor, publish gate, "generate draft" AI assist).
- Ship `/marketplace/guides` + `/marketplace/guides/:slug` unlinked from main nav, but crawlable.
- Seed 6–10 starter guides (Berlin, Mexico City + top categories).
- SEO: sitemap entries, JSON-LD `Article` + `ItemList`.

### Phase 3 — Personalized index swap · ~4 days
- Wire `marketplace-recommend` to §3 scoring function.
- Build new `/marketplace` index per §1 stack.
- Flag-gate 50/50 for 7 days. Metrics: scroll depth, guide CTR, time on guide, /browse exits, favorites added, sign-up rate.
- Ramp to 100% only on green metrics.

### Phase 4 — Category + merchant pages re-skin · ~3 days
- `/marketplace/c/:slug` → guide-style.
- `/marketplace/m/:slug` adds "Featured in N guides".
- `/marketplace/p/:id` adds "Why we picked this" + "Compared against".

### Phase 5 — Discovery layer · ~3 days
- `marketplace_collections` admin + seed 8–10.
- `/marketplace/missions` + `CollectionProgressBar` + Local Supporter view + city-page surface + reading-streak caption.
- Privacy opt-out toggle.

### Phase 6 — Polish + cleanup · ~2 days
- Remove flag.
- Drop old code paths (index rails, view-mode toggle on index, old sort options).
- CHANGELOG + `/document-release`.
- e2e specs + `/benchmark` perf budget check.

### Cross-cutting risks
- **Cold start for personalization** — diversity floor + IP-geo + editorial hero (§3).
- **Guide authoring throughput** — "generate draft" AI assist + monthly editorial calendar before Phase 3 ramps to 100%.
- **SEO regression** — keep canonical URL, add `ItemList` schema, run Search Console audit week after Phase 3.
- **Affiliate revenue concentration** — track GMV per merchant pre/post; "rebalance" admin tool to spread top-pick distribution.

---

## Open questions for implementation

- Exact `community_owned_tags` taxonomy (queer-owned, trans-owned, BIPOC-owned, women-owned — what else?). Decide before Phase 1.
- Whether "Continue reading" should auto-mark completed at 90% scroll or require an explicit "Mark as read" button. Default: 90% auto, with undo.
- Whether Phase 3 50/50 cohort split is per-user or per-session. Default: per-user via stable hash so we don't whiplash.
- Editorial calendar ownership — who writes the guides? (out of scope for this doc, but a blocker for Phase 2 → 3).
