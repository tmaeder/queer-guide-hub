/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useHotels', () => ({
  useHotels: () => ({
    createHotel: vi.fn(),
    updateHotel: vi.fn(),
    deleteHotel: vi.fn(),
    regenerateSafetyNote: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAddressResolver', () => ({
  useAddressResolver: () => ({ resolveAddress: vi.fn() }),
}));
vi.mock('@/components/admin/data-table/AdminDataTable', () => ({
  AdminDataTable: () => <div>table</div>,
}));

import { HotelsManager } from '../HotelsManager';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const listProps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/components/cms/ContentListPanel', () => ({
  ContentListPanel: (props: Record<string, unknown>) => {
    listProps.current = props;
    return <div>list</div>;
  },
}));

describe('HotelsManager', () => {
  it('relies on the shared list exports instead of its own Excel button', () => {
    // The workspace list header renders Excel + CSV (every column) for every
    // list; a bespoke button in `tools` would show a second "Export Excel".
    render(<HotelsManager />, { wrapper });
    expect(listProps.current.workspace).toBe(true);
    expect(listProps.current.tools).toBeUndefined();
  });

  it('renders without crashing', () => {
    const { container } = render(<HotelsManager />, { wrapper });
    expect(container).toBeTruthy();
  });
});
