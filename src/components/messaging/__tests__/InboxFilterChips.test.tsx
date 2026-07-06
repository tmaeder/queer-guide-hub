import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Toggleable intimate-profile mock (opted-in gate for the Matches chip).
const h = vi.hoisted(() => ({
  profile: { data: null as { id: string } | null },
  inbox: { items: [] as { id: string; unread: boolean }[] },
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
  useInboxFeed: () => ({ items: h.inbox.items, unreadCount: 0, loading: false }),
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
    h.inbox = { items: [] };
    render(<InboxFilterChips value="all" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /matches/i })).toBeTruthy();
  });

  it('badges the Matches chip with the unread-match count', () => {
    h.profile = { data: { id: 'p1' } };
    h.inbox = {
      items: [
        { id: 'conv_1', unread: true },
        { id: 'conv_2', unread: true },
        { id: 'conv_3', unread: false },
      ],
    };
    render(<InboxFilterChips value="all" onChange={() => {}} />);
    // the Matches chip renders and shows the unread badge (2 of 3 unread)
    expect(screen.getByRole('tab', { name: /matches/i })).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });
});
