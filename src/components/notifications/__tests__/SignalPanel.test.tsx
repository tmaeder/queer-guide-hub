/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const items = [
  {
    id: 'n-sos',
    kind: 'notification',
    subtype: 'sos',
    title: 'Safety notice',
    preview: 'Café Anonym has 2 open door-policy reports.',
    avatar_url: null,
    ts: new Date(Date.now() - 5 * 60_000).toISOString(),
    unread: true,
    open_target: '/help',
  },
  {
    id: 'n-event',
    kind: 'notification',
    subtype: 'event_reminder',
    title: 'Doors in 2 hours',
    preview: 'Ballroom Is Burning · SchwuZ',
    avatar_url: null,
    ts: new Date(Date.now() - 60 * 60_000).toISOString(),
    unread: true,
    open_target: '/events/ballroom',
  },
  {
    id: 'n-group',
    kind: 'notification',
    subtype: 'new_post',
    title: 'Ballroom 101 invited you',
    preview: 'Weekly practice, Thursdays 19:00',
    avatar_url: null,
    ts: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    unread: false,
    open_target: '/groups/ballroom-101',
  },
];

vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxFeed: () => ({ items, loading: false, unreadCount: 2 }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { SignalPanel } from '../SignalPanel';

const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SignalPanel />
    </QueryClientProvider>,
  );
};

describe('SignalPanel', () => {
  it('names itself Signal', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Signal' })).toBeInTheDocument();
  });

  it('pins the safety notice OUTSIDE the read/unread list', () => {
    // Rule 1: "The safety notice never mixes." It is a sibling above the list,
    // not a row inside it — so it must not be reachable from the scroll
    // region that holds the ordinary rows.
    const { container } = renderPanel();
    const safety = screen.getByText('Safety notice').closest('button');
    expect(safety).toBeTruthy();

    const rows = container.querySelectorAll('[data-radix-scroll-area-viewport] button');
    const rowText = Array.from(rows)
      .map((r) => r.textContent ?? '')
      .join(' ');
    expect(rowText).toContain('Doors in 2 hours');
    expect(rowText).not.toContain('Safety notice');
  });

  it('gives the safety notice no unread dot — it is a condition, not an item', () => {
    renderPanel();
    const safety = screen.getByText('Safety notice').closest('button')!;
    expect(within(safety).queryByText('Unread')).not.toBeInTheDocument();
  });

  it('marks unread rows with a labelled station dot, and read rows without one', () => {
    renderPanel();
    const unreadRow = screen.getByText('Doors in 2 hours').closest('button')!;
    const readRow = screen.getByText('Ballroom 101 invited you').closest('button')!;
    // Rule 2: presence/absence carries the state, so the cue survives
    // colour-blindness; the sr-only label carries it for screen readers.
    expect(within(unreadRow).getByText('Unread')).toBeInTheDocument();
    expect(within(readRow).queryByText('Unread')).not.toBeInTheDocument();
  });

  it('links out to notification settings', () => {
    renderPanel();
    const link = screen.getByRole('link', { name: 'Notification settings' });
    expect(link).toHaveAttribute('href', '/settings?section=notifications');
  });

  it('claims no quiet hours, because the product has none to report', () => {
    // The spec's strip says when the app will not ping you. There is no
    // quiet-hours model here yet, and a fixed "23:00–09:00" would be a promise
    // the notifier does not keep.
    renderPanel();
    expect(screen.queryByText(/quiet hours/i)).not.toBeInTheDocument();
  });
});
