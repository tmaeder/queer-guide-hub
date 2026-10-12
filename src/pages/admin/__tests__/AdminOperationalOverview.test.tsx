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
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/test-utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { AdminCounts } from '@/hooks/useAdminCounts';
import type { CockpitOps } from '@/hooks/useCockpitOps';

interface OpsResult {
  data: CockpitOps | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching?: boolean;
  refetch?: () => void;
}

const mockCounts = vi.fn<() => Partial<ReturnType<typeof adminCountsResult>>>();
const mockRole = vi.fn(() => ({ effectiveRole: 'admin', loading: false }));
// The `enabled` parameter has to be in the signature, not just passed through:
// the request-budget assertions below read `mock.calls[i][0]`, which is a
// zero-length tuple for a `vi.fn(() => …)`.
const mockOps = vi.fn<(enabled: boolean) => OpsResult>();

const retryCounts = vi.fn();
const retryOps = vi.fn();
const healthyOps: CockpitOps = {
  failingAutomations: [],
  pipelineErrors: [],
  pipelineErrors24h: 0,
  failingGates: [],
  failedImportsToday: 0,
  unavailableSources: [],
  allClear: true,
};

function adminCountsResult(data: AdminCounts | undefined) {
  return {
    data,
    isLoading: false,
    isFetching: false,
    isError: false,
    dataUpdatedAt: 1_700_000_000_000,
    refetch: retryCounts,
  };
}

vi.mock('@/hooks/useAdminCounts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAdminCounts')>();
  return { ...actual, useAdminCounts: () => mockCounts() };
});
vi.mock('@/hooks/useGranularRoles', () => ({ useGranularRoles: () => mockRole() }));
vi.mock('@/hooks/useCockpitOps', () => ({
  useCockpitOps: (enabled: boolean) => mockOps(enabled),
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

import AdminOperationalOverview from '../AdminOperationalOverview';

function render() {
  return renderWithProviders(
    <TooltipProvider>
      <AdminOperationalOverview />
    </TooltipProvider>,
  );
}

const counts = (data: Record<string, unknown>) => adminCountsResult(data as unknown as AdminCounts);

beforeEach(() => {
  // mock.calls accumulates across tests; the request-budget assertions read it.
  mockOps.mockClear();
  hiddenSections = new Set<string>();
  mockRole.mockReturnValue({ effectiveRole: 'admin', loading: false });
  retryCounts.mockClear();
  retryOps.mockClear();
  mockOps.mockReturnValue({
    data: healthyOps,
    isLoading: false,
    isError: false,
    refetch: retryOps,
  });
  mockCounts.mockReturnValue(counts({}));
});

describe('AdminOperationalOverview — Needs you', () => {
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
    expect(link.getAttribute('href')).toBe('/admin/governance?mode=triage&queue=quality-city');
  });

  it('does not say all clear when glossary work is pending', () => {
    mockCounts.mockReturnValue(counts({ quality_glossary: 9 }));
    render();
    expect(screen.queryByText('All clear.')).toBeNull();
    const link = screen.getByRole('link', { name: /Glossary quality/ });
    expect(link.getAttribute('href')).toBe('/admin/settings');
  });

  it('ranks safety work above a routine overdue queue', () => {
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
    expect(links[0]).toContain('Reports');
  });

  it('explains safety, SLA and public-impact relevance in the queue row', () => {
    mockCounts.mockReturnValue(
      counts({
        quality_city: 3,
        quality_city_overdue: 2,
        sla_hours: { quality_city: 72 },
      }),
    );
    render();
    const link = screen.getByRole('link', { name: /City quality/ });
    expect(within(link).getByText('Safety')).toBeTruthy();
    expect(within(link).getByText('2 overdue')).toBeTruthy();
    expect(within(link).getByText('Public')).toBeTruthy();
  });

  it('says "All clear." and lists nothing when every queue is empty', () => {
    mockCounts.mockReturnValue(counts({ venues: 32000 }));
    render();
    expect(screen.getByText('All clear.')).toBeTruthy();
    const list = screen.getByRole('region', { name: /needs you/i });
    expect(within(list).queryAllByRole('link')).toHaveLength(0);
  });
});

describe('AdminOperationalOverview — request budget', () => {
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

describe('AdminOperationalOverview — Broken', () => {
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
    });
    render();
    expect(screen.getByText('Nothing failing.')).toBeTruthy();
  });
});

describe('AdminOperationalOverview — Jump to', () => {
  it('distinguishes unavailable counts from real zeroes', () => {
    // `milestones` is declared as a countTable in adminNavigation but is not in
    // get_admin_counts' reltuples list.
    mockCounts.mockReturnValue(counts({ events: 32000, redirects: 0 }));
    render();
    const jump = screen.getByRole('region', { name: /jump to/i });
    const milestones = within(jump).getByRole('link', { name: /Milestones/ });
    expect(milestones.textContent).toContain('Count unavailable');
    expect(milestones.textContent).not.toContain('0');
    expect(within(jump).getByRole('link', { name: /Events/ }).textContent).toContain('32.0k');
    expect(within(jump).getByRole('link', { name: /Redirects/ }).textContent).toBe('Redirects0');
  });
});

describe('AdminOperationalOverview — recovery', () => {
  it('does not claim clear or nothing pending when queue counts fail, and retries', async () => {
    mockCounts.mockReturnValue({ ...adminCountsResult(undefined), isError: true });
    render();
    expect(screen.getByText('Queue status unavailable.')).toBeTruthy();
    expect(screen.queryByText('All clear.')).toBeNull();
    expect(screen.queryByText('Nothing pending.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry queue counts' }));
    expect(retryCounts).toHaveBeenCalledOnce();
  });

  it('retains cached queue rows with a stale-data explanation after a failed refresh', () => {
    mockCounts.mockReturnValue({ ...counts({ review_staging: 12345 }), isError: true });
    render();
    expect(
      screen.getByText('Showing the last successful counts. They may be out of date.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Staging/ }).textContent).toContain(
      (12345).toLocaleString(),
    );
  });

  it('retains known system issues alongside unavailable sources and retries', async () => {
    mockOps.mockReturnValue({
      data: {
        ...healthyOps,
        allClear: false,
        unavailableSources: ['Release gates'],
        failingAutomations: [{ slug: 'sync', name: 'Content sync', lastRunAt: null }],
      },
      isLoading: false,
      isError: false,
      refetch: retryOps,
    });
    render();
    expect(screen.getByText('System status incomplete.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Automations failing/ })).toBeTruthy();
    expect(screen.queryByText('Nothing failing.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry system checks' }));
    expect(retryOps).toHaveBeenCalledOnce();
  });

  it('does not claim all clear while system checks are loading', () => {
    mockOps.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render();
    expect(screen.queryByText('All clear.')).toBeNull();
  });

  it('retains cached system issues after a failed refresh', () => {
    mockOps.mockReturnValue({
      data: {
        ...healthyOps,
        allClear: false,
        failingAutomations: [{ slug: 'sync', name: 'Content sync', lastRunAt: null }],
      },
      isLoading: false,
      isError: true,
      refetch: retryOps,
    });
    render();
    expect(
      screen.getByText('Could not refresh system checks. Showing the last successful results.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Automations failing/ })).toBeTruthy();
  });

  it('shows progress and disables manual refresh while fetching', () => {
    mockCounts.mockReturnValue({ ...counts({}), isFetching: true });
    render();
    const refresh = screen.getByRole('button', { name: 'Refreshing cockpit' });
    expect(refresh.hasAttribute('disabled')).toBe(true);
    expect(refresh.getAttribute('aria-busy')).toBe('true');
  });
});
