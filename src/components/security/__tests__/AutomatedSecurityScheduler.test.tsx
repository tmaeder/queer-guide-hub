/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { AutomatedSecurityScheduler } from '../AutomatedSecurityScheduler';

describe('AutomatedSecurityScheduler', () => {
  it('renders', () => {
    const { container } = render(<AutomatedSecurityScheduler />);
    expect(container).toBeTruthy();
  });
});
