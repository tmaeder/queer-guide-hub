/**
 * @vitest-environment jsdom
 */
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/test-utils';

const untypedRpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/untyped', () => ({ untypedRpc }));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: <T,>(value: T) => value }));

import { EventQualityIssuesPanel } from '../EventQualityIssuesPanel';

const issue = {
  id: 'issue-1',
  event_id: 'event-1',
  dimension: 'completeness',
  issue_code: 'DESCRIPTION_MISSING',
  severity: 'high',
  evidence: { length: 0 },
  detected_at: '2026-09-20T00:00:00Z',
  last_seen_at: '2026-09-25T00:00:00Z',
  title: 'Example Pride',
  slug: 'example-pride',
  data_source: 'example-source',
} as const;

function mockPage(filteredTotal = 120) {
  untypedRpc.mockResolvedValue({
    data: {
      rows: [issue],
      filtered_total: filteredTotal,
      canonical_total: 51_066,
      offset: 0,
      limit: 50,
    },
    error: null,
  });
}

function renderPanel(query = '', onQueryChange = vi.fn()) {
  return renderWithProviders(
    <EventQualityIssuesPanel query={query} onQueryChange={onQueryChange} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPage();
});

describe('EventQualityIssuesPanel', () => {
  it('renders canonical totals, scoped actions, and readable evidence', async () => {
    renderPanel();

    expect(await screen.findByText('1–50 of 120')).toBeTruthy();
    expect(screen.getByText(/51,066 open issues across the full queue/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Example Pride' }).getAttribute('href')).toBe(
      '/events/example-pride',
    );
    expect(
      screen.getByRole('button', { name: 'Resolve DESCRIPTION_MISSING for Example Pride' }),
    ).toBeTruthy();

    await userEvent.click(screen.getByText(/Evidence · 1 field/));
    expect(screen.getByText('length')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('opens an audit dialog and requires a note without submitting a decision', async () => {
    renderPanel();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', {
        name: 'Resolve DESCRIPTION_MISSING for Example Pride',
      }),
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Mark resolved' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Audit note'), 'Verified against the source.');
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(untypedRpc).toHaveBeenCalledTimes(1);
  });

  it('requests server pages and forwards full-corpus search text', async () => {
    const onQueryChange = vi.fn();
    const { rerender } = renderPanel('', onQueryChange);
    const user = userEvent.setup();

    await screen.findByText('1–50 of 120');
    await user.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() =>
      expect(untypedRpc).toHaveBeenLastCalledWith(
        'event_quality_issue_page',
        expect.objectContaining({ p_offset: 50, p_limit: 50 }),
      ),
    );

    rerender(<EventQualityIssuesPanel query="ticketmaster" onQueryChange={onQueryChange} />);
    await waitFor(() =>
      expect(untypedRpc).toHaveBeenLastCalledWith(
        'event_quality_issue_page',
        expect.objectContaining({ p_query: 'ticketmaster', p_offset: 50 }),
      ),
    );
  });
});
