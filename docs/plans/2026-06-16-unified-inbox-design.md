# Unified Inbox — Design

**Date:** 2026-06-16
**Status:** Approved (brainstorm), ready for planning/implementation

## Goal

Fold `/mailbox` (email + alerts) and `/messages` (conversations) into **one two-pane
hub**. Left rail = every incoming thing (chats + @queer.guide email + notifications)
merged into one recency-sorted list. Right pane renders the correct view per item
type. The header bell becomes a lightweight peek into the same feed. Email and chat
keep their distinct interaction models — we unify the *shell*, not the paradigms.

Decisions taken in brainstorm:
- Driver: **keep both tools, unify the shell** (one nav, one badge, one search).
- Shape: **two-pane unified list** (true single-inbox feel), not segmented tabs.
- Scope: **chat + email + notifications all merge** into the rail; bell = peek.
- Route: **`/messages`** stays canonical; `/mailbox` + `/inbox` redirect in.
- Data: **server-side unified feed RPC** (option A), built up front.

## 1. Route & shell

- Canonical: **`/messages`**. `/mailbox` and `/inbox` → redirect to `/messages`.
- Layout: reuse `MessagingInterface` split-pane skeleton. Left rail list, right
  detail pane. Mobile = list view; tap → full-screen detail with back.
- Rail header: one search box + filter chips **All · Chats · Mail · Alerts**.
  Default = All. Chips are the pressure valve for the merged firehose.

## 2. Normalized item model

One shape feeds the rail; three sources behind it.

```ts
InboxItem {
  id          'conv_<id>' | 'mail_<id>' | 'notif_<id>'  // prefixed, stable
  kind        'chat' | 'mail' | 'notification'
  subtype     direct|group|match|trip|system  // chat
            | inbound|outbound                 // mail
            | <notification.type>              // notification
  title       other participant / group name  | subject       | notif.title
  preview     last message text               | snippet        | notif.content
  avatarOrIcon
  ts          last_activity (sort key)
  unread      boolean
  openTarget  conversation_id | email_id | action_url
}
```

## 3. Data architecture — Server RPC (option A)

Build a read-only unified feed up front. No writes → no `search_documents`
trigger-storm risk.

### `get_inbox_feed(p_user uuid, p_cursor timestamptz, p_filter text, p_limit int)`
- `UNION ALL` across the three sources, each projected into the `InboxItem`
  columns above, then `ORDER BY ts DESC LIMIT p_limit` with keyset/cursor
  pagination on `ts`.
  - **chat**: `conversations` ⨝ `conversation_participants` (for `last_read_at`
    → `unread`) ⨝ last `messages` row (for `preview`/`ts`). Filter to
    conversations the user participates in.
  - **mail**: `mailbox_emails` where `owner_id = p_user`, `folder='inbox'`,
    `deleted_at IS NULL` → `unread = NOT is_read`.
  - **notification**: `notifications` where `user_id = p_user` →
    `unread = NOT read`, `openTarget = action_url`.
- `p_filter ∈ {all, chats, mail, alerts}` gates which sources are included.
- Index review: ensure supporting indexes exist on
  `messages(conversation_id, created_at desc)`,
  `mailbox_emails(owner_id, folder, deleted_at, created_at desc)`,
  `notifications(user_id, created_at desc)`. Add where missing (regular indexes —
  no `CONCURRENTLY` inside migration txn).

### `get_inbox_unread_count(p_user uuid) returns int`
- Single query summing unread across the three sources. Powers the one badge.

### Realtime
- Subscribe to INSERT/UPDATE on `messages`, `conversations`, `mailbox_emails`,
  `notifications` (per-user filters where possible). On any event → invalidate the
  feed query + the unread-count query (TanStack Query). Reuse existing channel
  patterns from `useMessaging`, `useMailbox`, `useNotifications`. Use per-instance
  channel topics (`useId`) per the realtime-channel-topics gotcha.

### Client hook
- New `useInboxFeed()` wrapping the two RPCs + realtime invalidation, returning
  `InboxItem[]` + `unreadCount` + cursor paging. The existing
  `useUnifiedInbox.ts` (email+notifications merge) is superseded by this and the
  bell + rail both consume `useInboxFeed`.

## 4. Right pane by kind

- **chat** → live `MessagingInterface` chat view (compose, reactions, typing,
  read receipts) — unchanged behavior, just opened from the merged rail.
- **mail** → email reader (subject, from, body) + reply. Reuse `UnifiedInbox`
  detail/reply components.
- **notification** → read-only action card: title, content, CTA button to
  `action_url`. No reply box — alerts are told, not answered.

## 5. Compose / "+"

- Primary "+" opens a chooser: **New message** (pick user → `get_or_create_direct_conversation`)
  or **New email** (compose to address → `send-mailbox-email`).
- Folder actions (sent / drafts / archive / trash) move into a **Mail-only**
  secondary menu, surfaced only when the **Mail** filter chip is active. Keeps the
  merged default uncluttered.

## 6. Unread badge

- One number everywhere (header avatar + rail) from `get_inbox_unread_count`
  = unread chats + unread emails + unread notifications.
- Bell dropdown shows the same merged feed (top N via `get_inbox_feed`,
  `limit≈8`) + an "Open inbox" link to `/messages`.

## Risks / open calls

1. **System-conversation vs notification dedupe.** Some alerts exist today as BOTH
   a `conversation_type='system'` conversation AND a `notifications` row → users
   would see doubles in the merged rail. **Rule:** prefer the `notification` row,
   exclude `system` conversations from the chat source in `get_inbox_feed` (or the
   inverse — decide during planning by auditing which path is authoritative). Must
   be settled before ship.
2. **Mixing replyable (chat/mail) with read-only (alerts).** Handled by per-kind
   right pane + filter chips; alerts render as action cards, never dead threads.
3. **Feed RPC performance.** `UNION ALL` over three tables with keyset paging on
   `ts`; verify with `EXPLAIN` against real row counts and confirm the supporting
   indexes above exist. DB is disk-constrained — feed is read-only so no write
   amplification, but check query cost before enabling realtime invalidation storms.
4. **Redirects + i18n.** `/mailbox` and `/inbox` → `/messages`; keep one set of
   i18n keys, retire mailbox-only nav strings.

## Surfaces touched (reference)

- `src/routes.tsx` (redirects), `src/pages/Messages.tsx`, `src/pages/Inbox.tsx`
- `src/components/messaging/MessagingInterface.tsx` (rail + chat pane)
- `src/components/inbox/UnifiedInbox.tsx` (mail detail/reply reuse)
- `src/components/notifications/NotificationBell.tsx` / `NotificationList.tsx` (peek)
- New: `src/hooks/useInboxFeed.ts`; supersedes `src/hooks/useUnifiedInbox.ts`
- New migration: `get_inbox_feed`, `get_inbox_unread_count` RPCs + indexes
