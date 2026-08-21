# /help redesign — "One plate, one list" (2026-08-21)

Approved concept for restructuring `/help` on the soft design system
(2026-08-17 re-skin). Goal: same crisis-UX invariants, ~40% less vertical
height, coherent soft skin. Predecessor: triage-first rebuild #2725
(2026-08-11), which predates the soft re-skin and shipped half-migrated
(soft cards under a hard-subway triage panel).

## Problems in the current build

1. ~300px dead space at the top: breadcrumb → empty band → lone
   "Hide screen" button row → emergency band.
2. Skin drift: CrisisTriage, its buttons, CountryScope, filter chips are
   square hard-border subway idiom; HotlineCard/DirectoryList/MoreSupportBand
   already soft. Two design systems on one page.
3. Vertical bloat: h1 at hero rank, two `text-display` section heads, triage
   panel single-column even at the 1600px cap.
4. HotlineCard stacks 10 zones; 2-col card grid is the tallest way to render
   2–6 lines.
5. Emergency numbers render twice at full weight (band + sticky spine).

## Invariants that carry over unchanged (from docs/design-system/README.md §Crisis)

- No track colors, no animation (accordion/dialog/sheet transitions sanctioned).
- `--destructive` rationed to exactly three uses: emergency strip, QuickExit,
  per-line "may contact police" warning. Non-carceral policy renders in ink.
- Life-safety blocks render synchronously with inline English defaults.
- One ranking (`selectPrimaryLine`) feeds both the visible CTA and the
  EmergencyService JSON-LD.
- Unknown hours render as silence, never "Closed".
- Directories are never presented as callable lines (0 `<article>` on /help/int).
- 320px reflow gate, `e2e/help-a11y.spec.ts` + `e2e/help-crisis.spec.ts` +
  `e2e/help-locale.spec.ts` keep passing (selectors were checked: rows stay
  `<article>`, CrisisBar keeps the "In acute danger?" h2 and a `tel:112` link,
  `main h2` order is preserved).

## Zones

### Z1 — CrisisBar (new, replaces EmergencyBand + the lone HideScreen row)

Slim full-bleed red row, first in DOM, synchronous:
`⚠ In acute danger? — Call now: 112 (EU) · 911 (US/CA)` with the numbers as
`tel:` links (previously plain text in the band). HideScreen moves into the
right side of the same row. NOT sticky — the 2026-08-11 decision stands
(a persistent red slab trains blindness against the police warning); the
sticky filter spine keeps its ink 112/911. Saves ~180px.

New i18n key: `help.emergency_call` ("Call now:"), hand-translated into all
11 locales (never `i18n:fill` placeholders on this page). `help.emergency_body`
stays in the bundles (other locales' markers) but is no longer rendered.

### Z2 — Crisis plate (CrisisTriage restructured)

- `rounded-panel` (26px) ink slab with `shadow-soft`; buttons/boxes inside get
  `rounded-element`. Outline-on-ink buttons keep their borders (the edge IS
  the component — sanctioned border use).
- h1 drops `display/hero → headline/display`.
- lg+: two-column grid. Left = act (recommended label, line name,
  availability, Call CTA, closed-fallback, can't-speak channels). Right =
  steady (kept lines, "what happens when you call", self-help drawer), split
  by a `border-background/30` hairline. Mobile stacks in today's order.
- All selection logic (hero ranking, `selectOpenAlternative`, unknown-hours
  silence) untouched — this is layout only.

### Z3 — Directory: cards → expandable rows

- Section head `display → headline`. Sticky spine unchanged in function;
  chips get `rounded-badge`.
- Single-column rows inside one `rounded-container bg-card shadow-soft` list,
  hairline dividers. Each row is an `<article>`.
- Always visible per row: name, open state / raw hours, inline meta text
  (24/7 · Free · Anonymous · affiliation · country when unscoped), compact
  Call button with number, the FIRST non-voice channel (can't-speak stays one
  tap without expanding), keep toggle, expand toggle (aria-expanded, no
  transition).
- `reports_to_police === true` strip stays ALWAYS visible under the row
  header — never behind the expander.
- Expanded region: description, remaining channels + website, topic links,
  languages, provenance, non-carceral note (`false` case), report dialog.
- New i18n key: `help.details` ("Details") for the expander label.
- `HotlineCard.tsx` retired; `HotlineRow.tsx` replaces it. DirectoryList rows
  stay as-is.

### Z4 — More support

Three separate cards merge into one `rounded-container` card with three
columns divided by hairlines; head `display → headline`. CoverageNote and
disclaimer unchanged.

## Docs

`docs/design-system/README.md` §Crisis surfaces is updated in the same PR:
the "3px ink borders / `--shadow-hard`" weight line predates the soft
re-skin; weight now comes from the ink-flooded plate, inversion and hairline
rules under the soft tokens. The no-track-colors / destructive-rationing /
animation-free / silence rules are unchanged.

## Expected outcome

- Schweiz-scope page ≈3,660px → ≈2,300px; 6-line countries compress ~3×.
- One skin: panel 26 / container 18 / element 12 / badge 9, soft shadows,
  hairlines. No new chromatics, no motion.
