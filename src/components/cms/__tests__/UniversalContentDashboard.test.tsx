/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useUniversalCMS', () => ({
  useUniversalCMS: () => ({
    content: [], loading: false, error: null,
    totalCount: 0, filters: {}, setFilters: vi.fn(),
    refresh: vi.fn(), createContent: vi.fn(), updateContent: vi.fn(), deleteContent: vi.fn(),
  }),
}));

import { UniversalContentDashboard } from '../UniversalContentDashboard';

describe('UniversalContentDashboard', () => {
  it('renders', () => {
    const { container } = render(<UniversalContentDashboard />);
    expect(container).toBeTruthy();
  });
});
