# The non-venue split — measured, 2026-09-05

**What this answers.** `docs/audits/2026-09-04-poi-match-rate-measurement.md` ended by
recommending the `nonvenue_candidate` split be sequenced *before* the P3 POI join, on the
strength of one observation: "146 of the 653 unmatched rows are named like organisations
or events." This measures whether that is actionable. **It is not, in the form proposed** —
and the reason is worth more than the recommendation was.

---

## 1. State of the existing flow, measured on prod

| | |
|---|---|
| live venues (`duplicate_of_id IS NULL`) | 25,667 |
| confirmed non-venues | 1,396 |
| …still `review_status <> 'archived'` | **9** |
| …still `seo_indexable` | 0 |
| **events pointing at a confirmed non-venue** | **34, across 4 venues** |
| pending in the review queue | **2** |
| live `category = 'other'` | 6,466 |
| live **non**-`other` | **19,201** |

Two structural facts fall out of that table.

**The queue is empty.** `run_venue_nonvenue_flag` (nightly, `55 3 * * *`) has exhausted what
its regexes can find. Two rows pending against 25,667 live venues is not a backlog; it is a
finished job with no new source of candidates.

**The flagger is blind to 19,201 venues.** Its selector is `category = 'other'`, so a
non-venue filed under a real category is invisible to it forever. Every organisation in the
sample below is filed as `community_center` or `bar`, not `other`.

---

## 2. The signal that was proposed, and why it fails

P3 produced a genuinely new piece of evidence: whether **any** bulk map source has heard of
a row. For Germany, 767 of 1,574 live venues matched neither OSM (1,462,428 POIs) nor
Overture (2,974,889) within 250 m. The hypothesis was that these are disproportionately
not-venues.

Cross-tabbed, the cohort *is* different from the matched one — but only weakly:

| | n | no website | no phone | `category='other'` | neither contact |
|---|---|---|---|---|---|
| matched | 807 | 26% | 38% | 7% | 21% |
| **no match** | 767 | 37% | 50% | **23%** | 30% |

The sharpest available conjunction — **no map match AND no website AND no phone** — selects
228 German rows. Forty were hand-read, one at a time.

**Result: roughly 22 of 40 are real venues. Precision ≈ 40–45%.** The list includes
`KitKatKlub`, `Kantine am Berghain`, `Stagger Lee Cocktailbar`, `Queens Loft`,
`Achilleus Men's Spa & Gaysauna`, `FKK Colosseum`, `Café Palais Fulda`, `Gay Sauna Isensee`.

**KitKatKlub is the whole argument.** It is one of the best-known clubs in the world, it is
certainly in OpenStreetMap, and it did not match — OSM spells it **KitKatClub**. One letter,
`C` for `K`, and every name key we have (exact, de-spaced, core-token) says "no such place".

So: **absence from a map extract does not predict absence of a venue.** It predicts name
drift, transliteration, recent openings, and small-town coverage gaps at least as strongly.
Any flagger built on it would archive real venues at a rate of better than one in two.

This is the same failure the P3 build already paid for once, one layer up: a name-shaped
"not a venue" guard was built, measured, and deleted because it suppressed `C/O Berlin`, a
photography gallery whose name the `c/o` pattern matched. **Two independent attempts to
infer non-venue-ness from a cheap signal, two negative results.**

---

## 3. What the sample actually shows

The rows that genuinely are not venues are not junk. They are **misfiled**, and they sort
into three destinations that already exist in this schema:

| shape | examples from the sample | belongs in |
|---|---|---|
| geographic feature | `Sylt`, `Borkum`, `Englischer Garten`, `Parc National de la Suisse Saxonne`, `Harzer Naturistenstieg` | `geo_places` / `landmark_kind` — the landmark spine, which holds **6 rows** |
| organisation | `Lambda e. V. Berlin-Brandenburg`, `Fetish Gay Community NRW e.V.`, `QUEER Darmstadt` | `organizations` (`promote_entity_to_organization` exists) |
| event / series | `Nasty Pig @ Brunos`, `Berlin Club Tour` | `events` |

**The existing flow cannot express any of this.** `decide_venue_nonvenue` is binary —
confirm and archive, or reject and keep. A national park is not "not a place"; it is a
landmark filed in the wrong table, and archiving it deletes a real destination from the site
rather than moving it. That is why the queue drained to 2 and stayed there: the rows left
are ones a reviewer cannot honestly action with the buttons available.

Note also that `promote_entity_to_organization('venue', …)` **links** a venue to a new
organisation and never dispositions the venue row — it keeps its category, its
`review_status`, and its place in the directory. There is no move that both creates the org
and retires the venue.

---

## 4. What this PR ships, and what it does not

**Ships — the safety gap, which is not hypothetical.** 34 events across 4 venues already
point at a row archived as "not a venue". `archive_city_as_nonplace` has refused to archive
a city with content since the day it shipped ("A false positive here silently delists a real
destination, so this guard is not advisory"); venues never got the same guard. Added, with
an explicit `p_force` override so the admin is not dead-ended on the patroc-style cohorts
where the events are junk too — and the orphan count is recorded on the row either way.

The client half ships with it and is not optional: the guard refuses by **returning**
`{ok:false}`, not by raising, so Supabase leaves `error` null and hands the refusal back as
ordinary `data`. Before this change the mutation resolved, `onSuccess` fired, the queue
refetched, and the admin was told the venue was archived while it was still live.

Also repairs the 9 confirmed-but-unarchived rows — the worst of both states, since the queue
treats them as decided and the site treats them as venues — and adds
`venue_nonvenue_hygiene()` so that state cannot drift again unobserved.

**Does not ship: any new automatic flagger.** Measured at ~40% precision on the best signal
available, on a corpus where a false positive delists a real venue. The honest next step is
not a better threshold; it is giving the reviewer somewhere to put a park.

---

## 5. Recommended next step

Not "flag more rows". **Widen the disposition, not the detector**: a route-to-landmark and a
route-to-organization action on the existing review queue, so the 6,466 `category='other'`
rows can be dispositioned by a human into the tables that already exist. The landmark spine
holding 6 rows against a corpus containing islands, parks and trails is the clearest
evidence that the missing piece is a destination, not a classifier.

Until then the flagger should stay as it is. It is exhausted rather than broken, and every
attempt so far to extend it by inference has been measured and rejected.
