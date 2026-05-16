/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

const { fromSpy } = vi.hoisted(() => ({ fromSpy: vi.fn() }));

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => fromSpy(),
}));

import VersionHistoryDialog from '../VersionHistoryDialog';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => fromSpy.mockReset());

describe('VersionHistoryDialog', () => {
  it('trigger disabled without pipelineId', () => {
    render(<VersionHistoryDialog pipelineId={undefined} onRevert={vi.fn()} />, { wrapper });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('opens dialog with empty state when no versions', async () => {
    fromSpy.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    });
    render(<VersionHistoryDialog pipelineId="p1" onRevert={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/No version history yet/)).toBeInTheDocument());
  });

  it('renders version rows with current badge', async () => {
    fromSpy.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({
              data: [
                { id: 'v1', pipeline_id: 'p1', version: 2, name: 'p1', display_name: null, description: null, nodes: [{}], edges: [], schedule: null, saved_by: 'u1abc', saved_at: '2026-05-15T00:00:00Z' },
                { id: 'v0', pipeline_id: 'p1', version: 1, name: 'p1', display_name: null, description: null, nodes: [], edges: [], schedule: '0 * * * *', saved_by: null, saved_at: '2026-05-14T00:00:00Z' },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });
    render(<VersionHistoryDialog pipelineId="p1" currentVersion={2} onRevert={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('v2')).toBeInTheDocument());
    expect(screen.getByText('current')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('0 * * * *')).toBeInTheDocument();
  });
});
