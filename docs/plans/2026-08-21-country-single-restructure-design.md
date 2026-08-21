# Country single restructure — briefing head + sticky rail

2026-08-21. Approved design (brainstorming session). Restructures `/country/:slug`
for compactness and hierarchy on the subway design system, with two shared-shell
upgrades that benefit all five singles.

## Measured problem (production, 2026-08-21)

| | Germany (rich) | Iran (safety-critical) |
|---|---|---|
| Total height | 10,273px (~14 screens) | 17,312px (~24 screens) |
| Preamble before `#rights` | ~1,090px | ~4,360px |
| Rail content vs. column | 1,072px in 8,664px (88% empty) | same |

1. `#rights` — the platform's core value — starts ~2,000px down (Iran: 4,300px,
   because `editorial_long` renders as one unbroken 2,569px `<p>` and the
   practical-info `<dl>` is 1,281px).
2. Desktop rail holds 4 small modules, nothing sticky: after ~1,450px the right
   column is empty AND the TOC is off-screen — an 8-section page loses its
   navigation for 80% of its length.
3. Counts render three times: census strip, FactGrid (Cities), rail StatLine
   (Cities/Venues/Events/Weather).
4. Context modules oversized: venues = 3-col full VenueCards (1,206px), news =
   6 full NewsCards (931–2,649px).
5. FactGrid and CountryPracticalInfo are the same idea twice.

## Design

### New anatomy (targets: Germany ~6,500px, Iran ~7,000px)

```
MASTHEAD        flag + name · lead · census · actions          (unchanged)
SAFETY LAYER    GeoSafetyBanner + SafetyVerdict, full width    (unchanged — e2e-bound)
BRIEFING BAND   2 columns on lg:
                  left:  editorial_long, paragraph-split, line-clamp-6 + expand
                  right: CountryFactSheet (merged FactGrid + PracticalInfo +
                         weather-now) + height-capped photo inset
BODY (1fr)                         │ RAIL (360px)
  #rights  (+ Legal record folded  │  map inset
            in as sub-block)       │  ┌ sticky group ┐
  #cities  StopList cap 8 + see-all│  │ vertical TOC │
  #venues  compact rows, cap 6     │  │ provenance   │
  #events  OccurrenceList (as-is)  │  └──────────────┘
  #travel  (as-is)                 │
  #stats   compact stat band       │
  #news    headline rows, cap 5    │
FOOTER          personalities · nearby · marketplace · similar · end-of-line (as-is)
```

### Shared shell changes (all five singles)

- **Sticky rail group**: the `SinglePage` aside already stretches to full body
  height; a `StickyRailGroup` wrapper (`lg:sticky lg:top-8 lg:self-start`)
  holds the vertical `SingleRouteRail` + provenance, so the TOC travels with
  the reader. Fixes dead space and lost navigation in one change. No overflow
  risk: the sticky group is well under viewport height.
- **`SingleSection` `variant="compact"`**: same `h2` token (rank table intact),
  tighter internal spacing, for demoted context sections (stats/news/travel).
- Mobile horizontal TOC and stacked reflow unchanged.

### Country-specific changes

- **`CountryFactSheet`** (new): one dense `dl`, 2-col in the briefing column,
  small cells, data-bearing rows only — replaces FactGrid usage +
  CountryPracticalInfo. Weather moves here; the rail **StatLine is deleted**
  (triplicated the census counts).
- **`editorial_long`**: split into real `<p>`s, clamp 6 lines + expand toggle.
  (Crawler JSON-LD comes from the edge middleware; nothing SEO-relevant hides.)
- **Legal record folds into `#rights`** as a sub-block (VersionHistory + full
  timeline link). `#history` deep links resolve as an alias to `#rights`.
  8 stations → 7.
- **Venues**: card grid → compact row list (name · city · category), cap 6 +
  see-all. **News**: 5 compact headline rows (date · title · source),
  OccurrenceList grammar.
- **Photo inset** moves into the briefing right column, `aspect-video` capped.

### Deleted

FactGrid usage on country · rail StatLine block · standalone `#history`
section · mid-body GeoPhotoInset placement.

### Guardrails

- `SafetyVerdict` copy/position/death-penalty re-escalation untouched
  (six `rights-safety.spec.ts` assertions). `#travel` no-deals rule untouched.
- Four geo-singles invariants hold: sections/stations from one filtered array;
  self-hiding composite rails stay in the footer; census renders zeros;
  no viewport-keyed grid in the rail.
- Design system: soft re-skin rules, yellow track TOC, no new color tokens,
  8pt spacing, i18n keys for all new strings.
- City/village pick up the sticky TOC automatically; briefing-band adoption
  for them is a follow-up, not this PR.

## Measured result (local dev, 1440px viewport, 2026-08-21)

- Germany: preamble before `#rights` 1,090 → **586px**; venues 1,206 → 525;
  news 931 → 429; cities 1,033 → 717; total ~8,150px with the full rights +
  legal-record content intact.
- Iran: preamble 4,360 → **918px** (editorial clamped 2,569 → 218; merged fact
  sheet 1,497 → 346); total **5,777px** (was 17,312 as measured).
- Sticky TOC verified `position: sticky` at lg; at 390px the horizontal TOC
  renders, the vertical one hides inside the group, provenance still shows,
  no horizontal overflow.
- Note: the pre-restructure Iran figure was captured while the browser pane
  had collapsed to a narrow viewport, so it overstates the desktop baseline —
  the per-module deltas above (same-width before/after) are the honest
  comparison.
