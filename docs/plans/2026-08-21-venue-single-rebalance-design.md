# Venue single — rebalance, not compaction

2026-08-21. Third in the series after the country restructure and the city
compaction, and the **premise did not carry over**: the venue single has no
length problem.

## Measurement first

| Page | Height | Body content |
|---|---|---|
| Country (before its fix) | 10,273px | — |
| City (before its fix) | 12,518px | — |
| **Venue, richest in corpus** (Stonewall Inn) | 3,422px | 1,779px |
| **Venue, typical** (West Side Club) | 2,516px | **301px** |
| **Venue, thin** (Lehighton) | 2,599px | **274px** |

The venue single is short because the corpus is thin. Across **25,186 live
venues**: hours 2.5%, amenities 8.4%, accessibility **0.0%**, price 2.2%, a
real description (>40 chars) 46.1%, contact 43.0%.

So the problem was never bulk — it was that a typical venue put **301px in the
1fr column and 1,028px in the 360px rail**. The frame gave the wide column to
almost nothing and squeezed the address, contact links and map into the narrow
one.

## Three duplication/empty-shell defects (all found by measuring, all fixed)

1. **"Visitor signals" printed its heading twice** — `<h2>` from
   `SingleSection`, then `<h3>` from the component's own `CardTitle`. Same
   class as the city description that #2916 removed. Fixed with a `bare` prop.
2. **The signals section had NO `when` guard**, so on every venue with fewer
   than three responses per question it rendered a full heading plus *"No
   signals yet. Be the first to share what this place was like"* and a
   half-life footnote — a zero state pretending to be content on the large
   majority of 25k venues. Now gated on the score, read in the descriptor
   (a component that self-hides is invisible to the section filter — the trap
   the `access` section already documents).
3. **Hours rendered twice** on venues that have them: the descriptor declares
   an `hours` section and `VenueSidebar` also carried an Hours card, both
   behind the identical `hasUsableHours` guard. The rail card is deleted.

Bonus: that `<h3>` carried shadcn's raw `text-lg`, a size the rank table does
not contain — removing the title removed the violation.

## The rebalance

**The rail was not the problem; what was IN it was.** `VenueSidebar` splits:

- **`VenueLocationContact`** → a body **section** (`#location`), map beside the
  contact details from `lg`. A section, not a `bodyLead` block: parked in
  bodyLead it rendered before everything and pushed "About" from 470px to
  1,601px on Stonewall Inn, burying the description. As a section it takes its
  place in the fixed module order and earns a route-strip station.
- **`VenueSidebar`** keeps what is genuinely rail-shaped: destination safety
  card, recent check-ins, correction footnote.

`SinglePage` also gained a fix found the same way: the grid declared
`lg:grid-cols-[1fr_360px]` unconditionally, so a single with no rail rendered
its content at 984px of a 1440px viewport with 360px of nothing beside it. The
track is now declared only when a rail exists.

## Result

| | Before | After |
|---|---|---|
| Lehighton (thin) | 2,599px, body 274 / rail 1,028 | **2,166px**, body 332 / rail 578 |
| Stonewall Inn (rich) | 3,422px, contact squeezed in 360px | 3,536px, contact a 984px section |

Mobile 390px: stacks, no horizontal overflow. The e2e contract in
`detail-content.spec.ts` is unaffected — it locates the word "Contact" and
`.flex.items-center.gap-3 a[target=_blank]` anywhere on the page, never scoped
to an `<aside>`; the markup is unchanged, only its column.

## Not done, on purpose

**The spec modules were not merged.** Even the richest venue is six sections
averaging 178px, which is tempting to consolidate — but the Content Singles
spec's first rule is that module order is fixed across all thirteen types ("a
rider who learns one single has learned all thirteen"). Merging `hours` (module
02) into `access` (module 04) would buy a little height and cost the shared
vocabulary. The fragmentation is a symptom of the thin corpus, and the honest
fix is data, not layout.
