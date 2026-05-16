/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useUnifiedTags', () => ({ useUnifiedTags: () => ({ tags: [], loading: false, fetchTags: vi.fn() }) }));
vi.mock('@/hooks/useAccessibilityAttributes', () => ({ useAccessibilityAttributes: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useTargetGroups', () => ({ useTargetGroups: () => ({ data: [], isLoading: false }) }));

import { VenueFilters } from '../VenueFilters';

describe('VenueFilters', () => {
  it('renders without crashing', () => {
    const { container } = render(<VenueFilters onFiltersChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
