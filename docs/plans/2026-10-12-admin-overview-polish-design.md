# Admin overview reliability and polish

Status: approved by the user on 2026-10-12.

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
