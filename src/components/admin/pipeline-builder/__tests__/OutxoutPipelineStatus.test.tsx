/** @vitest-environment jsdom */
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
const { useStatus, refresh } = vi.hoisted(() => ({ useStatus: vi.fn(), refresh: vi.fn() }));
vi.mock('../hooks/useOutxoutPipelines', () => ({ useOutxoutPipelines: useStatus }));
import OutxoutPipelineStatus from '../OutxoutPipelineStatus';
const row = {
  name: 'outxout-official-date-review',
  label: 'Out x Out official-date checks',
  pipelineId: 'dates',
  automation: 'outxout_official_dates_weekly',
  enabled: true,
  scheduleLabel: 'Wednesdays at 09:00 · Europe/Zurich',
  run: {
    status: 'completed',
    created_at: '2026-11-18T19:52:00Z',
    completed_at: '2026-11-18T19:52:00Z',
    items_processed: 21,
    items_failed: 0,
    context: { approved: 0 },
  },
  warnings: [{ url: 'https://prideonthepark.co.uk/tickets/', error: 'source_http_404' }],
  error: null,
};
const mount = () =>
  render(
    <MemoryRouter>
      <OutxoutPipelineStatus />
    </MemoryRouter>,
  );
beforeEach(() => {
  useStatus.mockReset();
  refresh.mockClear();
  useStatus.mockReturnValue({
    data: [row],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: refresh,
  });
});
it('makes the schedule, latest result and recoverable source warnings visible', () => {
  mount();
  expect(screen.getByText('Wednesdays at 09:00 · Europe/Zurich')).toBeVisible();
  expect(screen.getByText('21 events checked · 0 approved · 0 errors')).toBeVisible();
  expect(screen.getByText('No run errors.')).toBeVisible();
  fireEvent.click(screen.getByText('1 source warning'));
  expect(screen.getByText('HTTP 404')).toBeVisible();
  expect(screen.getByRole('link', { name: 'View schedule' })).toHaveAttribute(
    'href',
    '/admin/automation?automation=outxout_official_dates_weekly',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Out x Out status' }));
  expect(refresh).toHaveBeenCalledOnce();
});
it('shows run failures separately from source warnings', () => {
  useStatus.mockReturnValue({
    data: [
      {
        ...row,
        error: 'Official-source checks exhausted retries',
        run: { ...row.run, status: 'failed', items_failed: 1 },
      },
    ],
    refetch: refresh,
  });
  mount();
  expect(screen.getByRole('alert')).toHaveTextContent('exhausted retries');
  expect(screen.queryByText('No run errors.')).toBeNull();
});
it('shows fetch failure with retry rather than pretending that no errors exist', () => {
  useStatus.mockReturnValue({ isError: true, refetch: refresh });
  mount();
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
  expect(screen.queryByText('No run errors.')).toBeNull();
});
