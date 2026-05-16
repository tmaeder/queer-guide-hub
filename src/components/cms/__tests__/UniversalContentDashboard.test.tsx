/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useUniversalCMS', () => ({
  useUniversalCMS: () => ({
    allContent: [], contentStats: [], loading: false, error: null,
    totalCount: 0, currentPage: 1,
    fetchAllContent: vi.fn(), deleteUniversalContent: vi.fn(),
  }),
}));

import { UniversalContentDashboard } from '../UniversalContentDashboard';

describe('UniversalContentDashboard', () => {
  it('renders', () => {
    const { container } = render(<UniversalContentDashboard />);
    expect(container).toBeTruthy();
  });
});
