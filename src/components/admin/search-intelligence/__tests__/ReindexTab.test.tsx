/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useSearchIntelligence', () => ({
  callSearchIntelligence: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));
vi.mock('@/lib/reindexJob', () => ({
  formatJobDuration: () => '1s',
  normalizeErrors: () => [],
  jobProgressPercent: () => 0,
  anyJobInFlight: () => false,
}));

import { ReindexTab } from '../ReindexTab';

describe('ReindexTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<ReindexTab />);
    expect(container).toBeTruthy();
  });
});
