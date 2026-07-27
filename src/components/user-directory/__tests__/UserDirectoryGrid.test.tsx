/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expectNoNestedInteractive } from '@/test/test-utils';
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
  // Each card used to wrap its whole body in the profile link, so the "Visit
  // website" anchor and the message button rendered inside it — invalid HTML
  // and axe `nested-interactive` (serious, WCAG 4.1.2). The card link is now an
  // overlay sibling; the two controls sit above it with `z-10`.
  it('keeps the website link and message button out of the card link', () => {
    const { container } = renderGrid(
      [{ user_id: 'u1', display_name: 'Alex', website: 'https://example.com' }],
      { isAuthed: true },
    );
    expectNoNestedInteractive(container);
    expect(screen.getByRole('link', { name: 'Alex' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /visit website/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message' })).toBeInTheDocument();
  });

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
