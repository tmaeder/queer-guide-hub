/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => {
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return { supabase };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks.supabase }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => ({ isAdmin: true }) }));
vi.mock('@/components/admin/command-palette/useAdminCommandActions', () => ({
  useRegisterAdminCommandAction: () => {},
}));

const sampleAutomation = {
  id: '1',
  slug: 'event_auto_archive',
  name: 'Auto-archive past events',
  description: 'Flip stale events',
  managed_by: 'system' as const,
  enabled: true,
  schedule: '30 3 * * *',
  last_run_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  last_run_status: 'success',
  trigger: { type: 'schedule' },
  conditions: [{ field: 'status', op: 'eq', value: 'active' }],
  action: { type: 'set_status', table: 'events', value: 'completed' },
  created_at: new Date(Date.now() - 86400e3 * 7).toISOString(),
  updated_at: new Date().toISOString(),
};

const sampleRun = {
  id: 1,
  automation_slug: 'event_auto_archive',
  started_at: new Date(Date.now() - 3600e3).toISOString(),
  finished_at: new Date(Date.now() - 3590e3).toISOString(),
  status: 'success' as const,
  items_examined: 12,
  items_changed: 12,
  summary: { rule: 'status=active -> completed' },
  error: null,
};

import AdminAutomation from '../AdminAutomation';

function setupQueryResponses(rows: typeof sampleAutomation[], runs: typeof sampleRun[]) {
  mocks.supabase.from.mockImplementation((table: string) => {
    if (table === 'admin_automations') {
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockImplementation(function (this: unknown) {
          return Object.assign(this as object, {
            then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
          });
        }),
      } as never;
    }
    if (table === 'admin_automation_runs') {
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: runs, error: null }),
        eq: vi.fn().mockReturnThis(),
      } as never;
    }
    return {} as never;
  });
}

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('AdminAutomation', () => {
  beforeEach(() => {
    mocks.supabase.from.mockReset();
    mocks.supabase.rpc.mockReset();
    setupQueryResponses([sampleAutomation], [sampleRun]);
  });

  it('renders header, registry table, recent runs section', async () => {
    render(wrap(<AdminAutomation />));
    expect(await screen.findByRole('heading', { name: /^Automation$/i })).toBeTruthy();
    expect(screen.getByText(/Registered automations/i)).toBeTruthy();
    expect(screen.getByText(/Recent runs/i)).toBeTruthy();
  });

  it('shows Pause all + Resume all header buttons for admins', () => {
    render(wrap(<AdminAutomation />));
    expect(screen.getByRole('button', { name: /^Pause all$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Resume all$/ })).toBeTruthy();
  });

  it('shows Recent runs prompt when no filter active', () => {
    render(wrap(<AdminAutomation />));
    expect(
      screen.getByText(/"Filter runs" on any automation row/i),
    ).toBeTruthy();
  });
});
