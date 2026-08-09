# Design system replacement — Phase 1: Foundation

Source: claude.ai/design project "Queer Guide subway map design" (`2ea9d79f-e3bd-463f-885e-97c06d6ff327`), primarily `Pattern Library.dc.html`, cross-read with `Brand Guidelines.dc.html`, `Icon System.dc.html`, `Logo Options.dc.html`.

## Scope decisions (confirmed with user)

- **Full rebuild across the app** is the end goal, sequenced **Foundation → Public → Admin**. This spec covers **Foundation only** — tokens, primitives, icon system, and the real logo. Public page templates (Landing, Entity, Discovery, Travel, Community, Marketplace, Account, Static/CMS, Geo, News, Trip Booklet, CMS/Community extras) and Admin are separate future spec→plan→implementation cycles.
- **Dark mode is dropped.** Nothing in the source design shows a dark variant — it's a fixed paper/ink poster identity. Theme toggle removed; dark CSS removed rather than left dead.
- **Custom 42-icon wayfinding set is built now** (from `Icon System.dc.html`), as a new component available for use, but **lucide-react is not swapped out wholesale** — the 42 icons are navigation/content-type concepts (search, events, near you, chat, community, health, filter, map, nightlife, nine kink/aftercare-related marks for venue/content tagging, four pride-flag-adjacent marks, etc.), not a full replacement for every UI-chrome icon (edit, trash, chevron, close, upload...). Existing lucide usage across ~821 files is retuned (stroke weight/color), not replaced, and gets replaced page-by-page in the Public/Admin phases only where the new icon fits.
- **Real logo swaps now**: header/footer mark, favicon, manifest icons, OG image — because Header/Footer are shared chrome touched by every page, not a "page template" concern, and shipping new tokens under the old logo would look broken.
- Marketing-only artifacts in the design project — `Logo Animation.dc.html`, `Transit Map.dc.html` (interactive poster), `Pitch Deck.dc.html`, `Trip Booklet.dc.html` (print), `Logo Options.dc.html` (exploration/rejected variants) — are **not implemented as app UI** in any phase. They informed which logo variant to ship (2a / Cupid's transit, confirmed as the single chosen mark) but aren't themselves features.

## 1. Color

Replace the PASTE-UP monochrome + 3-non-semantic-ink system with a light-only, high-saturation palette. **The new inks are semantic** (this reverses the current "ink is non-semantic by construction" rule, which was written for a different design and no longer applies):

| Token | Hex | Role |
|---|---|---|
| `--ink` (foreground) | `#111111` | type, rules, borders, station rings |
| `--paper` (background) | `#FAFAF5` | default surface |
| `--track-pink` | `#FF1F8F` | feminine spectrum / one content-type line |
| `--track-blue` | `#00B4E6` | masculine spectrum / one content-type line |
| `--track-green` | `#2BE05A` | non-binary / one content-type line |
| `--track-yellow` | `#FFD500` | agender-other / one content-type line |

Rules carried over verbatim from the Pattern Library's "Hard rules": track colors are wayfinding, not decoration — one accent per context; the intersection gradient (all 4 blended) is reserved for the master symbol and moments of convergence, never a background wash (this is the one narrow gradient exception, lives in CSS as a utility class, not JSX — consistent with the existing print-layer pattern).

Carried forward as-is, restyled to the new border/shape language but not re-colored:
- `--destructive` stays the one additional semantic hue (payment declines, pipeline failures, irreversible confirms). Needs a shade that (a) clears 4.5:1 as text on paper or is border-gated like the track colors, (b) stays hue-distinct from `--track-pink` in particular (closest neighbor). Exact value is an implementation detail, verified by an updated contrast test (see §6).
- Trip-safety traffic-light colors (`TripSafetyBriefing.tsx`) — unaffected, still the locked safety exception.
- Functional categorical scales (map layers, equality score, password strength, etc.) — unaffected.

`chartPalette.ts` currently outputs a monochrome opacity ramp. Decision: extend it to a qualitative palette built from the 4 track colors (they're already non-decorative/functional by the source design's own logic — "one accent per context" extends naturally to "one accent per series"). This touches a shared lib file, so it's Foundation, but actual chart-consuming pages aren't rebuilt until Public/Admin.

Contrast/fill semantics carry over from the current codebase's existing pattern (inks are fill-only, gated in `tokenContrast.test.ts`): none of the four track colors are used as body text on paper. They appear as filled shapes (circles, chips, bars, the 3px-bordered swatch blocks) with ink or paper as the text/stroke color on top — matching every example in the source files. Yellow in particular has poor contrast as a fill against paper alone; the 3px ink border around every filled shape is what satisfies WCAG 1.4.11 non-text contrast, not the fill-to-page contrast — `tokenContrast.test.ts` needs its non-text check updated to model "border-gated" rather than requiring the raw fill to hit 3:1 against paper.

## 2. Typography

- **Anton** — display/wordmark only. Tight leading, negative letter-spacing, never letterspaced apart, headings and kickers only (the `20px, background:#111` numbered-kicker pattern used throughout the source files).
- **Space Grotesk** — everything else: body, labels, UI, wayfinding. 400 for reading copy, 700 for "station name" emphasis (nav items, card titles, row titles).
- **Inter is dropped entirely.** Both self-hosted as woff2 following the existing convention (`public/fonts/anton/`, reuse existing `public/fonts/space-grotesk/`); no Google Fonts CDN in production (the design file links Google Fonts directly — that's fine for the claude.ai preview, not for the shipped site).
- The existing editorial type scale (`--text-hero-xl/hero/display/headline/title/body-lg` etc.) is retuned rather than replaced 1:1 — the new design's actual sizes in context (96px cover, 64px page h1, 52px section h2, 40/32px sub-heads) get mapped onto the existing scale's rank structure so the "adjacent ranks ≥1.25× apart" rule and the six-layer token-deletion procedure in `docs/design-system/README.md` still hold. Anton being all-caps-weighted and much heavier than Space Grotesk means the existing rank table needs re-validation at implementation time, not a blind value swap.

## 3. Shape

Squared corners everywhere except true circles (station rings, route bullets, avatars, dots) and pills used as line-swatches. This **replaces** the semantic radius trio (`container` 8px / `element` 4px / `badge` 0px) with a single **zero-radius default**; `rounded-full` keeps its existing allowance. The `Deleting a size token is a six-layer change` procedure in `docs/design-system/README.md` applies here too — `index.css`, `tokenCatalog.ts`, `functions/_lib/branding.ts` `SIZE_KEYS`, `customTextSizes`/radius equivalents, and a `branding_validate`-narrowing migration all move together.

## 4. Depth (shadows) — reversal of a locked rule

The current rule ("Shadows disabled... depth comes from the ink plate... `e2e/design-system.spec.ts` asserts `boxShadow` is `none`") is explicitly reversed by this redesign. New rule, taken directly from the Pattern Library's "Card & hard shadow" pattern:

- Every bordered surface: **3px solid ink border, zero radius.**
- Interactive/hoverable elements: on hover, translate **−3px, −3px** and cast a **6px hard-edged ink `box-shadow`** (`6px 6px 0 #111`, no blur — a flat poster shadow, not a soft elevation shadow).
- A "live/urgent" variant (e.g. an active departure-board row, a selling-fast event) casts the same hard shadow in the relevant track-accent color instead of ink.
- Icon-grid cards use a lighter version: `5px 5px 0 #111` + `translate(-2px,-2px)` on hover (see Icon System usage panel).

This replaces the `.plate-offset` misregistration trick (which existed specifically to fake depth *without* `box-shadow` so the old e2e assertion stayed green) — that class and its `data-plate` rotation variants get removed once real `box-shadow` is allowed again. `e2e/design-system.spec.ts`'s `boxShadow` assertion must flip from "always none" to "none at rest, the hard-shadow value on hover/focus for interactive elements" — exact assertion shape is an implementation detail for the plan.

## 5. Core primitives (from Pattern Library's "Core patterns" section)

Six patterns to build/rebuild as real components in `src/components/ui/` (or a new `src/components/transit/` for the map-specific ones that aren't shadcn primitives):

1. **Buttons** — Primary (filled ink, paper text), Secondary (2px ink border, paper fill), Chip (smaller, same border), Active nav (no border — bold text + 3px track-color underline). Hover fills ink or lifts with the hard shadow, never both.
2. **Station ring** — small circle, 3px ink border: open/paper = "place", filled track-color = "typed entity", filled ink = "done/past". Also a pill-shaped line-swatch variant for legends/kickers.
3. **Route bullet** — 38px filled circle, single letter, track-color background, ink or paper text depending on the color's contrast. Types every mixed-content row (search results, boards, admin tables) — letter = content type, color = its line. Needs a stable content-type → letter/color mapping (e.g. V=Venue, E=Event, G=Group, Q=Quest in the example — the real mapping across all ~17 content types is an implementation decision for the plan, informed by `content_graph` type list).
4. **Departure board row** — grid `bullet · time · title · status`, 2px ink border, used for events/milestones/group calendars/Pride week lists.
5. **Line stepper** — SVG bending path with 8px circle stations (filled ink = done, ringed paper = ahead), replaces any straight-line progress bar. Used in onboarding, submit flows, quests, today mode.
6. **Card + hard shadow** — see §4.

Plus the **42-icon wayfinding set** from `Icon System.dc.html`: a new component (e.g. `TransitIcon` with a `name` prop, 100×100 viewBox stroke-only paths, single configurable stroke-width, round caps/joins, no fills, never take track colors — "ink on paper, paper on ink" only). Ships as an available primitive; not wired into existing pages in this phase.

## 6. Testing & enforcement updates (Foundation must ship these, not defer them)

Shipping new tokens without updating the gates that enforce the *old* tokens would leave the repo in a self-contradictory state (CI red, or worse, green-but-meaningless). In scope for this phase:

- `src/components/admin/design/tokenCatalog.ts` — new color/global token definitions (mirrors `index.css`, drift-tested).
- `functions/_lib/branding.ts` `COLOR_KEYS`/`SIZE_KEYS` — extended for the new tokens; a migration narrowing `branding_validate`'s key whitelist, following the documented 4-layer lockstep procedure.
- `eslint.config.js` — flip the radius-literal and `shadow-{md,lg,xl,2xl}` bans (new rules: ban the *old* semantic radius/plate-offset patterns instead where meaningful; allow the specific new hard-shadow utility/token rather than arbitrary `shadow-*`). Hex/rgb/hsl ban, gradient-in-JSX ban, and the marketing-copy ban stay as-is.
- `src/components/admin/design/__tests__/tokenContrast.test.ts` — new `CONTRAST_PAIRS`, fill-only gating for the 4 track colors, updated non-text contrast model (border-gated, see §1), hue-distance-from-destructive check re-verified against the new palette.
- `e2e/design-system.spec.ts` — `boxShadow` assertion flips per §4; "sanctioned ink only" canvas scan updated to the new allowed color set (paper/ink/4 tracks/destructive); the border/line-budget check (currently ≤6 / ≤12 borders per page) is **philosophically inverted** by this redesign (3px borders are now the point, not a smell) — needs rewriting or removal, not just a bigger number; "no Plus Jakarta Sans" check is unaffected; visual regression snapshots get regenerated.
- `docs/design-system/README.md` (the rank table / token-deletion procedure doc) gets updated alongside the token changes it documents.

## Non-goals for this phase

- No page template rebuilds (Public/Admin are separate phases).
- No Transit Map / Trip Booklet / Pitch Deck / Logo Animation implementation.
- No dark mode (removed, not deferred).
- No mass lucide→TransitIcon migration.
- No new gender-symbol iconography beyond what's already in the 42-icon set and the master symbol (the Brand Guidelines' "reclaimed symbology" section symbols are the same glyphs already included).
