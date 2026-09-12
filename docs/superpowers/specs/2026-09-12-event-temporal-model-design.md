# Event temporal model — schedules, recurrence and programmes

**Date:** 2026-09-12
**Status:** approved design, not yet planned

One spec covering two things the current schema cannot express: **when an event is on**
(point, run, opening hours, recurrence) and **how events nest** (festival → days →
sub-events). They are one spec because both are answers to "when is this thing
happening", and designing the grouping layer twice is the failure this replaces.

---

## 1. Findings — measured on prod, 2026-09-12

### 1.1 The machinery exists and is fed 8 rows

`events.parent_event_id` → `events_programme_depth_guard()` (exactly one level) →
`event_programme()` RPC → `useEventProgramme` → `EventProgramme.tsx` → parent backlink on
the masthead → children hidden from the browse feed (`useEvents.tsx:205`) → merge core
refuses to merge an umbrella with its own child → nightly `event_programme_link` cron.

All of it works. `parent_event_id` is set on **8 of 48,000 live events**. `festival_id`,
`group_id`, `recurrence_rule` and `pride_subtypes` are set on **zero**.

### 1.2 Four ways to express "when", three empty

| Mechanism | Rows | State |
|---|---|---|
| `parent_event_id` + programme | 8 | works |
| `series_key` / `series_size` / `series_next` | 1,921 / 194 series | works |
| `event_occurrences` + `expand_event_recurrence` | 0 | dead |
| `festivals` + `events.festival_id` | 0 / 0 | dead |
| `events.recurrence_rule` jsonb | 0 | dead |
| `events.pride_subtypes` | 0 | dead — no writer has ever existed |

`events_in_window(timestamptz, timestamptz)` reads `event_occurrences` **and** filters
`e.status = 'published'`, which is not a legal value (`events_status_check` allows
`active/cancelled/postponed/completed`). Dead two independent ways. A second 5-arg
overload exists, so a PostgREST call resolving by argument name is ambiguous (42725).

### 1.3 "Recurring" names three unrelated things, and the two live signals never co-occur

Measured: `is_recurring AND series_key IS NOT NULL` → **0 rows**.

| Axis | Stored as | Rows | Meaning |
|---|---|---|---|
| **Edition** | `is_recurring` + `recurrence_pattern` (98% `'annual'`), `edition` | 1,081 | returns next *year* |
| **Recurrence** | `series_key` + materialised feed rows | 1,921 / 194 series | repeats *within* a season |
| **Run / opening hours** | nothing | — | one thing, open or playing across a span |

`recurrence_pattern` is not a recurrence rule. It is the edition axis wearing the word —
which is why `festivals`, the intended edition table, stayed empty: the concept was
already living in a text column.

### 1.4 The feed horizon is being mistaken for the schedule

`siegessaeule` publishes a rolling ~3-week window. "Yoga for Queers" — a weekly class —
therefore exists on the site as **3 dates and then nothing**. Same for `Samstag in der
Olfe`, `Sunday Sex`, `Klubnacht`.

**87 of 194 live series run dry within 90 days** (37 within 30). Nothing extends them;
`expand_event_recurrence` has never run.

### 1.5 Inference is viable but must not publish

Of 194 live series, **155 pass** a strict test (one weekday, one clock time, ≥3 distinct
weeks). They carry an *independent* corroborating signal: the German titles name their own
weekday and it agrees — `Die Montagsspieler` on Mondays, `Sonntagscafé` on Sundays,
`Dienstags-Club` on Tuesdays, `Jungschwuppen Mittwochsclub` on Wednesdays. That is a second
signal, not a restatement of the gap analysis.

The other 39 (multi-weekday) provably contain **all three kinds**, so structure alone
cannot classify them:

| Pattern | Example | Real shape |
|---|---|---|
| Service open several days/week | `Regenbogenhaus & Bibliothek geöffnet` (88 rows, 3 weekdays, 357-day spread), `Psychologische Beratung`, `Tests auf HIV/STIs` | opening hours |
| Recurring on 2+ weekdays | `Travestie im Kiez` (40 rows, Fri+Sat, 287 days), `Spiele-Treff` (406 days) | recurrence, `byDay:["FR","SA"]` |
| Finite run | `Blinded by Delight` (theater, 201 days), `Platypus`, `Revue: Disco` | run |

A 3-weekday 357-day library and a 2-weekday 287-day drag night are indistinguishable to a
gap analysis. **These route to review, never to a guess.**

### 1.6 Opening hours are being smuggled through the events table

No opening-hours concept exists for an event. `venues.hours` is jsonb,
`geo_landmark_profiles.opening_hours` is jsonb, `scraper_venues.opening_hours` is text —
three names, three shapes; `events` and `hotels` have none.

A Zürich library's opening hours are stored as **112 separate event rows**. The
series-grouping migration flags this in its own header.

869 events span 10–120 days. They carry `00:00:00`, meaning "time unknown" stored as
midnight.

### 1.7 The linker is out of signal, not broken

`event_programme_link` (cron `45 3 * * *`) ran last night and succeeded. Replaying its
predicate read-only: **0 would link, 0 ambiguous, 0 candidates.**

It requires ≥2 shared `dedup_core_tokens` after subtracting city tokens — which only fires
when a child restates its parent's name (`lila. 26: Donnerstag`) — and filters
`status='active'`, so the ~36.5k-row archive is invisible to it. Winter Party Festival 2026
has 30 same-city children in its window, five of which *do* share 2 tokens; all are
`status='completed'` and therefore unreachable.

### 1.8 Display defects

- **All 8 programme children render under a heading reading "Pride Week."** Lanes are
  `parade/festival/week` keyed on `pride_subtypes`, NULL on every row
  (`prideProgramme.ts:67`, `EventProgramme.tsx:160`). A Madrid New Year's Eve party is
  filed under Pride Week. 8/8.
- **Date-range filtering silently drops multi-day events.** `useEvents.tsx:281-285`
  filters `start_date` only; a festival running 1–7 July vanishes when filtering 3–5 July.
  The RPC path is overlap-aware, but any city/type/tag/sort filter forces the client path —
  the normal case from `/events`.
- **JSON-LD emits a flat `Event`** — no `subEvent`/`superEvent`, though both exist in
  schema.org and the data exists. Verified on `/events/lila-queer-festival`: the umbrella
  and its 3 children publish 4 competing indexable pages.
- **Four divergent `formatEventDate` implementations.** `VenueEvents.tsx:30-31` and the map
  popup (`EventsMapView.tsx:209`) ignore `end_date` entirely.

### 1.9 No backend configurability

There is no `AdminEvents.tsx`. Events use the generic CMS, and
`src/config/contentTypes/event.ts` exposes only `is_recurring` (bool) and
`recurrence_pattern` (free text). Not exposed: `parent_event_id`, `pride_subtypes`,
`recurrence_rule`, `festival_id`.

`event_programme_candidates(uuid,int)` was written as "the suggestion list for a
programme-editing admin panel" and granted to `authenticated`. Its only reference in the
repo is the generated types file.

Ingest carries nothing structural — `NormalizedItem` has no parent/schedule field. The
public SubmitForm *does* collect `recurrence_rule` and `festival_id`;
`commit_event_staging_item` drops both.

---

## 2. Design

### 2.1 `events.schedule jsonb`

NULL for a plain point event.

```jsonc
{ "kind": "opening_hours" | "recurrence" | "run",
  "tz": "Europe/Berlin",
  "weekly": [ {"day":"TU","start":"19:00","end":"22:00"} ],  // a LIST — Fri+Sat is ONE rule
  "monthly": {"nth": 2, "day": "TH"},                         // 2nd Thursday
  "until": "2027-06-30",                                      // null = open-ended
  "exceptions": ["2026-12-25"],
  "confidence": "authored" | "feed" | "inferred" }
```

`kind` is load-bearing — it decides the sentence the reader gets:

| kind | reader sees |
|---|---|
| `opening_hours` | "Open today until 18:00" / "Closed today · opens Thu 11:00" |
| `recurrence` | "Every Tuesday 19:00 · next 15 Sep" |
| `run` | "Playing until 30 Nov" |

The library's 112 rows are `opening_hours` misfiled as 112 separate happenings. The
discriminator exists to stop that recurring.

### 2.2 `event_dates` — derived, rebuild-never-repair

```
event_dates (event_id, day date, open_at timestamptz, close_at timestamptz,
             provenance text, source_hash text)
```

`source_hash` is a hash of the rule that produced the row. A row whose hash ≠ its event's
current rule hash is stale. That makes the drift sentinel a join rather than a diff, and
makes "repair" impossible by construction — the only operation is rebuild.

- `run_event_dates_rebuild(p_batch)` on cron, plus a rebuild-on-write trigger so an editor
  sees their change immediately rather than at the next cron.
- **Bounded horizon:** materialise only within `[start_date, min(end_date, now()+18mo)]`.
  An open-ended weekly rule otherwise expands forever.

### 2.3 The no-fabrication rule

`provenance ∈ {confirmed, generated}`.

| provenance | treatment |
|---|---|
| `confirmed` (feed or human) | normal listing, ticket link, JSON-LD, indexable |
| `generated` (from a rule) | "Usually every Tuesday" — **no ticket link, excluded from JSON-LD, excluded from browse-feed date facets** |

Same discipline as `best_time_to_visit` returning null rather than inventing: absence of
evidence is not evidence. A fabricated date that sends someone to a closed venue is
real-world harm.

**The rule becomes authoritative and the feed corrects it**, inverting today's "feed
horizon = the schedule".

### 2.4 Inference proposes, never publishes

- Writes `confidence:'inferred'` and generates `provenance:'generated'` dates only.
- A human or the feed promotes it to `confirmed`.
- An inferred rule the feed stops confirming for N cycles **decays back to review** rather
  than generating forever.
- The 39 multi-weekday series go to review with their observed pattern displayed, because
  that cohort provably contains all three kinds (§1.5).

### 2.5 Retirements

| Retire | Why |
|---|---|
| `event_occurrences` | 0 rows; RPC + RLS both gate `status='published'`, an illegal value; no reader. Replaced by `event_dates`. |
| `events_in_window(ts,ts)` 1-arg | dead twice over; its existence makes named PostgREST calls to the 5-arg ambiguous |
| `festivals` + `events.festival_id` | 0/0 — edition axis lives on `edition` + a series link |
| `events.recurrence_rule` | 0 rows, superseded by `schedule` |

`recurrence_pattern` is **not dropped** — migrated: `'annual'` belongs to the edition axis,
not to `schedule`.

`series_key/size/next` **stays** as the browse-collapse mechanism, now derived from the
rule rather than from observed rows.

Registry row disabled first, then guarded unschedule — never a bare `cron.unschedule`, per
house convention.

### 2.6 Ingest contract

`NormalizedItem` gains `schedule` and `parentRef`; `commit_event_staging_item` writes them.
Today a submitter's schedule dies at commit — the same end-to-end-empty-column class as the
accessibility contract gap.

---

## 3. Surfaces

### 3.1 Editor

- **`ScheduleField`** (`src/components/cms/fields/ScheduleField.tsx`): kind selector →
  weekly grid (multi-weekday, so Fri+Sat is one rule) → `until` → exceptions.
- **Programme panel** on the umbrella's editor: current children with detach, ranked
  suggestions from the existing `event_programme_candidates()`, manual search. This is the
  panel that RPC was written for.
- **Review queue** `/admin/inbox?queue=programme-link`, two feeds (programme links below
  the auto bar; inferred schedules with their observed pattern). Both gated on a precision
  bar **measured from a hand-read sample before launch**, not a guessed threshold — a
  low-precision queue teaches reviewers to rubber-stamp, measured twice already in this
  repo.
- Expose `parent_event_id` as a read-only "Part of" row so the link is visible in admin.

### 3.2 Programme rendering

**The lane system is retired.** By day (default), with a by-type toggle above ~6 children;
type comes from the existing 22-value `event_type`. `pride_subtypes` no longer drives
layout — this kills the "Pride Week" heading at its root rather than renaming it. A
`parade` child keeps a pinned highlight card, the one genuinely special thing about Pride's
shape.

### 3.3 Display fixes

- **Overlap predicate** in `useEvents`' client path — replaces `gte/lte('start_date')` with
  `start_date <= to AND coalesce(end_date, start_date) >= from`, matching the RPC path.
  Ships alone; affects all 9,657 multi-day events.
- **One formatter** — consolidate the four onto `src/lib/event-time.ts`, which already has
  real all-day detection. Keep its convention that `00:00` prints nothing rather than
  "starts at 00:00" on a 71-day exhibition.
- **SEO** — `subEvent` on the umbrella, `superEvent` on children,
  `openingHoursSpecification` for `opening_hours`. Generated dates are excluded from
  JSON-LD; that is the no-fabrication rule reaching the crawler.

### 3.4 The 112-row collapse

Folding `Regenbogenhaus & Bibliothek geöffnet` into one row deletes 111 live pages. Route
it through the existing reversible merge core so `event_slug_redirects` gets its rows and
`unmerge` works — **never a bare DELETE**. Only after the schedule machinery is proven, and
only for rows a human has confirmed are opening hours.

---

## 4. Sweep

Full archive, including the ~36.5k past events.

The batch cap can be raised, and CLAUDE.md's reason for keeping it at 300 is stale:
`search_documents_sync` now only inserts one row into `search_reindex_queue` (verified —
the function body is a single INSERT). The 14.6s figure was the old inline index, since
measured at 0.96s. Live check: queue depth **0**, drain healthy, last run 30s prior.

48k events → 48k queue rows → ~48 min at the drain's 1000/min. **2,000 per batch**, drain
depth watched between batches, stop if it stops returning to zero. Batches, not one
statement — a timeout is a full rollback.

---

## 5. Guards — `event_schedule_signals()`

Wired into `scripts/check-pipeline-health.mjs`.

| Signal | Severity | Catches |
|---|---|---|
| `generated` date in `search_documents` or JSON-LD | **hard fail, zero tolerance, no baseline** | fabrication reaching a reader |
| index rows whose `source_hash` ≠ their rule's hash | hard fail | derive job dead or drifting |
| series whose confirmed dates run dry within 30d | warn | the Yoga-for-Queers decay — no such signal exists today |
| inferred rule unconfirmed for N cycles | warn | inference outliving its evidence |
| probe returned no rows / key absent | **hard fail, reported separately from a zero count** | an undeployed sentinel reading as a clean corpus |

Every count carries a positive control — "zero fabricated dates" also passes on an empty
table or a corpus stripped of generated rows.

---

## 6. Build order

Each step ships alone; the risky one is last. Steps 1–3 are invisible to users, which is
what makes the measurement honest before anything is published.

1. Multi-day date-filter fix + formatter consolidation — pure win, no schema change
2. `schedule` column + `event_dates` + derive job + sentinel — no readers yet
3. Inference → review queue only, writes nothing live
4. Editor: schedule field, programme panel, review queue
5. Display: programme day/type toggle, per-kind sentences, `subEvent`/`superEvent`
6. Ingest contract (`NormalizedItem.schedule`/`parentRef`; stop dropping submitter data)
7. Archive sweep
8. Retirements — registry row disabled first, never a bare unschedule

---

## 7. Open questions deferred deliberately

- **Precision bar for the review queue** is set from a hand-read sample during step 3, not
  guessed here. If the sample comes back below ~80% the queue is not built and the panel
  carries the whole load.
- **Cross-source showtime suppression** — the dedup showtime guard keys on `source_slug`
  equality, so two showtimes of one production arriving from *different* feeds are not
  suppressed. Out of scope; recorded because the schedule work will make it more visible.
- **`series_key` convergence into `schedule`** — the browse-collapse mechanism stays as-is.
  Rewriting a working 1,921-row system buys nothing a reader can see.
