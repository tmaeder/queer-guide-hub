/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TierUpgradeOverlay } from '../TierUpgradeOverlay';

describe('TierUpgradeOverlay', () => {
  it('renders closed', () => {
    const { container } = render(<TierUpgradeOverlay open={false} tierName="Local" onDismiss={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
