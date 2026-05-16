/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useTopicClusters', () => ({ useTopicClusters: () => ({ clusters: [], loading: false }) }));

import { SearchFiltersPanel } from '../SearchFiltersPanel';

describe('SearchFiltersPanel', () => {
  it('renders without crashing', () => {
    const { container } = render(<SearchFiltersPanel filters={{}} onFiltersChange={vi.fn()} onClearAll={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
