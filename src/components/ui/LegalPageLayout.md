# LegalPageLayout

The policy-page shell: **a policy is a subway line, each `<h2>` is a station.**

Used by `CMSRoutePage` for `/terms`, `/privacy`, `/cookies`, `/dmca` and
`/accessibility`. It is not a general page layout — it assumes a single long
structured document with a stable heading outline.

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `title` | `string` | Rendered as the Anton masthead `<h1>`. |
| `subtitle` | `string?` | Lede under the title. |
| `lastUpdated` | `string?` | Pre-formatted absolute date. Never a relative string. |
| `sections` | `RouteStation[]` | `{ id, title, depth? }`. `depth: 2` = an `<h3>` sub-station. |
| `slug` | `string?` | Picks the line's bullet, letter and track from `policyLines.ts`. Omit for an unbranded document. |
| `eyebrow` | `string?` | Defaults to `Legal`. |
| `footer` | `ReactNode?` | Extra blocks after the prose, before the end-of-line card. |
| `children` | `ReactNode` | The prose. `CMSRoutePage` passes sanitized `.qg-cms-body` HTML. |

## Line identities

In `src/components/transit/policyLines.ts`, deliberately **not** in
`ROUTE_BULLET_MAP` — that table is keyed to the `search_documents` entity vocab
and doubles as the source of truth for the map's layer colours
(`mapPalette.test.ts` asserts the two agree). Policies are not entities, and
would collide anyway: `T`-blue is already `trip`, `C`-yellow already `country`.

| Page | Letter | Track |
| --- | --- | --- |
| Terms of Service | `T` | blue |
| Privacy Policy | `P` | green |
| Cookie Policy | `C` | yellow |
| Copyright Policy | `©` | pink |
| Accessibility Hub | `A` | **ink — no track** |

Accessibility runs monochrome on purpose: a page about not depending on colour
should not use colour as its only identity, and it is the one document here
that is not a contract.

## Things that are load-bearing

**The 1100px cap.** The one sanctioned bespoke width in the layout tier. This
is prose with a 224px rail beside it — the page cap (1600) stretches legal text
past a readable measure, and `reading` (768) leaves the prose about 430px once
the rail takes its share. This is also why policy routes are **not** in
`e2e/page-layout.spec.ts`, which asserts the page container's content edge
equals the header's.

**Stations are `<a href="#id">`.** The previous implementation used `<button>` +
`scrollIntoView` and never wrote a fragment, so no section of any policy was
linkable — you could send someone "the privacy page, scroll down", never "the
data-deletion clause". Anchors also give middle-click, open-in-new-tab and
find-on-page for free.

**Station numbers come from a CSS counter,** never from the heading text
(`.qg-cms-body--legal h2::before` in `CMSRoutePage.tsx`). `extractSections`
strips any typed-in `1.` prefix from the DOM as well, so the page is correct
whether or not the DB normalisation has run and stays correct if an editor
types one back in.

**The fragment is only written after the reader moves between stations.** The
first resolve goes from `""` to station 1; treating that as a move made simply
opening `/terms` rewrite the address bar to `/terms#acceptance`. Movement uses
`replaceState`, so scrolling never fills the Back button; a click uses
`pushState`, matching what a native anchor does.

**Scroll-spy is a rAF-gated scroll listener, deliberately not an
IntersectionObserver.** IO was tried first and is the wrong tool here: it reports
*changes in intersection*, and a heading far above the fold has no further
changes to report — after a jump to section 11 the observer went quiet and the
rail stayed pinned to section 1. The question being asked is "where is
everything now", so the code reads positions. The fix for the original defect is
the requestAnimationFrame gate, not the API: the old implementation ran the same
sweep on *every* scroll event, unthrottled.

**The contact address lives here only.** It used to be hardcoded in this
component *and* again in the legal hub, so the two could drift.

## See also

- `src/components/transit/RouteStrip.tsx` — the rail, vertical and horizontal
- `src/components/transit/policyLines.ts` — line identities
- `src/pages/CMSRoutePage.tsx` — `.qg-cms-body` prose styling and section extraction
- `e2e/legal-pages.spec.ts` — the behaviour guards
