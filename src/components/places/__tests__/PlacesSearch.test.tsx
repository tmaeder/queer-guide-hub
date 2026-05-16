/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PlacesSearch } from '../PlacesSearch';

describe('PlacesSearch', () => {
  it('renders', () => {
    const { container } = render(<PlacesSearch onSearch={vi.fn()} onFiltersChange={vi.fn()} onNearMeSearch={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
