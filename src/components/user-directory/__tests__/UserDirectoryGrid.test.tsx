/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { UserDirectoryGrid } from '../UserDirectoryGrid';
import { defaultUserFilters, type Profile } from '@/hooks/useUserDirectoryQuery';

vi.mock('@/components/messaging/StartConversationButton', () => ({
  StartConversationButton: () => <button type="button">Message</button>,
}));

function renderGrid(profiles: Profile[] | undefined, opts: { isAuthed?: boolean; activeFiltersCount?: number } = {}) {
  return render(
    <MemoryRouter>
      <UserDirectoryGrid
        profiles={profiles}
        filters={defaultUserFilters}
        setFilters={vi.fn()}
        activeFiltersCount={opts.activeFiltersCount ?? 0}
        isAuthed={opts.isAuthed ?? false}
        clearAllFilters={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('UserDirectoryGrid', () => {
  it('renders the empty state', () => {
    renderGrid([]);
    expect(screen.getByText(/no members found/i)).toBeInTheDocument();
  });

  it('renders display name and pluralizes the count', () => {
    renderGrid(
      [
        { user_id: 'u1', display_name: 'Alex' },
        { user_id: 'u2', display_name: 'Sam' },
      ],
      { isAuthed: true },
    );
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.getByText(/2 members/)).toBeInTheDocument();
  });

  it('hides bio and details for anonymous visitors', () => {
    renderGrid(
      [
        {
          user_id: 'u1',
          display_name: 'Alex',
          bio: 'Loves hiking',
          location: 'Berlin',
        },
      ],
      { isAuthed: false },
    );
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.queryByText('Loves hiking')).not.toBeInTheDocument();
    expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
  });

  it('returns null-safe when profiles is undefined', () => {
    renderGrid(undefined);
    expect(screen.queryByText(/no members found/i)).not.toBeInTheDocument();
  });
});
