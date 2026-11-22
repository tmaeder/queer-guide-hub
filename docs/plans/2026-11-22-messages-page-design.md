# Messages page + header Inbox — design (2026-11-22)

Move Messages out of `/hub` onto its own page, put one Inbox entry in the
header (replacing the bell), and fix the inbox's data and realtime costs.

## Current state (measured)

- `/messages` redirects to `/hub/messages`; `MessagesModule` renders inside
  `HubShell`. The inbox height is `calc(100vh-320px)` to make room for the hub
  nav.
- The chat/mail unread badge exists only on the hub nav and the mobile Hub tab.
  The header bell counts alerts only.
- Full `useInboxFeed` instances, each with its own realtime channel of 9
  `postgres_changes` subscriptions (6 of them on whole tables with no filter:
  `messages`, `conversations`, `post_likes`, `post_comments`,
  `trip_inbox_items`, `trip_inbox_messages`):
  - `NotificationBell` + `SignalPanel` (`alerts`) — every page, desktop
  - `MobileBottomNav` (`all`) — every page, mobile, used only for the badge
  - `MatchesFilterChip` (`matches`), `GroupsFilterChip` (`groups`) — inbox page
- Chip and bell counts are computed over the first loaded page (30 rows) only.
- The filter is read from `?filter=` once and never written back.
- A DM creates a `dm` notification and a chat thread. On prod, all 4 `dm`
  notifications of the last 60 days are unread: opening the chat does not clear
  the alert, so one message is counted twice.

## Decisions

- Canonical URL: **`/messages`**. No hub chrome.
- Header: **one Inbox icon**, replacing the bell. Messages is removed from the
  hub nav entirely.
- Realtime rewrite is in scope (PR 3).

## PR 1 — page, header Inbox, frontend dedupe (no DB)

Routes
- `/messages` renders the inbox page. `/hub/messages`, `/inbox`, `/mailbox`,
  `/hub/contacts`, `/me/groups` redirect to it with the query string preserved
  (stored `open_target` values such as `/messages?conversation=…` keep working).
- Remove `messages` from `HUB_MODULES`, `HubPage`, `MobileHubSheet`, the hub
  Overview links; the mobile Hub tab loses its unread badge.
- Update `functions/_lib/appRoutes.json`, the redirect inventory manifest,
  in-app links (`GroupDetail`, `SignalPanel`, `TravelForwardingSettings`,
  `MessageInput`, `ItineraryChatCard`, `AdminMailbox`, edge-function email
  links) and the e2e specs that name `/hub/messages`.

Header Inbox
- One Inbox icon in the bell's slot; pink badge = total unread.
- Popover with two tabs: **Messages** (latest ~8 threads, "New message",
  "Open inbox") and **Alerts** (the existing Signal panel contents).
- The `sos` safety notice pins above both tabs. "Mark all read" still cannot
  clear it (enforced in the RPC).
- The popover's feed query runs only while it is open.

Page
- Full viewport height (`dvh`), no magic offsets. Mobile shows list or thread.
- Chips: All · Chats · Mail · Alerts, plus Matches / Groups / Trips when
  applicable. The active filter is written to `?filter=` (history replace).
- Badges use `useInboxUnreadCount` (count query, shared cache) instead of
  mounting full feeds.

## PR 2 — counts RPC + DM dedupe (migration)

- `get_inbox_unread_counts(p_user)` → one count per filter
  (`all, chats, mail, alerts, matches, groups, trips`). Header badge, popover
  tabs and chips read it.
- `dm` / `message` notifications are excluded from the alerts lane and its
  count (the chat already carries them).
- Marking a conversation read marks its `dm` notifications read.

## PR 3 — per-user realtime

- One app-wide channel on topic `inbox:<user_id>`, mounted once.
- DB triggers on the inbox source tables send `inbox_changed` to each affected
  recipient; the client invalidates feeds and counts.
- Replaces the 9 per-instance table subscriptions.
- Risk: a trigger on the hot `messages` table. Measure write latency before and
  after; keep the trigger to one `realtime.send` per recipient.

## Out of scope

- Quiet hours (no model exists).
- Server-side pin ordering beyond the loaded page.
