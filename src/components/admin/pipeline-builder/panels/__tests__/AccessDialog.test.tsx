/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin1' } } }) } },
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.order = () => Promise.resolve({ data: [], error: null });
    chain.insert = () => Promise.resolve({ error: null });
    chain.delete = () => ({ eq: () => Promise.resolve({ error: null }) });
    return chain;
  },
}));

import AccessDialog from '../AccessDialog';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('AccessDialog', () => {
  it('trigger disabled without pipelineId', () => {
    render(<AccessDialog pipelineId={undefined} pipelineName="x" />, { wrapper });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('opens dialog showing access form', () => {
    render(<AccessDialog pipelineId="p1" pipelineName="My Pipeline" />, { wrapper });
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByLabelText(/User email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Permission/)).toBeInTheDocument();
  });
});
