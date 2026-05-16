/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) },
}));
vi.mock('@/hooks/usePageFetchers', () => ({ listFromIn: vi.fn().mockResolvedValue([]) }));

import { TagMergeCandidates } from '../TagMergeCandidates';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('TagMergeCandidates', () => {
  it('renders trigger button collapsed by default', () => {
    render(<TagMergeCandidates />, { wrapper });
    expect(screen.getByRole('button', { name: /Tag merge candidates/i })).toBeInTheDocument();
  });

  it('expands when trigger clicked', () => {
    render(<TagMergeCandidates />, { wrapper });
    const trigger = screen.getByRole('button', { name: /Tag merge candidates/i });
    fireEvent.click(trigger);
    // Once expanded, the candidate-finding message appears
    expect(screen.getByText(/No candidates above threshold|Finding candidates/i)).toBeInTheDocument();
  });
});
