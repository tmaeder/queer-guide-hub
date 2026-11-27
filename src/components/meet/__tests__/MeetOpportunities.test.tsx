import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderWithProviders, screen } from '@/test/test-utils';
import { MeetOpportunities } from '../MeetOpportunities';
const { groups } = vi.hoisted(() => ({
  groups: {
    data: [{ id: 'group', name: 'Queer walks', description: 'Walk together' }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));
vi.mock('@/hooks/useIntentData', () => ({ useLocalGroups: () => groups }));
beforeEach(() => {
  groups.isLoading = false;
  groups.isError = false;
  groups.refetch.mockClear();
});
describe('public meetup alternatives', () => {
  it('labels worldwide groups independently of local invitations', () => {
    renderWithProviders(<MeetOpportunities />);
    expect(screen.getByText(/Public interest groups · worldwide/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Queer walks' })).toHaveAttribute(
      'href',
      '/meet/groups/group',
    );
  });
  it('offers retry rather than showing stale groups as successful empty results', () => {
    groups.isError = true;
    renderWithProviders(<MeetOpportunities />);
    expect(screen.queryByRole('link', { name: 'Queer walks' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(groups.refetch).toHaveBeenCalledOnce();
  });
});
