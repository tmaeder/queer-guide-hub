# Unified inbox

Approved by the user on 2026-11-24.

## Structure

Four primary categories: All, Conversations, Mail, Updates. Matches and groups
are contextual filters under Conversations; alerts appear under Updates. Keep
legacy filter links working. Trips remain available as context rather than a
primary category. Preserve existing authorization and opt-in gates.

## First implementation

- URL-backed unread toggle, clear row hierarchy, timestamps, consistent unread
  indicators, visible touch-accessible actions, and pinned-first ordering.
- Useful loading, error, empty, search, and pagination states.
- Horizontally scrollable category navigation on phones; focused full-screen
  detail with a back action, keyboard-aware viewport, and preserved rail position.
- Growing multiline composer with secondary tools behind one disclosure.
- Session-scoped drafts keyed by account and conversation; clear only after
  confirmed success. Keep failed text, reply/edit context, and staged attachments
  available for retry. Prevent concurrent submissions and IME Enter submission.
- Preserve reading position for incoming messages; offer a new-message control.

## Validation

Test category nesting and legacy links, unread filtering and search isolation,
selection/back navigation, multiline and IME behavior, draft isolation, failed
sends and retry, and scroll behavior. Run focused tests, lint, type checks, build,
and inspect the rendered mobile and desktop interface.

## Deferred

Message requests, new privacy controls, automatic importance ranking, swipe
shortcuts, and new messaging features are outside this first pass.

## Release preparation

The original checkout was behind the production branch and resolved dependencies
from another worktree. Its clean lockfile install restored the missing boneyard
React entry point and removed the dependency-related type errors. The remaining
trip-card accessible label now uses the existing getPlaceName helper.

The production release is based on eeb44a87a (current main on 2026-11-24), with
only the approved inbox work ported across. It retains standalone /messages,
inline mail composition, sent-mail previews, validated canonical mail selection,
shared unread counts/realtime, and private user-photos attachment paths. It does
not deploy the unrelated changes in the original working directory.

- 59 targeted tests passed across 17 files, including the current mailbox flow.
- Scoped ESLint passed; locale completeness, placeholders and public sync passed.
- The production Vite build passed. No type-check baseline is changed.
- New strings are translated in all eleven supported locales.
- The original implementation was reviewed at desktop, 390px and 320px widths,
  including a shorter 420px viewport. Production verification follows deployment.
