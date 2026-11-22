# Observances — annual awareness days as first-class entities

Status: Phase 1 shipped 2026-11-22 (DB #5556; hub in the follow-up PR).

## Problem (measured on prod, 2026-11-22)

Annual LGBTQ+ observances (World AIDS Day, Trans Day of Remembrance, Coming Out Day, …) have no representation. They exist only as loose text:

- **Events:** ~170 live events name one of these days in the title — World AIDS Day 63 (43 cities), TDoR 62 (41), Coming Out Day 28, IDAHOBIT 6, smaller days 1–4. **None are grouped.** `series_key` links recurrences of one organiser's event, not every event on 1 December. `event_type` is arbitrary: World AIDS Day events span 16 types.
- **Coverage:** 9 days before World AIDS Day 2026 there are **3** upcoming linked-by-title events.
- **Tags:** fragmented (`aids-awareness`, `hiv-aids-awareness`, `trans-day-of-remembrance`, `bi-visibility-day`, an IDAHOBIT tag with 0 uses) and **0 event assignments** on all of them.
- **Milestones:** hold the founding history. Corrected during planning: the published "First World AIDS Day" row had been merged INTO an unpublished draft twin by the 2026-08-01 dedup sweep, so `/history/1988-first-world-aids-day` 301ed to a 404 (fixed in #5556). The TDoR founding row is year-precision, not a placeholder. Three more published milestones are merged into drafts (separate session).
- **News:** 62 articles name these days in the title, connected to nothing.

## Decisions

| Question | Decision |
|---|---|
| Reader goal | One hub per observance: meaning + history + this year's events + news |
| Linking | Automatic, two signals (name AND date window); name-only → review; never name alone |
| Scope v1 | Global days + regional variants (per-country date rules from day one) |
| Approach | New `observances` entity (rejected: extend `unified_tags` — no date model, tag pages are glossary pages; rejected: yearly `guides` lists — manual every year, no auto-linking) |

## 1. Data model

```
observances
  id, slug, name, kind ('day'|'week'|'month')
  tone ('memorial'|'awareness'|'celebration')
  summary, body, founded_year, founded_milestone_id → milestones
  tag_id → unified_tags            -- reuse the existing tag; no duplicate prose
  match_terms text[]               -- name signal vocabulary
  window_days_before, window_days_after

observance_dates                   -- regional variants
  observance_id, country_id NULL = global default
  rule: fixed (month, day) | span (start m/d → end m/d) | nth_weekday (n, weekday, month)
  e.g. LGBT History Month: GB span 02-01..02-28; US/CA/AU span 10-01..10-31
       Spirit Day: global nth_weekday(3, Thu, Oct)

event_observances                  -- link + evidence
  event_id, observance_id, method ('auto'|'human')
  evidence jsonb (matched_term, date_offset_days, country_rule_used)
  status ('linked'|'review'|'rejected')
```

**Linker** (nightly pure-SQL job, registered in `admin_automations`):

1. Name signal: `match_terms` hit in title (strong) or description (weaker).
2. Date signal: start date inside the window for the event's own country rule; fall back to the global rule.
3. Both → `linked`. Name only → `review`. Date only → nothing.
4. `rejected` is a tombstone: a human-rejected pair is never re-proposed.

Same linker, second consumer: news articles (Phase 2).

Repairs folded in: dedupe the "First World AIDS Day" milestone, fix the TDoR founding date, set `founded_milestone_id`, consolidate the fragmented tags onto one per observance.

Out of v1: user-submitted observances, calendar rules beyond the three types, translation of `body`.

## 2. Pages

**`/days/:slug` hub**, top to bottom:

1. Masthead — name, next date for the reader's country ("Tue 1 Dec"), one-line meaning; regional note when the reader's country differs ("In the UK: February").
2. This year — linked events grouped country → city, reader's city first, existing `EventCard` + map. Empty: "No events listed for 2026 yet." + submit link.
3. About — `summary` + `body`; History strip from the founding milestone and milestones tagged with the observance.
4. In the news — linked articles.
5. Past years — "2025 · 41 cities · 62 events", one line per year.

**`/days` index** — year list; next 3 upcoming pinned; each row: name, date for your region, this year's count.

**Touchpoints (links only):** EventDetail "Part of World AIDS Day" chip; `/events` Observance facet; homepage "Coming up" gains the next observance within 14 days; `/history` On-this-day band links to the hub.

**Crawlers:** branch in `functions/_lib/detail.ts` + `sitemap-days.xml`; JSON-LD `WebPage` + `ItemList`; meta description = `summary`.

## 3. Tone and safety

| tone | examples | rules |
|---|---|---|
| memorial | TDoR, World AIDS Day | no celebratory copy, no countdown phrasing, no joy motion, `/help` link in masthead |
| awareness | IDAHOBIT, Intersex Awareness, Zero Discrimination | factual voice, "How to take part" block |
| celebration | Coming Out Day, Bi/Lesbian Visibility | normal event-page presentation |

Hard rules:

1. No list of names on TDoR (sourcing, deadnaming and accuracy burden). Link to the vigils instead.
2. Safety gating carries through: linked events in criminalizing countries stay invisible to anon (existing RLS); the hub counts them via the `gated_count_for_location` pattern ("Sign in to view N events in…").
3. All counts (per country, Past years) are computed under the reader's own RLS so totals cannot leak gated events.
4. Health content links the existing glossary tags (`u-equals-u`, `prep`, `hiv`) rather than restating medical claims.
5. `/days/*` is not in the sanctioned joy-motion zone.

## 4. Rollout and checks

**Phase 1 — before 1 Dec 2026**
1. Tables; seed 12 global days + regional rules for LGBT History Month and Coming Out Day.
2. Milestone fixes + `founded_milestone_id`.
3. Linker over the ~170 existing events in dry-run; hand-read every proposed link before auto mode.
4. Minimal hub (masthead, This year, About) + EventDetail chip.

**Phase 2** — `/days` index, news linking, Past years, `/events` facet, homepage slot, crawler + sitemap.

**Phase 3** — observances within 30 days with few linked events feed `run_event_coverage_radar` as source-query suggestions; tag consolidation.

**Checks**
- `observance_signals()` in `check-pipeline-health.mjs`: links total, oldest open review row, upcoming coverage. Warn when an observance within 14 days has < 5 linked events; hard-fail if a gated event is counted for anon.
- Linker unit guard, mutation-tested, fixtures from real titles (a "TDOR" drag brunch in March must not link).
- Prod e2e on `/days/world-aids-day` with a positive control that linked events render.

Seed list (v1 global): World AIDS Day (1 Dec), Transgender Day of Remembrance (20 Nov), Transgender Day of Visibility (31 Mar), IDAHOBIT (17 May), Coming Out Day (11 Oct), Bi Visibility Day (23 Sep), Lesbian Visibility Day (26 Apr), Intersex Awareness Day (26 Oct), Ace Week (last full week of Oct), Spirit Day (3rd Thu of Oct), Zero Discrimination Day (1 Mar), Stonewall anniversary (28 Jun). Each date to be verified against a primary source before seeding.

## Phase 1 deltas (decided while planning and building)

| Design said | Shipped | Why |
|---|---|---|
| rule types fixed / span / nth_weekday | fixed / month / nth_weekday | a fixed span drops 29 Feb in leap years |
| Ace Week in seed | deferred | needs a 4th rule type ("last full week") |
| map on the hub | Phase 2 | |
| reader's country resolved | all regional dates listed | no viewer-country hook exists |
| name signal = title or description | auto-link needs a TITLE match; description-only goes to review | measured: Coming Out Day had 36 description-only in-window matches, mostly events that merely mention the day |
| (not in design) | stale auto links are demoted to review | a moved or retitled event must not keep a public link |
| (not in design) | hub also shows the previous occurrence | most days are months away; TDoR had just passed, so a next-occurrence-only hub read "No events" over 93 linked events |

Measured at launch: 352 proposals; 195 title+date matches hand-read, 195 correct, 0 rejected; 195 linked, 157 in review.

## Phase 3 (part 1) — World AIDS Day coverage, 2026-11-22

Measured 9 days before World AIDS Day: 1,329 live events in its window, **5** naming the day, 0 stuck in staging. Pre-2025 coverage was the 2010–16 Wayback gaycities import. **Bottleneck: missing sources**, not prefilters or the linker.

| Shipped | Why |
|---|---|
| `observance_event_seeds` + `source-observance-events` (daily 01:20) | WAD events sit on organiser pages, one per event; the source stages each page's own schema.org Event JSON-LD. Seeds are hand-curated and each was confirmed from Supabase egress before it went in |
| WAD terms `welt[- ]?aids[- ]?tag`, `… contre le (vih/)?sida` | the spaced spelling missed a live 2026 Zürich event |
| WAD `window_days_after` 3 → 10 | galas/brunches titled "World AIDS Day 2026" run 4–11 Dec; corpus-wide this adds 2 historical links, both correct |

**Not done — next step (coverage radar).** `event_coverage_gaps` is keyed `UNIQUE (city_id)` and `run_event_coverage_radar` only knows major cities, so an observance gap does not fit without a schema change. Proposal: add nullable `observance_id` (+ partial unique index), make `city_id` nullable, and have the radar insert one row per published observance whose next date is within 30 days and has < 5 linked upcoming events, with `suggested_queries` = `match_terms` per source (eventfrog `searchTerm`, Ticketmaster `keyword`) — note `event_coverage_gaps` has **no reader** today (measured by the Phase 2 session), so this also needs a surface that shows it, or it is a table nobody opens. `observance_signals()` already warns on the same condition (< 5 within 14 days), so nothing is invisible meanwhile. Adding seeds for another observance is a data-only INSERT (IDAHOBIT has its own source, `source-may17`, #5590).

Result on prod 2026-11-22: 30 seeds → 30 pages parsed → 24 committed (5 rejected by validate: no city or no timezone; Ferndale MI held at `needs_review` on three soft warnings) → **22 new auto links**, all titles hand-read. Upcoming linked World AIDS Day events **3 → 26** in 24 cities, 0 gated.
