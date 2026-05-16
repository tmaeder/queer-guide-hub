/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/components/security/EnhancedSecurityDashboard', () => ({ EnhancedSecurityDashboard: () => null }));
vi.mock('@/components/security/LocationPrivacyManager', () => ({ LocationPrivacyManager: () => null }));
vi.mock('@/components/security/PrivacyControlCenter', () => ({ PrivacyControlCenter: () => null }));
vi.mock('@/components/security/SecureFinancialDataViewer', () => ({ SecureFinancialDataViewer: () => null }));

import SecurityDashboard from '../SecurityDashboard';

describe('SecurityDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<SecurityDashboard />);
    expect(container).toBeTruthy();
  });
});
