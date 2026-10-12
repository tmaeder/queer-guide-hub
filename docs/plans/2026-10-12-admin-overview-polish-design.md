# Admin overview reliability and polish

Status: approved by the user and implemented locally on 2026-10-12.

## Evidence and scope

The live `/admin` overview reports an unreadable system status. Its four health
sources share an all-or-nothing query, while queue-count errors are converted to
an empty successful payload. This can conceal known failures or falsely show
“All clear”. Live mobile and desktop inspection also found unformatted large
counts, ambiguous missing shortcut counts and no visible refresh progress.

Preserve the current paper/ink design, canonical routes, queue risk ranking,
role rules, request budget and existing local admin refinements.

## Approved design

- Surface queue-count errors with Retry. Retain cached counts with an explicit
  stale-data explanation; never represent an unreadable queue as clear.
- Settle each health source independently, retain known failures, name unavailable
  sources and provide Retry. Claim health only when every source is available.
- Show refresh progress, prevent concurrent manual refreshes and respect reduced
  motion.
- Format exact queue counts with separators. Keep queue identity and count on
  the first mobile row; let safety, overdue and impact badges wrap beneath.
- Distinguish loading shortcut counts from unavailable counts and real zeroes.
- Keep section headings readable and preserve the existing feed/rail hierarchy.

## Alternatives considered

A cosmetic-only pass leaves misleading status behavior. A complete admin
redesign expands scope unnecessarily and overlaps recent approved refinements.
The focused reliability-and-polish pass addresses the observed issues first.

## Verification

Test returned and rejected source failures, partial success, complete health,
queue read failures, cached data, retries and role gates. Run focused admin tests,
changed-file lint, the typecheck ratchet and production build. Inspect desktop and
mobile renders of populated and error states. Record any production verification
limits without claiming deployment.

## Completion evidence

- Queue RPC failures now reject instead of returning an empty success. The
  overview shows Retry and explicitly identifies cached counts as potentially stale.
- Health sources settle independently. Known failures remain visible alongside
  unavailable source names. Clear status requires all sources to succeed; the
  grouped health query does not automatically repeat all four reads on failure.
- Refresh has visible busy state. Queue labels and formatted counts remain
  readable with wrapping badges. Missing inventory counts have explicit loading
  and unavailable states; real zeroes remain zeroes. Section headings are legible.
- 58 tests passed across five focused dashboard, queue, query and sidebar suites.
  Changed-file ESLint and the final production build passed. Existing large-chunk
  build warnings remain.
- The final repository typecheck ratchet passed with no new errors. Existing
  baseline type errors are not represented as a clean full typecheck.
- Local fixture inspection covered 1280px, 1440px and 390px with zero horizontal
  overflow. Browser interactions verified health-source recovery, queue-count
  recovery, absence of false clear states, and keyboard queue navigation with
  visible focus. No runtime errors were observed in the verification tab.
- Automatic Impeccable hooks reported no deterministic findings on edited UI.
  Render inspection also corrected the wrapping status indicator on mobile.

Screenshots, fixtures, query-state evidence and check logs are saved in
`/Users/tobiasmaeder/queer-guide-hub/outputs/admin-overview-polish`.
The runtime evidence uses fixture data. No production deployment, permission
change or database write was performed. Existing local refinements are preserved.

## Production release prerequisite

The required CI migration and schema-object checks found 34 already-applied
production migrations absent from main, including four active location guards.
Recovered the existing files from the repository's migration recovery branch,
retaining their applied versions and SQL. Read-only catalog queries confirmed
the guard definitions and their migration-history entries. No production schema
changes are introduced or executed by this recovery. CI must verify the restored
history before the admin release merges.

A further concurrently-applied migration (`99991791810019`) was recovered from
the database history; its reconstructed SQL matches the server-computed MD5.
