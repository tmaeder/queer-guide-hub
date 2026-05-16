/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { UserDirectoryFilters } from '../UserDirectoryFilters';

describe('UserDirectoryFilters', () => {
  it('renders', () => {
    const { container } = render(
      <UserDirectoryFilters
        filters={{ interests: [] } as never} setFilters={vi.fn()}
        showFilters={false} setShowFilters={vi.fn()}
        interestsOpen={false} setInterestsOpen={vi.fn()}
        nearMe={false} isDetectingLocation={false}
        userLocation={null} setUserLocation={vi.fn()}
        setNearMe={vi.fn()} clearAllFilters={vi.fn()}
        activeFiltersCount={0}
      />,
    );
    expect(container).toBeTruthy();
  });
});
