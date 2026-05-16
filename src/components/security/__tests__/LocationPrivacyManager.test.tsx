/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useLocationPrivacy', () => ({
  useLocationPrivacy: () => ({
    locationSettings: { preciseLocation: false, regionOnly: true, anonymizationDays: 30, ipBlocking: false, locationHistory: false },
    updateLocationSetting: vi.fn(),
    isAnonymizing: false,
    triggerAnonymization: vi.fn(),
    isUpdating: false,
  }),
}));

import { LocationPrivacyManager } from '../LocationPrivacyManager';

describe('LocationPrivacyManager', () => {
  it('renders', () => {
    const { container } = render(<LocationPrivacyManager />);
    expect(container).toBeTruthy();
  });
});
