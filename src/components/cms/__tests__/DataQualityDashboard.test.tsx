/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/config/contentTypeRegistry', () => ({ contentTypeRegistry: {} }));
vi.mock('@/hooks/useDataQualityDashboard', () => ({
  loadDataQualityRow: vi.fn().mockResolvedValue({ total: 0, missing: 0, stale: 0 }),
  DATA_QUALITY_STALE_DAYS: 30,
}));

import { DataQualityDashboard } from '../DataQualityDashboard';

describe('DataQualityDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<DataQualityDashboard />);
    expect(container).toBeTruthy();
  });
});
