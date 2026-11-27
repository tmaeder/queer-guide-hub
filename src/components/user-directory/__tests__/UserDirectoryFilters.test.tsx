/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { UserDirectoryFilters } from '../UserDirectoryFilters';
import { defaultUserFilters } from '@/hooks/useUserDirectoryQuery';

describe('UserDirectoryFilters', () => {
  function renderFilters(overrides: Partial<Parameters<typeof UserDirectoryFilters>[0]> = {}) {
    return render(
      <MemoryRouter>
        <UserDirectoryFilters
          filters={defaultUserFilters}
          setFilters={vi.fn()}
          showFilters={false}
          setShowFilters={vi.fn()}
          interestsOpen={false}
          setInterestsOpen={vi.fn()}
          activeFiltersCount={0}
          clearAllFilters={vi.fn()}
          handleInterestToggle={vi.fn()}
          isAuthed={false}
          {...overrides}
        />
      </MemoryRouter>,
    );
  }

  it('renders the search input', () => {
    renderFilters();
    expect(screen.getByLabelText(/search members/i)).toBeInTheDocument();
  });

  it('does not offer the filter toggle or panel to anonymous visitors', () => {
    // The panel needs an account; a toggle that opened nothing was a dead button.
    renderFilters({ showFilters: true, isAuthed: false });
    expect(screen.queryByRole('button', { name: /filters/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Location')).not.toBeInTheDocument();
  });

  it('shows advanced filters when toggled and authed', () => {
    renderFilters({ showFilters: true, isAuthed: true });
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Location')).toBeInTheDocument();
  });

  it('shows the active filter count on the labelled toggle', () => {
    renderFilters({ activeFiltersCount: 3, isAuthed: true });
    expect(screen.getByRole('button', { name: 'Filters (3)' })).toBeInTheDocument();
  });
});
