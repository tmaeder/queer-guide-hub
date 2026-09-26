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
  lifecycle_state: 'active' as const,
  can_run_now: true,
  can_dry_run: true,
  capability_reason: null,
  consecutive_failures: 0,
  auto_pause_threshold: 3,
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

function setupQueryResponses(
  rows: Array<Record<string, unknown>>,
  runs: Array<Record<string, unknown>>,
) {
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
    mocks.supabase.rpc.mockImplementation((fn: string) =>
      Promise.resolve({
        data:
          fn === 'admin_automation_maintenance_state'
            ? {
                active: false,
                generation: null,
                entered_at: null,
                entered_by: null,
                snapshot_count: 0,
              }
            : null,
        error: null,
      }),
    );
    setupQueryResponses([sampleAutomation], [sampleRun]);
  });

  it('renders header, registry table, recent runs section', async () => {
    render(wrap(<AdminAutomation />));
    expect(await screen.findByRole('heading', { name: /^Automation$/i })).toBeTruthy();
    expect(screen.getByText(/Registered automations/i)).toBeTruthy();
    expect(screen.getByText(/Recent runs/i)).toBeTruthy();
  });

  it('shows one maintenance-mode control instead of blanket pause and resume', async () => {
    render(wrap(<AdminAutomation />));
    expect(await screen.findByRole('button', { name: /^Enter maintenance$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Pause all$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Resume all$/ })).toBeNull();
  });

  it('renders only capabilities supported by the registry contract', async () => {
    setupQueryResponses(
      [
        {
          ...sampleAutomation,
          can_run_now: false,
          can_dry_run: false,
          capability_reason: 'No manual action registered',
        },
      ],
      [sampleRun],
    );
    render(wrap(<AdminAutomation />));
    expect(await screen.findByText('Auto-archive past events')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Run now$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Dry-run$/ })).toBeNull();
  });

  it('shows Recent runs prompt when no filter active', () => {
    render(wrap(<AdminAutomation />));
    expect(screen.getByText(/"Filter runs" on any automation row/i)).toBeTruthy();
  });
});
