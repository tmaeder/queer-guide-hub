/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

import { SecurityMonitoringDashboard } from '../SecurityMonitoringDashboard';

describe('SecurityMonitoringDashboard', () => {
  it('renders', () => {
    const { container } = render(<SecurityMonitoringDashboard />);
    expect(container).toBeTruthy();
  });
});
