# Review worklist implementation verification

The production backend now maintains independent cases without deleting the
underlying detector rows. After the precision correction, the measured worklist
contained 1,058 ready cases, 4,750 research cases and one blocked case. These are
moving populations; they are not a claim that the research backlog is resolved.

- 813 artwork findings consolidate into 30 reviews. Per-finding selection and
  exclusions remain available; a group decision verifies every selected source
  before calling the native per-source dispatcher.
- Ten product counts were recomputed against active canonical listings. Before
  and after values are retained in `admin_review_repairs`.
- 288 category prompts without any proposed subtype received an explicit machine
  disposition retaining the valid neutral category. No subtype or human review
  was invented. The current detector evidence hash prevents unchanged reopening.
- The first tracked network worker run completed successfully. A local SQL pass
  searched 100 cases, separately from the network attempt budget. Weak fuzzy
  proposals found in the pilot were superseded and retained in the attempt
  journal. The stricter proposal threshold is 0.80; exact matches still require
  uniqueness across the whole exact-name set, compatible canonical geography,
  the coordinate-distance gate and no occurrence collision.
- A 50-case request measured 217 ms after source authorization was calculated
  once per request. Original source-level role restrictions remain in force.
- Anonymous invocation of `review-research` returned HTTP 401. Browser roles
  cannot claim jobs, submit worker results or select internal research tables.

Applied migration versions, committed exactly as recorded in production:

1. `20261021175220_review_ready_cases_and_research`
2. `20261021175735_review_case_read_performance`
3. `20261021180120_review_research_candidate_precision`

The third migration was already in flight when the coordinated email-release
schema freeze arrived. Its exact file was committed, pushed and communicated to
the release chat; no further production schema changes followed during the freeze.
Four previously applied matching migrations were copied verbatim from the shared
release checkpoint to keep the ledger complete, without replay or renumbering.

Local verification covered the affected frontend tests, six source-retrieval
tests, the Deno endpoint typecheck, the project TypeScript ratchet (698 existing
errors, none new against baseline 782), ESLint and a production build. A
rolled-back database regression exercised case keys, role restrictions, lease
exclusivity, stale-result rejection and retry backoff.

Desktop (1280×800) and mobile (390×844) browser checks used synthetic case data
with the production build and intercepted backend requests. Both had zero page
overflow in either direction, no browser runtime errors, and visible decision
controls. The first visual pass found crowded desktop filters; the final pass
confirmed three primary case tabs plus a separate raw-source selector and an
independent search/filter row. Native authenticated CI verifies the real backend
contract separately. Preview screenshots are fixtures, not production captures.

Remaining limitations are explicit: source failures and unresolved identities
stay in Research or Blocked; a matching business name never verifies ownership;
an identity candidate never changes city indexing; accepting shared artwork
does not resolve unrelated media findings. Raw task and detector views remain
reachable from the workspace.

Live follow-up found that the research endpoint's redundant full refresh exceeded
PostgREST's statement timeout after results had already been saved. Three such
runs triggered the circuit breaker. Version 3 removes that refresh; the separate
five-minute SQL refresh succeeds within its 90-second budget. The corrected
worker passed a four-case HTTP 200 probe and its original schedule was restored,
with failures reset through an audited operational repair. Fresh CLI metadata
confirmed version 3 after deployment API metadata disagreed with the listing.

The already-applied security follow-up migration `20261021183535` was recovered
verbatim from the security release worktree so the release ledger stays complete.
It preserves the review RPC contracts and staff guards while moving privileged
implementations into the private schema. It was not replayed or renumbered.
