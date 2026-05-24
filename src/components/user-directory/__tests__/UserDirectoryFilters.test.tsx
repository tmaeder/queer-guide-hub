/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserDirectoryFilters } from '../UserDirectoryFilters';
import { defaultUserFilters } from '@/hooks/useUserDirectoryQuery';

describe('UserDirectoryFilters', () => {
  function renderFilters(overrides: Partial<Parameters<typeof UserDirectoryFilters>[0]> = {}) {
    return render(
      <UserDirectoryFilters
        filters={defaultUserFilters}
        setFilters={vi.fn()}
        showFilters={false}
        setShowFilters={vi.fn()}
        interestsOpen={false}
        setInterestsOpen={vi.fn()}
        nearMe={false}
        isDetectingLocation={false}
        handleNearMeToggle={vi.fn()}
        activeFiltersCount={0}
        clearAllFilters={vi.fn()}
        handleInterestToggle={vi.fn()}
        isAuthed={false}
        {...overrides}
      />,
    );
  }

  it('renders the search input', () => {
    renderFilters();
    expect(screen.getByLabelText(/search members/i)).toBeInTheDocument();
  });

  it('does not show advanced filters for anonymous visitors', () => {
    renderFilters({ showFilters: true, isAuthed: false });
    expect(screen.queryByText(/^filters$/i)).not.toBeInTheDocument();
  });

  it('shows advanced filters when toggled and authed', () => {
    renderFilters({ showFilters: true, isAuthed: true });
    expect(screen.getByText(/^filters$/i)).toBeInTheDocument();
  });

  it('shows the filter count badge', () => {
    renderFilters({ activeFiltersCount: 3 });
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
