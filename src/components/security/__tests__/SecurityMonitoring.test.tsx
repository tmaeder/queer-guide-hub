/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) },
}));

import { SecurityMonitoring } from '../SecurityMonitoring';

describe('SecurityMonitoring', () => {
  it('renders', () => {
    const { container } = render(<SecurityMonitoring />);
    expect(container).toBeTruthy();
  });
});
