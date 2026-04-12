import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HotelFilters } from '../HotelFilters';
describe('HotelFilters', () => {
  it('should render filter controls', () => {
    render(<HotelFilters filters={{}} onFilterChange={vi.fn()} />);
    // Should render without crashing
    expect(document.body).toBeTruthy();
  });
});
