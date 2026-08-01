/**
 * @vitest-environment jsdom
 *
 * The old version of this file was a "renders without crashing" smoke test that
 * asserted nothing about the page. These cover the three behaviours the rebuild
 * is actually for: only real work shows up, urgency wins over size, and an
 * editor costs zero extra requests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { AdminCounts } from '@/hooks/useAdminCounts';

const mockCounts = vi.fn<() => Partial<ReturnType<typeof adminCountsResult>>>();
const mockRole = vi.fn(() => ({ effectiveRole: 'admin', loading: false }));
const mockOps = vi.fn(() => ({ data: undefined, isLoading: false, isError: false }));

function adminCountsResult(data: AdminCounts | undefined) {
  return { data, isLoading: false, isFetching: false, dataUpdatedAt: 1_700_000_000_000 };
}

vi.mock('@/hooks/useAdminCounts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAdminCounts')>();
  return { ...actual, useAdminCounts: () => mockCounts() };
});
vi.mock('@/hooks/useGranularRoles', () => ({ useGranularRoles: () => mockRole() }));
vi.mock('@/hooks/useCockpitOps', () => ({
  useCockpitOps: (enabled: boolean) => mockOps(enabled as never),
}));
vi.mock('@/hooks/useCockpitRealtime', () => ({ useCockpitRealtime: () => {} }));
vi.mock('@/hooks/useCockpitSections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCockpitSections')>();
  return {
    ...actual,
    useCockpitSections: () => ({
      isVisible: (id: string) => !hiddenSections.has(id),
      toggle: vi.fn(),
      reset: vi.fn(),
      eligible: actual.COCKPIT_SECTIONS,
      hidden: hiddenSections,
    }),
  };
});

let hiddenSections = new Set<string>();

import AdminDashboard from '../AdminDashboard';

function render() {
  return renderWithProviders(
    <TooltipProvider>
      <AdminDashboard />
    </TooltipProvider>,
  );
}

const counts = (data: Record<string, unknown>) => adminCountsResult(data as unknown as AdminCounts);

beforeEach(() => {
  // mock.calls accumulates across tests; the request-budget assertions read it.
  mockOps.mockClear();
  hiddenSections = new Set<string>();
  mockRole.mockReturnValue({ effectiveRole: 'admin', loading: false });
  mockOps.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  mockCounts.mockReturnValue(counts({}));
});

describe('AdminDashboard — Needs you', () => {
  it('renders no row for a queue with nothing pending', () => {
    mockCounts.mockReturnValue(counts({ review_staging: 0, review_tags: 4 }));
    render();
    const list = screen.getByRole('region', { name: /needs you/i });
    expect(within(list).queryByText('Staging')).toBeNull();
    expect(within(list).getByText('Tag suggestions')).toBeTruthy();
  });

  it('renders each queue as a link to its own inbox queue', () => {
    mockCounts.mockReturnValue(counts({ quality_city: 2 }));
    render();
    const link = screen.getByRole('link', { name: /City quality/ });
    expect(link.getAttribute('href')).toBe('/admin/inbox?queue=quality-city');
  });

  it('ranks an overdue queue above a heavier, larger, on-time one', () => {
    mockCounts.mockReturnValue(
      counts({
        review_moderation: 500,
        review_moderation_overdue: 0,
        review_automation: 1,
        review_automation_overdue: 1,
      }),
    );
    render();
    const links = screen
      .getAllByRole('link')
      .map((a) => a.textContent ?? '')
      .filter((t) => t.includes('Automation') || t.includes('Reports'));
    expect(links[0]).toContain('Automation');
  });

  it('says "All clear." and lists nothing when every queue is empty', () => {
    mockCounts.mockReturnValue(counts({ venues: 32000 }));
    render();
    expect(screen.getByText('All clear.')).toBeTruthy();
    const list = screen.getByRole('region', { name: /needs you/i });
    expect(within(list).queryAllByRole('link')).toHaveLength(0);
  });
});

describe('AdminDashboard — request budget', () => {
  it('never calls useCockpitOps for an editor', () => {
    mockRole.mockReturnValue({ effectiveRole: 'editor', loading: false });
    mockCounts.mockReturnValue(counts({ review_staging: 3 }));
    render();
    // The hook is still invoked (hooks cannot be conditional) but must be
    // told not to fetch — that `enabled=false` is the whole guarantee.
    expect(mockOps).toHaveBeenCalled();
    expect(mockOps.mock.calls.every((call) => call[0] === false)).toBe(true);
    expect(screen.queryByRole('region', { name: /broken/i })).toBeNull();
  });

  it('enables the ops query for an admin', () => {
    mockCounts.mockReturnValue(counts({}));
    render();
    expect(mockOps.mock.calls.some((call) => call[0] === true)).toBe(true);
  });

  it('disables the ops query when the Broken section is hidden', () => {
    hiddenSections = new Set(['broken']);
    mockCounts.mockReturnValue(counts({}));
    render();
    expect(mockOps.mock.calls.every((call) => call[0] === false)).toBe(true);
    expect(screen.queryByRole('region', { name: /broken/i })).toBeNull();
  });
});

describe('AdminDashboard — Broken', () => {
  it('says it could not read, rather than "Nothing failing", when the ops query errors', () => {
    mockOps.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render();
    expect(screen.getByText('Could not read system status.')).toBeTruthy();
    expect(screen.queryByText('Nothing failing.')).toBeNull();
  });

  it('says nothing is failing only when the sources actually came back clear', () => {
    mockOps.mockReturnValue({
      data: {
        failingAutomations: [],
        pipelineErrors: [],
        pipelineErrors24h: 0,
        failingGates: [],
        failedImportsToday: 0,
        allClear: true,
      },
      isLoading: false,
      isError: false,
    } as never);
    render();
    expect(screen.getByText('Nothing failing.')).toBeTruthy();
  });
});

describe('AdminDashboard — Jump to', () => {
  it('shows a destination with no RPC count as label-only, never as 0', () => {
    // `milestones` is declared as a countTable in adminNavigation but is not in
    // get_admin_counts' reltuples list.
    mockCounts.mockReturnValue(counts({ venues: 32000 }));
    render();
    const jump = screen.getByRole('region', { name: /jump to/i });
    const milestones = within(jump).getByRole('link', { name: /Milestones/ });
    expect(milestones.textContent).toBe('Milestones');
    expect(within(jump).getByRole('link', { name: /Venues/ }).textContent).toContain('32.0k');
  });
});
