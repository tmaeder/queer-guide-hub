/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } } }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => ({
    select: () => ({
      order: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
  untypedSupabase: {},
}));

import TemplateLibrary from '../TemplateLibrary';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('TemplateLibrary', () => {
  it('renders trigger button', () => {
    render(<TemplateLibrary selectedNodes={[]} selectedEdges={[]} onApply={vi.fn()} />, { wrapper });
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
