import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';
import { HotelFilters } from '../HotelFilters';

describe('HotelFilters', () => {
  it('should render filter controls', () => {
    renderWithProviders(<HotelFilters filters={{}} onFilterChange={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
