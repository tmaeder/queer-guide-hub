import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Toggleable intimate-profile mock (opted-in gate for the Matches chip).
const h = vi.hoisted(() => ({
  profile: { data: null as { id: string } | null },
  counts: { all: 0, chats: 0, mail: 0, alerts: 0, matches: 0, groups: 0, trips: 0 },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrVars?: string | Record<string, unknown>) => {
      if (typeof defaultOrVars === 'string') return defaultOrVars;
      if (defaultOrVars && typeof defaultOrVars === 'object' && 'defaultValue' in defaultOrVars) {
        return defaultOrVars.defaultValue as string;
      }
      return key;
    },
  }),
}));

const mockUpcoming = vi.fn(() => ({ data: [] as unknown[] }));
vi.mock('@/hooks/useUpcomingTrips', () => ({
  useUpcomingTrips: () => mockUpcoming(),
}));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useMyIntimateProfile: () => h.profile,
}));
vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxUnreadCounts: () => h.counts,
}));
const mockUserGroups = vi.fn(() => ({ userGroups: [] as { id: string }[] }));
vi.mock('@/hooks/useGroups', () => ({
  useGroups: () => mockUserGroups(),
}));

import { InboxFilterChips } from '../InboxFilterChips';

describe('InboxFilterChips', () => {
  it('renders four chips and fires onChange', () => {
    h.profile = { data: null };
    const onChange = vi.fn();
    render(<InboxFilterChips value="all" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: /all/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /trips/i })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /mail/i }));
    expect(onChange).toHaveBeenCalledWith('mail');
  });

  it('shows the trips chip when upcoming trips exist', () => {
    h.profile = { data: null };
    mockUpcoming.mockReturnValueOnce({ data: [{ id: 't1' }] });
    render(<InboxFilterChips value="all" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /trips/i })).toBeTruthy();
  });

  it('hides the Matches chip when the viewer has not opted into dating', () => {
    h.profile = { data: null };
    render(<InboxFilterChips value="all" onChange={() => {}} />);
    expect(screen.queryByRole('tab', { name: /matches/i })).toBeNull();
  });

  it('shows the Matches chip once the viewer has an intimate profile', () => {
    h.profile = { data: { id: 'p1' } };
    render(<InboxFilterChips value="all" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /matches/i })).toBeTruthy();
  });

  it('badges the Matches chip with the server unread-match count', () => {
    h.profile = { data: { id: 'p1' } };
    h.counts = { ...h.counts, matches: 2 };
    render(<InboxFilterChips value="all" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /matches/i })).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    h.counts = { ...h.counts, matches: 0 };
  });

  it('badges Chats with its count but never badges All', () => {
    h.profile = { data: null };
    h.counts = { ...h.counts, all: 9, chats: 4 };
    render(<InboxFilterChips value="all" onChange={() => {}} />);
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.queryByText('9')).toBeNull();
    h.counts = { ...h.counts, all: 0, chats: 0 };
  });

  it('hides the Groups chip when the viewer belongs to no groups', () => {
    h.profile = { data: null };
    mockUserGroups.mockReturnValueOnce({ userGroups: [] });
    render(<InboxFilterChips value="all" onChange={() => {}} />);
    expect(screen.queryByRole('tab', { name: /groups/i })).toBeNull();
  });

  it('shows the Groups chip once the viewer belongs to a group', () => {
    h.profile = { data: null };
    mockUserGroups.mockReturnValueOnce({ userGroups: [{ id: 'g1' }] });
    render(<InboxFilterChips value="all" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /groups/i })).toBeTruthy();
  });

  it('fires onChange("groups") when the Groups chip is clicked', () => {
    h.profile = { data: null };
    mockUserGroups.mockReturnValueOnce({ userGroups: [{ id: 'g1' }] });
    const onChange = vi.fn();
    render(<InboxFilterChips value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /groups/i }));
    expect(onChange).toHaveBeenCalledWith('groups');
  });
});
