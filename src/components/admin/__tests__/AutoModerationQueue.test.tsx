/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAutomationMonitor', () => ({
  useAutomationMonitor: () => ({
    pendingFlags: [], stats: null, flagStats: null,
    isLoading: false, isReviewing: false,
    reviewFlag: vi.fn(), bulkReviewFlags: vi.fn(),
  }),
}));

import { AutoModerationQueue } from '../AutoModerationQueue';

describe('AutoModerationQueue', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><AutoModerationQueue /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
