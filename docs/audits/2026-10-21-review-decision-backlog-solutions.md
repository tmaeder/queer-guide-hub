# Review decision backlog: measured causes and solutions

Production audit on 21 October 2026, 19:10–19:20 Europe/Zurich. Initial cached
decision count: 7,641. This count already excludes machine findings; simply
changing the headline or reclassifying every warning would conceal work.

## Implemented correction

The city quality profile checks a `tmp-*` slug before terminal lifecycle states.
Consequently 154 explicitly archived, non-indexable identities with recorded
`not_a_city` dispositions were still labelled unresolved. None has live children
under the profile's existing relationship definition.

Migration `20261021171813_review_lifecycle_terminal_precedence.sql` makes ghost
and merged states take precedence, reconciles only the obsolete lifecycle
question, and refreshes the real queue counts. Production now reports **7,487**
pending decisions. The 154 rows retain machine-labelled resolution history.
The change also restores ghost exposure/child blockers where those apply.

Verification: PostgreSQL parser checks passed across 2,429 migrations. A
transactional production fixture exercised placeholder → ghost → merged with
the same temporary slug and rolled back. Postconditions verify that genuine
placeholder warnings and archived-city child blockers remain detectable.

## Larger causes

| Cause | Measured rows | Correct treatment |
| --- | ---: | --- |
| City lifecycle | 1,847 before fix; 1,693 after | Resolve identity against sources before presenting a choice. 244 placeholders already have a Wikidata ID; validate classification, country and coordinates rather than asking whether they exist from scratch. An ID alone must not publish a place. |
| Geography without corroborated settlement classification | 1,498 | Automated evidence collection. Empty classifications are missing research; conflicting classifications are decisions. 495 overlap with lifecycle questions and should share one case and evidence set. |
| Event venue linkage | 911 detector rows + 706 review tasks | One case per event. 303 upcoming events are represented in both queues. 702 review tasks have an empty candidate array: there is no choice a person can make yet. Research first, retain source venue text, and link only a unique corroborated candidate. |
| Shared event images | 702 URL reuse + 111 content reuse | The URL findings have 20 distinct evidence groups; content findings have 10 hashes. Review clusters with all affected events, preview and source/series relationships. These are at most 30 initial cluster reviews, not 813 independent judgments. Do not equate reuse with incorrect artwork. |
| Event category | 358 | 288 return `other` with zero classifier confidence. Preserve a neutral category and research source facts. Promote a subtype only when supported; a numeric classifier confidence is insufficient evidence. |
| Business quality decisions | 547 | 489 `linkage_unresolved` findings merely say `disposition: pending`. Generate candidates first. Repair 10 product-count discrepancies by computing active canonical listing counts, then rerun the quality detector. |

These groups overlap; their potential reductions must not be added together.
The 606 past public events with unlinked venue findings are a separate archival
workload, not automatically verified venue links or automatically invalid events.

## Recommended implementation order

1. **Decision readiness and durable research jobs.** Route a case to automated
   research when required sources or candidates are absent. Store attempt count,
   last attempt, next retry and evidence fingerprint. Show blocked jobs and their
   causes explicitly; exhausted jobs need an actionable escalation, not a silent
   disappearance. Check the nightly city identifier worker: its latest run failed
   with HTTP 402, while prior runs processed 60 records and filled only 3–5 IDs.
   Fix failure/backoff and repeated-candidate selection before raising frequency.

2. **One case per problem.** Consolidate the two event venue sources and the city
   lifecycle/geography overlap, retaining every detector's evidence and history.
   An action reconciles all related source rows. Group media by content hash or
   canonical URL, with a human-visible affected-event list and per-event exception.

3. **Safe repair workers.** Recompute product counts; rescan already-linked venues;
   validate identity-backed city lifecycle transitions. Use bounded batches,
   provenance, reversible updates, idempotency and actual repair counts. Never
   widen geographical matching tolerances just to increase throughput.

4. **Decision page with a complete choice.** For identity: authoritative classes,
   country/coordinates, alternative identities, map and affected children. For
   venue links: source venue name/address and candidate comparison with distance
   and country. For reused media: actual artwork, source links, event dates and
   series/organizer relationships. Show missing evidence explicitly.

5. **Measure independent work.** Display decision-ready cases, automated research,
   blocked automation, archival tasks and affected records separately. Preserve
   the raw 7,487-row audit count and show the reconciliation between rows and
   grouped cases. Track arrivals, repairs and escalations per day so a lower
   number represents resolved or consolidated work rather than hidden defects.

Success is a substantially smaller, evidence-complete human workload with a
visible research pipeline. A numerical target cannot honestly be promised until
the source-resolution pass measures how many ambiguous cases remain.
