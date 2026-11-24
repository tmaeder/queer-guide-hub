import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
const h = vi.hoisted(() => ({
  profile: null as { id: string } | null,
  groups: [] as { id: string }[],
  trips: [] as { id: string }[],
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: { defaultValue?: string }) => vars?.defaultValue ?? key,
  }),
}));
vi.mock('@/hooks/useUpcomingTrips', () => ({ useUpcomingTrips: () => ({ data: h.trips }) }));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useMyIntimateProfile: () => ({ data: h.profile }),
}));
vi.mock('@/hooks/useGroups', () => ({ useGroups: () => ({ userGroups: h.groups }) }));
vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxUnreadCounts: () => ({
    all: 0,
    chats: 0,
    mail: 0,
    alerts: 0,
    trips: 0,
    groups: 0,
    matches: 0,
  }),
}));
import { InboxFilterChips } from '../InboxFilterChips';
beforeEach(() => {
  h.profile = null;
  h.groups = [];
  h.trips = [];
});
describe('Inbox categories', () => {
  it('keeps exactly four primary categories even when all contexts are available', () => {
    h.profile = { id: 'p1' };
    h.groups = [{ id: 'g1' }];
    h.trips = [{ id: 't1' }];
    render(<InboxFilterChips value="all" onChange={vi.fn()} />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'All',
      'Conversations',
      'Mail',
      'Updates',
    ]);
    expect(screen.queryByRole('button', { name: 'Matches' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Trips' })).toBeVisible();
  });
  it('places matches and groups inside Conversations while retaining their filters', () => {
    h.profile = { id: 'p1' };
    h.groups = [{ id: 'g1' }];
    const onChange = vi.fn();
    render(<InboxFilterChips value="matches" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'Conversations' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Matches' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(onChange).toHaveBeenCalledWith('groups');
  });
  it('does not offer dating and group lenses to users without those contexts', () => {
    render(<InboxFilterChips value="chats" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Matches' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Groups' })).toBeNull();
  });
  it('labels the legacy alerts filter Updates', () => {
    render(<InboxFilterChips value="alerts" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Updates' })).toHaveAttribute('aria-selected', 'true');
  });
});
