/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/hooks/useTopicClusters', () => ({ useTopicClusters: () => ({ clusters: [], loading: false }) }));

import { SearchFiltersPanel } from '../SearchFiltersPanel';

describe('SearchFiltersPanel', () => {
  it('lets readers add a category without replacing the active category', () => {
    const onFiltersChange = vi.fn();
    render(<SearchFiltersPanel
      filters={{ categories: ['bar'] }}
      facets={{ category: { bar: 2, cafe: 1 } }}
      filterKeys={['category']}
      onFiltersChange={onFiltersChange}
    />);

    expect(screen.getByRole('button', { name: /bar/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /cafe/i }));
    expect(onFiltersChange).toHaveBeenCalledWith({ categories: ['bar', 'cafe'] });
  });

  it('renders without crashing', () => {
    const { container } = render(<SearchFiltersPanel filters={{}} onFiltersChange={vi.fn()} onClearAll={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
