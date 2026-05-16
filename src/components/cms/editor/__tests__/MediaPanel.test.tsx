/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSMedia', () => ({
  useCMSMedia: () => ({ assets: [], loading: false, loadAssets: vi.fn(), uploadAsset: vi.fn(), deleteAsset: vi.fn() }),
}));
vi.mock('@/hooks/usePageFetchers', () => ({ updateRow: vi.fn().mockResolvedValue({}) }));

import MediaPanel from '../MediaPanel';

describe('MediaPanel', () => {
  it('renders', () => {
    const { container } = render(<MediaPanel sourceTable="venues" sourceId="v1" />);
    expect(container).toBeTruthy();
  });
});
