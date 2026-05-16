/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ upsert: () => Promise.resolve({ data: null, error: null }) }) },
}));

import { ShareControls } from '../ShareControls';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('ShareControls', () => {
  it('renders', () => {
    const { container } = render(
      <ShareControls prefs={{ countries: true, cities: true, venues: true, events: true } as never} />,
      { wrapper },
    );
    expect(container).toBeTruthy();
  });
});
