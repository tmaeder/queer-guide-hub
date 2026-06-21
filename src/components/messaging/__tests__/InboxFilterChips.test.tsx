import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

import { InboxFilterChips } from '../InboxFilterChips';

describe('InboxFilterChips', () => {
  it('renders four chips and fires onChange', () => {
    const onChange = vi.fn();
    render(<InboxFilterChips value="all" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: /all/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /trips/i })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /mail/i }));
    expect(onChange).toHaveBeenCalledWith('mail');
  });

  it('shows the trips chip when upcoming trips exist', () => {
    mockUpcoming.mockReturnValueOnce({ data: [{ id: 't1' }] });
    render(<InboxFilterChips value="all" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /trips/i })).toBeTruthy();
  });
});
