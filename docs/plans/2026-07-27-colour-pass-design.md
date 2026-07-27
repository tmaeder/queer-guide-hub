# Colour pass design — "INK, RULE, SPOT" (2026-07-27)

Follows the PHOTOCOPY typography/scale/radius rebrand (#2361, #2364), which deliberately
left the palette untouched. This is the colour phase.

## Why

An audit of all 44 colour tokens across both modes, plus the 10 locked functional
palettes, found three distinct problems that a colour pass has to address together.

**1. Bugs, not taste.** 156 sites wrote `var(--token)` directly into a CSS colour
position. A custom property holding `0 0% 4%` is not a colour, so the declaration is
invalid and dropped: 106 `--muted` backgrounds, 8 `--destructive` error colours and 4
`--muted-foreground` text colours silently did not render. Two undefined-token fallbacks
leaked real chroma into a strict-monochrome app — `rgba(var(--primary-rgb, 59, 130, 246), 0.1)`
rendered **blue** in `PlacesCard`, and `hsl(var(--info, 199 89% 48%))` always rendered
**sky blue** in `TagsCsvImport`. `GroupDetail` painted `color: white` over an undefined
background, giving an invisible avatar initial in light mode.

**2. Borders are the entire depth system and were near-invisible.** Shadows are disabled
by design, so 1px borders carry all structure. `--border` measured **1.32:1** against
white and **1.45:1** in dark; WCAG 1.4.11 wants 3:1 for control boundaries. Nothing in
the repo measured this — no `CONTRAST_PAIRS` entry, no test — so it drifted unchecked.

**3. The palette is mostly clones.** `accent`≡`muted`, `secondary`≡`primary`,
`card`≡`surface`≡`background`, all 8 sidebar tokens ≡ their core counterparts, `warning`
is a *literal duplicate* of `destructive` (so 22 caution states shouted in error-red),
`success` a literal duplicate of `foreground`. The 8 `--cat-*` tokens, `--input-bg`, the
`--text-*` trio and 6 of 8 surface steps have zero consumers. Roughly 10 tokens do all
the work.

## Decisions

| Axis | Decision |
|---|---|
| Hue policy | One Riso spot ink. Reverses the 2026-06-25 monochrome-strip refactor that deleted the berry `--accent-brand` — deliberate. |
| Border weight | Hard rules everywhere: every hairline clears 3:1. |
| Red semantics | `--warning` goes neutral; red becomes exclusively danger. |

## The design

### Hard rules
`--border` / `--input` / `--border-hairline` / `--sidebar-border`: **88% → 58%** light
(3.0:1 vs white), **18% → 36%** dark (3.0:1 vs the 4% page). All four stay equal so the
dead-class trap below cannot bite. This is app-wide (924 `border-border` usages) and
doubles as the fix for an unmeasured WCAG 1.4.11 gap; it also makes the PHOTOCOPY
print-grids on city/venue detail read like real printed tables.

### Text + feedback corrections
| Token | Light | Dark | Why |
|---|---|---|---|
| `--text-muted` | 56% → 45% (4.85:1) | 40% → 62% (7.4:1) | Failed AA in both modes (3.24:1 / 3.45:1) |
| `--destructive` | unchanged | 62% → 48% | White on dark destructive was 3.59:1 — failed AA. 48% gives 4.84:1 and only improves the documented `/help` QuickExit compromise. |
| `--warning*` | → neutral | → neutral | Red means danger only. Matches the existing `--success` convention: differentiated by icon + label, not colour. |
| `--text-primary` dark | 98% → 96% | | Pointless divergence from `--foreground` |

`--background`, `--foreground`, `--muted` and `--muted-foreground` are **not touched** —
paper stays pure white, ink pure black (the xerox reference). This also keeps the
hardcoded `#ffffff`/`#0a0a0a` mirrors in `index.html` and `ThemeProvider.tsx` valid, and
keeps `brandTokens.test.ts`'s verbatim `--background: 0 0% 100%` assertion green.

### The spot ink — non-semantic by construction
`--spot` / `--spot-foreground`, Riso fluorescent pink: **`330 95% 55%`** light
(3.77:1 vs white, clearing the 3:1 non-text bar) / **`330 100% 66%`** dark. Pink is both
the canonical Riso ink and carries queer visual history, which earns it here specifically.

The safety resolution: **the spot ink never encodes state.** Red means danger; pink means
nothing at all — it is just the brand's ink on wayfinding marks. Because it never carries
meaning, it cannot compete with the red contract on a safety-first product.

- Allowed: `::selection` background (black text on pink = highlighter annotation, and
  contrast-safe because the text stays black), active nav underline, focus ring `--ring`,
  inline-link hover underline.
- Forbidden: never small text (3.77:1 fails AA below 18px, so kickers stay muted), never a
  status or state colour, never on `/help` `/safety` `/report-*`, never on the trip-safety
  briefing, equality scale or any risk badge, never on `.rule-heavy` — structural rules
  stay black.

### Declutter
Delete the 8 dead `--cat-*` tokens (zero consumers; absent from `@theme`, the catalog,
`COLOR_KEYS` and the drift test, so removal is free). Stop `--warning`/`--success` being
literal duplicates that silently drift. Deleting the *whitelisted* dead tokens
(`--secondary*`, `--input-bg`, `--text-*`, 6 surface steps) is deferred: it needs a
pre-flight query of `site_branding` for existing overrides of those keys.

## Rollout — three PRs

1. **Correctness.** All of problem 1 above, plus `border-hairline` → `border-border-hairline`
   (the bare class matches no Tailwind utility and silently fell through to the base reset),
   plus a PHOTOCOPY regression: `e2e/design-system.spec.ts` still asserted 16px cards and
   4px badges. Those assertions now derive from the tokens so they cannot go stale again.
   `src/index.css` untouched.
2. **Achromatic recalibration.** `src/index.css` and `tokenCatalog.ts` `COLOR_TOKENS` in
   lockstep — the drift test compares positionally (`:root` first, `.dark` second). No new
   keys, so no migration.
3. **Spot ink.** A new key needs four layers plus a migration: `src/index.css` →
   `tokenCatalog.ts` (`COLOR_TOKENS` + a `CONTRAST_PAIRS` entry) → `functions/_lib/branding.ts`
   `COLOR_KEYS` → a migration redefining `branding_validate`'s `v_color_keys`. Version must
   be **≥ 20260801000000** (the remote history head is future-dated), written as a file for
   CI `db push` — never applied via MCP, which stamps its own version and causes drift.

Contrast maths is not rebuilt: `src/lib/wcagContrast.ts` `contrastVerdict()` already takes
the `"H S% L%"` triple directly and is used to verify every number above.

## Verification

`npm test` (44 drift cases in `tokenCatalog.test.ts`, `brandTokens.test.ts`,
`wcagContrast.test.ts`), `npm run lint`, `npm run typecheck`. The real gate is
`axe-route-sweep` in `.github/workflows/a11y.yml` — ~160 scans over ~40 public routes ×
desktop/mobile × **light and dark**, with axe `color-contrast` enabled and hard-failing on
serious/critical — plus Lighthouse a11y ≥95 on 13 routes. `e2e/design-system.spec.ts`
counts backgrounds whose saturation exceeds 15% and allows ≤5; it is nightly-only, so run
it locally before merging the spot ink rather than discovering a failure after merge.
