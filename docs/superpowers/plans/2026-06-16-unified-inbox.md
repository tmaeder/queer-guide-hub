# Unified Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `/mailbox` (email + alerts) and `/messages` (conversations) into one two-pane hub at `/messages` whose left rail lists chats + email + notifications together, with the right pane rendering the correct view per item type.

**Architecture:** A server-side `get_inbox_feed` RPC `UNION ALL`s three sources (conversations, mailbox_emails, notifications) into one normalized, cursor-paginated feed; a `get_inbox_unread_count` RPC powers a single badge. A new `useInboxFeed` hook (TanStack Query + realtime invalidation over all four tables) drives both the rail and the header bell. The rail reuses the existing `MessagingInterface` split-pane; the right pane switches component by `kind`.

**Tech Stack:** React 19 + Vite + TS, Supabase (Postgres RPC, realtime), TanStack Query, shadcn/ui, vitest + @testing-library/react.

**Design doc:** `docs/plans/2026-06-16-unified-inbox-design.md`

**Dedupe decision (settled):** Audit found no code path creates both a `conversation_type='system'` conversation AND a `notifications` row for the same event (`create_notification` is a stub; no parallel writes). Therefore the feed includes both sources with no dedupe. A guard is only added if doubles ever appear.

---

## File Structure

**Create:**
- `supabase/migrations/<ts>_unified_inbox_feed.sql` — `get_inbox_feed`, `get_inbox_unread_count` RPCs + supporting indexes.
- `src/hooks/useInboxFeed.ts` — feed + unread count, realtime-invalidated. Supersedes `useUnifiedInbox.ts`.
- `src/components/messaging/InboxFilterChips.tsx` — All · Chats · Mail · Alerts.
- `src/components/messaging/InboxRailItem.tsx` — one normalized rail row.
- `src/components/messaging/NotificationDetailCard.tsx` — read-only alert pane with CTA.
- `src/components/messaging/ComposeChooser.tsx` — "+" → New message | New email.
- `src/hooks/__tests__/useInboxFeed.test.ts` — shape test.
- `src/components/messaging/__tests__/InboxFilterChips.test.tsx` — chip behavior test.

**Modify:**
- `src/components/messaging/MessagingInterface.tsx` — rail consumes `InboxItem[]`; right pane switches by `kind`.
- `src/pages/Messages.tsx` — pass active filter; drop the old `TAB_FILTERS` chat-only tabs (chips replace them).
- `src/components/layout/Header.tsx:53,144-158` — badge from `useInboxFeed` unread count.
- `src/components/notifications/NotificationList.tsx` — bell peek consumes the feed + "Open inbox".
- `src/routes.tsx:526-527` — `/mailbox` → redirect to `/messages`; remove `<Inbox/>` route.
- `src/locales/en/*.json` (+ run i18n sync) — chip + compose strings.

**Delete (after migration):**
- `src/hooks/useUnifiedInbox.ts` and its consumers (verify with grep before deleting).

---

## Task 1: Feed RPCs migration

**Files:**
- Create: `supabase/migrations/<14-digit-ts>_unified_inbox_feed.sql`

Use a fresh 14-digit version not already present in `supabase/migrations/` (e.g. `20260616120000`). Migrations run in a transaction → **no `CREATE INDEX CONCURRENTLY`**.

- [ ] **Step 1: Write the migration**

```sql
-- Unified inbox feed: merge conversations + mailbox_emails + notifications

-- Supporting indexes (regular, non-concurrent — runs inside migration txn)
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mailbox_owner_inbox
  ON public.mailbox_emails (owner_id, created_at DESC)
  WHERE folder = 'inbox' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_participants_user
  ON public.conversation_participants (user_id, conversation_id);

-- Normalized feed
CREATE OR REPLACE FUNCTION public.get_inbox_feed(
  p_user uuid,
  p_cursor timestamptz DEFAULT NULL,
  p_filter text DEFAULT 'all',
  p_limit int DEFAULT 30
)
RETURNS TABLE (
  id text,
  kind text,
  subtype text,
  title text,
  preview text,
  avatar_url text,
  ts timestamptz,
  unread boolean,
  open_target text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL OR p_user <> auth.uid() THEN
    RETURN; -- callers may only read their own feed
  END IF;

  RETURN QUERY
  WITH chat AS (
    SELECT
      'conv_' || c.id::text                         AS id,
      'chat'::text                                   AS kind,
      COALESCE(c.conversation_type, 'direct')        AS subtype,
      COALESCE(c.title, op.display_name, 'Conversation') AS title,
      COALESCE(m.content, '')                         AS preview,
      op.avatar_url                                   AS avatar_url,
      COALESCE(c.last_message_at, c.updated_at)       AS ts,
      (cp.last_read_at IS NULL
        OR COALESCE(c.last_message_at, c.updated_at) > cp.last_read_at) AS unread,
      '/messages?conversation=' || c.id::text         AS open_target
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    LEFT JOIN public.messages m ON m.id = c.last_message_id
    LEFT JOIN LATERAL (
      SELECT p.display_name, p.avatar_url
      FROM public.conversation_participants cp2
      JOIN public.profiles p ON p.id = cp2.user_id
      WHERE cp2.conversation_id = c.id AND cp2.user_id <> p_user
      LIMIT 1
    ) op ON true
    WHERE cp.user_id = p_user
  ),
  mail AS (
    SELECT
      'mail_' || e.id::text                          AS id,
      'mail'::text                                    AS kind,
      e.direction                                     AS subtype,
      e.subject                                       AS title,
      COALESCE(e.snippet, '')                         AS preview,
      NULL::text                                      AS avatar_url,
      e.email_date                                    AS ts,
      (NOT e.is_read)                                 AS unread,
      '/messages?email=' || e.id::text                AS open_target
    FROM public.mailbox_emails e
    WHERE e.owner_id = p_user
      AND e.folder = 'inbox'
      AND e.deleted_at IS NULL
  ),
  notif AS (
    SELECT
      'notif_' || n.id::text                          AS id,
      'notification'::text                            AS kind,
      n.type                                          AS subtype,
      n.title                                         AS title,
      COALESCE(n.content, '')                         AS preview,
      NULL::text                                      AS avatar_url,
      n.created_at                                    AS ts,
      (NOT n.read)                                    AS unread,
      COALESCE(n.action_url, '#')                     AS open_target
    FROM public.notifications n
    WHERE n.user_id = p_user
  ),
  unioned AS (
    SELECT * FROM chat   WHERE p_filter IN ('all','chats')
    UNION ALL
    SELECT * FROM mail   WHERE p_filter IN ('all','mail')
    UNION ALL
    SELECT * FROM notif  WHERE p_filter IN ('all','alerts')
  )
  SELECT u.id, u.kind, u.subtype, u.title, u.preview, u.avatar_url,
         u.ts, u.unread, u.open_target
  FROM unioned u
  WHERE p_cursor IS NULL OR u.ts < p_cursor
  ORDER BY u.ts DESC
  LIMIT GREATEST(p_limit, 1);
END $$;

GRANT EXECUTE ON FUNCTION public.get_inbox_feed(uuid, timestamptz, text, int) TO authenticated;

-- Single unread count for the badge
CREATE OR REPLACE FUNCTION public.get_inbox_unread_count(p_user uuid)
RETURNS int
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF p_user IS NULL OR p_user <> auth.uid() THEN
    RETURN 0;
  END IF;

  SELECT
    (SELECT count(*) FROM public.conversation_participants cp
       JOIN public.conversations c ON c.id = cp.conversation_id
       WHERE cp.user_id = p_user
         AND (cp.last_read_at IS NULL
              OR COALESCE(c.last_message_at, c.updated_at) > cp.last_read_at))
  + (SELECT count(*) FROM public.mailbox_emails e
       WHERE e.owner_id = p_user AND e.folder = 'inbox'
         AND e.deleted_at IS NULL AND e.is_read = false)
  + (SELECT count(*) FROM public.notifications n
       WHERE n.user_id = p_user AND n.read = false)
  INTO v_count;

  RETURN COALESCE(v_count, 0);
END $$;

GRANT EXECUTE ON FUNCTION public.get_inbox_unread_count(uuid) TO authenticated;
```

- [ ] **Step 2: Apply via MCP and record history with the same version**

Apply with `mcp__6a75f005-...__apply_migration` using `name = "unified_inbox_feed"` and the SAME 14-digit version as the filename, then commit the file (CI then skips it — see CLAUDE.md "DB migrations"). Confirm no duplicate version exists first: the version must not already appear in `supabase/migrations/`.

- [ ] **Step 3: Verify the functions exist and run**

Run via `mcp__6a75f005-...__execute_sql`:
```sql
SELECT proname FROM pg_proc
WHERE proname IN ('get_inbox_feed','get_inbox_unread_count');
```
Expected: two rows.

Then sanity-check shape against a real user id (replace `<uid>`):
```sql
SELECT * FROM public.get_inbox_feed('<uid>'::uuid, NULL, 'all', 5);
SELECT public.get_inbox_unread_count('<uid>'::uuid);
```
Expected: feed rows ordered by `ts DESC` mixing kinds; an integer count. (Called as service-role the `auth.uid()` guard returns empty — verify instead from the app in Task 2, or temporarily test the inner query.)

- [ ] **Step 4: EXPLAIN the feed for cost**

```sql
EXPLAIN ANALYZE
SELECT * FROM public.get_inbox_feed('<uid>'::uuid, NULL, 'all', 30);
```
Expected: index scans on the four new indexes, total time well under 100ms. If a sequential scan on `messages`/`mailbox_emails`/`notifications` appears, confirm the indexes were created.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<ts>_unified_inbox_feed.sql
git commit -m "feat(db): unified inbox feed RPCs + indexes"
```

---

## Task 2: useInboxFeed hook

**Files:**
- Create: `src/hooks/useInboxFeed.ts`
- Test: `src/hooks/__tests__/useInboxFeed.test.ts`

- [ ] **Step 1: Write the failing shape test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return {
    supabase: {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      channel: () => new Proxy(() => {}, handler),
      removeChannel: vi.fn(),
    },
  };
});

import { useInboxFeed } from '../useInboxFeed';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
};

describe('useInboxFeed', () => {
  it('returns the expected shape', () => {
    const { result } = renderHook(() => useInboxFeed('all'), { wrapper });
    expect(result.current).toHaveProperty('items');
    expect(Array.isArray(result.current.items)).toBe(true);
    expect(result.current).toHaveProperty('unreadCount');
    expect(typeof result.current.loading).toBe('boolean');
    expect(typeof result.current.fetchNextPage).toBe('function');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/hooks/__tests__/useInboxFeed.test.ts`
Expected: FAIL — cannot resolve `../useInboxFeed`.

- [ ] **Step 3: Implement the hook**

```ts
import { useEffect, useId } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type InboxKind = 'chat' | 'mail' | 'notification';
export type InboxFilter = 'all' | 'chats' | 'mail' | 'alerts';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  subtype: string;
  title: string;
  preview: string;
  avatar_url: string | null;
  ts: string;
  unread: boolean;
  open_target: string;
}

const PAGE = 30;
const feedKey = (userId: string | undefined, filter: InboxFilter) =>
  ['inbox-feed', userId, filter] as const;
const countKey = (userId: string | undefined) => ['inbox-unread', userId] as const;

export function useInboxFeed(filter: InboxFilter = 'all') {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const instanceId = useId();

  const feed = useInfiniteQuery({
    queryKey: feedKey(user?.id, filter),
    enabled: !!user,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_inbox_feed', {
        p_user: user!.id,
        p_cursor: pageParam,
        p_filter: filter,
        p_limit: PAGE,
      });
      if (error) throw error;
      return (data ?? []) as InboxItem[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].ts : undefined),
  });

  const countQuery = useQuery({
    queryKey: countKey(user?.id),
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_inbox_unread_count', { p_user: user!.id });
      if (error) return 0;
      return (data as number) ?? 0;
    },
  });

  // Realtime: any change to the four sources invalidates feed + count
  useEffect(() => {
    if (!user) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox-feed', user.id] });
      void queryClient.invalidateQueries({ queryKey: countKey(user.id) });
    };
    const channel = supabase
      .channel(`inbox-feed:${user.id}:${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mailbox_emails', filter: `owner_id=eq.${user.id}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, invalidate)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, instanceId, queryClient]);

  return {
    items: (feed.data?.pages.flat() ?? []) as InboxItem[],
    unreadCount: countQuery.data ?? 0,
    loading: feed.isLoading,
    hasNextPage: feed.hasNextPage,
    fetchNextPage: feed.fetchNextPage,
    refetch: feed.refetch,
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/hooks/__tests__/useInboxFeed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useInboxFeed.ts src/hooks/__tests__/useInboxFeed.test.ts
git commit -m "feat: useInboxFeed hook (merged feed + unread count + realtime)"
```

---

## Task 3: Filter chips

**Files:**
- Create: `src/components/messaging/InboxFilterChips.tsx`
- Test: `src/components/messaging/__tests__/InboxFilterChips.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InboxFilterChips } from '../InboxFilterChips';

describe('InboxFilterChips', () => {
  it('renders four chips and fires onChange', () => {
    const onChange = vi.fn();
    render(<InboxFilterChips value="all" onChange={onChange} />);
    expect(screen.getByRole('button', { name: /all/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /mail/i }));
    expect(onChange).toHaveBeenCalledWith('mail');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/components/messaging/__tests__/InboxFilterChips.test.tsx`
Expected: FAIL — cannot resolve `../InboxFilterChips`.

- [ ] **Step 3: Implement (monochrome, semantic radius/tokens per design system)**

```tsx
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { InboxFilter } from '@/hooks/useInboxFeed';

const FILTERS: { key: InboxFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'inbox.filter.all' },
  { key: 'chats', labelKey: 'inbox.filter.chats' },
  { key: 'mail', labelKey: 'inbox.filter.mail' },
  { key: 'alerts', labelKey: 'inbox.filter.alerts' },
];

export function InboxFilterChips({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (f: InboxFilter) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 overflow-x-auto p-2" role="tablist">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          role="tab"
          aria-selected={value === f.key}
          onClick={() => onChange(f.key)}
          className={cn(
            'min-h-0 whitespace-nowrap rounded-badge border px-4 py-2 text-13',
            value === f.key ? 'bg-foreground text-background' : 'bg-background text-foreground',
          )}
        >
          {t(f.labelKey, { defaultValue: f.key })}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/components/messaging/__tests__/InboxFilterChips.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/messaging/InboxFilterChips.tsx src/components/messaging/__tests__/InboxFilterChips.test.tsx
git commit -m "feat: inbox filter chips (All/Chats/Mail/Alerts)"
```

---

## Task 4: Rail item + notification detail card

**Files:**
- Create: `src/components/messaging/InboxRailItem.tsx`
- Create: `src/components/messaging/NotificationDetailCard.tsx`

- [ ] **Step 1: Implement the rail row**

```tsx
import { MessageCircle, Mail, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InboxItem } from '@/hooks/useInboxFeed';

const KIND_ICON = { chat: MessageCircle, mail: Mail, notification: Bell } as const;

export function InboxRailItem({
  item,
  active,
  onSelect,
}: {
  item: InboxItem;
  active: boolean;
  onSelect: (item: InboxItem) => void;
}) {
  const Icon = KIND_ICON[item.kind];
  return (
    <button
      onClick={() => onSelect(item)}
      className={cn(
        'flex w-full items-start gap-2 rounded-element border-b p-4 text-left',
        active && 'bg-muted',
      )}
    >
      <Icon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-15', item.unread && 'font-semibold')}>
            {item.title}
          </span>
          {item.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-foreground" />}
        </span>
        <span className="block truncate text-13 text-muted-foreground">{item.preview}</span>
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Implement the notification detail card (read-only + CTA)**

```tsx
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { InboxItem } from '@/hooks/useInboxFeed';

export function NotificationDetailCard({ item }: { item: InboxItem }) {
  const { t } = useTranslation();
  const hasAction = item.open_target && item.open_target !== '#';
  return (
    <div className="flex h-full flex-col items-start gap-4 p-6">
      <h2 className="text-title">{item.title}</h2>
      <p className="text-body-lg text-muted-foreground">{item.preview}</p>
      {hasAction && (
        <Button asChild>
          <a href={item.open_target}>{t('inbox.notification.open', { defaultValue: 'Open' })}</a>
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/messaging/InboxRailItem.tsx src/components/messaging/NotificationDetailCard.tsx
git commit -m "feat: inbox rail item + notification detail card"
```

---

## Task 5: Wire rail + right pane into MessagingInterface

**Files:**
- Modify: `src/components/messaging/MessagingInterface.tsx`
- Modify: `src/pages/Messages.tsx`

Read `MessagingInterface.tsx` fully first (it is ~838 lines): identify (a) the left-rail list render, (b) the right-pane chat render, (c) how `?conversation=` is read from the URL. Keep the existing chat path intact — you are adding mail + notification branches and replacing the rail data source.

- [ ] **Step 1: Replace the rail data source with the feed**

In `Messages.tsx`, hold filter state and pass it down; render the chips above the interface:

```tsx
import { useState } from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import { MessagingInterface } from '@/components/messaging/MessagingInterface';
import { InboxFilterChips } from '@/components/messaging/InboxFilterChips';
import type { InboxFilter } from '@/hooks/useInboxFeed';

export default function Messages() {
  const [filter, setFilter] = useState<InboxFilter>('all');
  return (
    <AuthGate>
      <div className="flex h-full flex-col">
        <InboxFilterChips value={filter} onChange={setFilter} />
        <MessagingInterface filter={filter} />
      </div>
    </AuthGate>
  );
}
```

Delete the old `TAB_FILTERS` chat-only tab block in `Messages.tsx`.

- [ ] **Step 2: In MessagingInterface, render the merged rail**

Add a `filter?: InboxFilter` prop. Replace the conversation-list source with:

```tsx
import { useInboxFeed, type InboxItem } from '@/hooks/useInboxFeed';
import { InboxRailItem } from './InboxRailItem';
import { NotificationDetailCard } from './NotificationDetailCard';
// ...existing imports for chat + mail detail...

const { items } = useInboxFeed(filter ?? 'all');
const [selected, setSelected] = useState<InboxItem | null>(null);
```

Rail render (replace the existing list map):

```tsx
<div className="divide-y overflow-y-auto">
  {items.map((item) => (
    <InboxRailItem
      key={item.id}
      item={item}
      active={selected?.id === item.id}
      onSelect={setSelected}
    />
  ))}
</div>
```

- [ ] **Step 3: Switch the right pane by kind**

```tsx
{selected?.kind === 'chat' && (
  /* existing chat view, parse conversationId from selected.id ('conv_<uuid>') */
  <ChatView conversationId={selected.id.replace('conv_', '')} />
)}
{selected?.kind === 'mail' && (
  /* reuse the mailbox email detail/reply component from UnifiedInbox */
  <MailDetail emailId={selected.id.replace('mail_', '')} />
)}
{selected?.kind === 'notification' && <NotificationDetailCard item={selected} />}
{!selected && <EmptyState />}
```

Extract the existing inline chat-detail JSX into a `ChatView` local component if it is not already one. For `MailDetail`, lift the email-detail + reply subtree out of `src/components/inbox/UnifiedInbox.tsx` into a shared component importable here (do not duplicate — move and re-import in both places).

- [ ] **Step 4: Typecheck + run existing messaging tests**

Run: `npm run typecheck && npx vitest run src/components/messaging`
Expected: passes; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/messaging/MessagingInterface.tsx src/pages/Messages.tsx src/components/inbox/UnifiedInbox.tsx
git commit -m "feat: merged inbox rail + per-kind right pane in MessagingInterface"
```

---

## Task 6: Compose chooser

**Files:**
- Create: `src/components/messaging/ComposeChooser.tsx`
- Modify: `src/components/messaging/MessagingInterface.tsx` (wire the "+" button)

- [ ] **Step 1: Implement the chooser**

```tsx
import { useState } from 'react';
import { Plus, MessageCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';

export function ComposeChooser({
  onNewMessage,
  onNewEmail,
}: {
  onNewMessage: () => void;
  onNewEmail: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" aria-label={t('inbox.compose.label', { defaultValue: 'Compose' })}>
          <Plus className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onNewMessage}>
          <MessageCircle className="mr-2 h-4 w-4" />
          {t('inbox.compose.message', { defaultValue: 'New message' })}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onNewEmail}>
          <Mail className="mr-2 h-4 w-4" />
          {t('inbox.compose.email', { defaultValue: 'New email' })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Wire it in MessagingInterface**

Replace the existing "New" conversation button with `<ComposeChooser onNewMessage={...} onNewEmail={...} />`. `onNewMessage` opens the existing new-conversation flow; `onNewEmail` opens the existing mailbox compose modal (imported from the mailbox compose component). The Mail-folder secondary actions (sent/drafts/archive/trash) render only when `filter === 'mail'`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/messaging/ComposeChooser.tsx src/components/messaging/MessagingInterface.tsx
git commit -m "feat: unified compose chooser (new message | new email)"
```

---

## Task 7: Unify the header badge + bell peek

**Files:**
- Modify: `src/components/layout/Header.tsx:53`
- Modify: `src/components/notifications/NotificationList.tsx`

- [ ] **Step 1: Swap the badge source**

In `Header.tsx`, replace:
```tsx
const { unreadCount } = useNotifications();
```
with:
```tsx
import { useInboxFeed } from '@/hooks/useInboxFeed';
const { unreadCount } = useInboxFeed('all');
```
Leave the existing badge JSX at lines 144–158 unchanged — it now reflects the merged count.

- [ ] **Step 2: Point the bell peek at the merged feed**

In `NotificationList.tsx`, render the top items from `useInboxFeed('all').items.slice(0, 8)` using `InboxRailItem`, and add an "Open inbox" link to `/messages` at the bottom:

```tsx
import { Link } from 'react-router-dom';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { InboxRailItem } from '@/components/messaging/InboxRailItem';
// ...
const { items } = useInboxFeed('all');
// render items.slice(0, 8) with InboxRailItem; onSelect navigates to item.open_target
<Link to="/messages" className="block p-2 text-center text-13">
  {t('inbox.openInbox', { defaultValue: 'Open inbox' })}
</Link>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Header.tsx src/components/notifications/NotificationList.tsx
git commit -m "feat: unified inbox badge + bell peek into merged feed"
```

---

## Task 8: Routes, redirect, cleanup

**Files:**
- Modify: `src/routes.tsx:526-527`
- Delete: `src/hooks/useUnifiedInbox.ts` (after grep)
- Possibly delete: `src/pages/Inbox.tsx` (if no longer referenced)

- [ ] **Step 1: Redirect /mailbox into /messages**

In `src/routes.tsx`, change:
```tsx
<Route path="inbox" element={<LocalizedRedirect to="/messages" />} />
<Route path="mailbox" element={<Inbox />} />
<Route path="messages" element={<Messages />} />
```
to:
```tsx
<Route path="inbox" element={<LocalizedRedirect to="/messages" />} />
<Route path="mailbox" element={<LocalizedRedirect to="/messages" />} />
<Route path="messages" element={<Messages />} />
```
Remove the now-unused `Inbox` import if nothing else references it.

- [ ] **Step 2: Remove the superseded hook**

```bash
grep -rn "useUnifiedInbox" src
```
Expected: only its own file + `UnifiedInbox.tsx`. Replace any remaining consumer with `useInboxFeed`, then:
```bash
git rm src/hooks/useUnifiedInbox.ts
```

- [ ] **Step 3: Build + full unit suite**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: build succeeds; tests green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: /mailbox redirects to /messages; drop useUnifiedInbox"
```

---

## Task 9: i18n strings

**Files:**
- Modify: `src/locales/en/<namespace>.json` (the namespace used by these components — confirm with an existing key)

- [ ] **Step 1: Add English keys**

```json
{
  "inbox.filter.all": "All",
  "inbox.filter.chats": "Chats",
  "inbox.filter.mail": "Mail",
  "inbox.filter.alerts": "Alerts",
  "inbox.compose.label": "Compose",
  "inbox.compose.message": "New message",
  "inbox.compose.email": "New email",
  "inbox.notification.open": "Open",
  "inbox.openInbox": "Open inbox"
}
```

- [ ] **Step 2: Sync locales**

Run the repo's i18n sync (per CLAUDE.md / package.json scripts, e.g. `npm run i18n:sync` or `i18n:fill`).
Expected: all 11 locale files gain the keys (English fallback until translated).

- [ ] **Step 3: Commit**

```bash
git add src/locales
git commit -m "i18n: unified inbox strings"
```

---

## Task 10: Manual production-style verification

- [ ] **Step 1: Run dev and exercise the flow**

Run: `npm run dev` (port 8080). Sign in. At `/messages`:
- Rail shows chats + emails + notifications mixed by recency.
- Chips filter to Chats / Mail / Alerts.
- Selecting a chat shows the chat view; an email shows reader+reply; a notification shows the read-only card + CTA.
- "+" offers New message / New email.
- Header badge equals unread chats + emails + notifications; bell peek shows the same feed.
- `/mailbox` and `/inbox` redirect to `/messages`.

- [ ] **Step 2: Verify on production after deploy**

Per CLAUDE.md, after merge to `main` (CF Pages auto-deploy), verify the same flow on https://queer.guide — not just localhost. Confirm the migration applied via CI `db push`.

---

## Self-Review notes

- **Spec coverage:** route/shell (T5,T8), normalized model (T1,T2), per-kind right pane (T4,T5), compose (T6), unread badge (T7), data RPC (T1), dedupe (settled — no guard needed), redirects+i18n (T8,T9). All covered.
- **Type consistency:** `InboxItem`/`InboxFilter`/`InboxKind` defined once in `useInboxFeed.ts` and imported everywhere; RPC column names (`open_target`, `avatar_url`, `ts`, `unread`) match the SQL `RETURNS TABLE` exactly.
- **Realtime:** per-instance channel topics via `useId()` per the realtime-channel-topics gotcha; invalidates by `['inbox-feed', userId]` prefix so all filters refresh.
