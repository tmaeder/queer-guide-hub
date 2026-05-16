/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    channel: () => ({ on: function () { return this; }, subscribe: function () { return this; }, unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

import { AppProviders } from '../AppProviders';

describe('AppProviders', () => {
  it('renders children', () => {
    const { container } = render(<AppProviders><div>hi</div></AppProviders>);
    expect(container).toBeTruthy();
  });
});
