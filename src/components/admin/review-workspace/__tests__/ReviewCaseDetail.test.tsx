import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewItem } from '@/hooks/useAdminReview';
import type { ReviewCaseDetails } from '@/hooks/useReviewCase';

const state = vi.hoisted(() => ({
  data: null as ReviewCaseDetails | null,
  isFetching: false,
  error: null as Error | null,
  venueQuery: {} as Record<string, unknown>,
}));
vi.mock('../JevReviewStatus', () => ({ JevReviewStatus: () => null }));
vi.mock('@/hooks/useReviewCase', () => ({
  reviewCaseInfo: (item: ReviewItem) => item.meta.review_case,
  useReviewCase: () => ({ ...state, isError: !!state.error, isLoading: false, refetch: vi.fn() }),
  useRetryReviewResearch: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));
vi.mock('@/hooks/useVenueMatchReview', () => ({ useVenueMatchReview: () => state.venueQuery }));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: string) => value }));
vi.mock('@/components/admin/shell/AdminShell', () => ({
  useAdminShell: () => ({ openEditor: vi.fn() }),
}));
import { ReviewCaseDetail } from '../ReviewCaseDetail';

const member = (id: string): ReviewItem & { current_record: Record<string, unknown> } =>
  ({
    id,
    queue_type: 'event-quality',
    title: `Event ${id}`,
    subtitle: 'IMAGE_REUSED',
    entity_id: id,
    entity_table: 'events',
    meta: { evidence: { images: [{ url: 'https://example.test/artwork.jpg' }] } },
    current_record: { start_date: '2026-11-01T20:00:00Z', website: 'https://example.test/event' },
  }) as unknown as ReviewItem & { current_record: Record<string, unknown> };
const item = (family = 'artwork', stage = 'ready'): ReviewItem =>
  ({
    id: 'case',
    queue_type: 'review-case',
    title: 'Shared artwork',
    entity_id: 'e1',
    entity_table: 'events',
    meta: { review_case: { id: 'case', fingerprint: 'old', family, stage, member_count: 2 } },
  }) as unknown as ReviewItem;
describe('review cases', () => {
  beforeEach(() => {
    state.venueQuery = {
      data: {
        event: {
          id: 'e1',
          city_id: 'city',
          venue_name: 'Source venue',
          updated_at: '2026-10-21T12:00:00Z',
          source_url: 'https://source.test/event',
        },
        city: 'Zürich',
        country: 'Switzerland',
        candidates: [
          {
            id: 'venue-live',
            name: 'Live catalogue venue',
            address: '42 Source Street',
            website: 'https://venue.test',
            name_exact: true,
            distance_m: 40,
          },
        ],
      },
      refetch: vi.fn(),
    };
    state.isFetching = false;
    state.error = null;
    state.data = {
      id: 'case',
      family: 'artwork',
      fingerprint: 'current',
      members: [member('one'), member('two')],
      research: null,
    };
  });
  it('requires evidence and confirmation, preserves exclusions and submits current evidence version', () => {
    const save = vi.fn();
    render(
      <ReviewCaseDetail
        item={item()}
        busy={false}
        onDecision={save}
        onBack={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: 'Accept shared artwork (2)' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Evidence and decision note'), {
      target: { value: 'The organizer source identifies this series artwork.' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Include Event two/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /I checked all 1 selected/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept shared artwork (1)' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reject',
        confirm: true,
        payload: { member_ids: ['one'] },
        item: expect.objectContaining({
          meta: expect.objectContaining({
            review_case: expect.objectContaining({ fingerprint: 'current' }),
          }),
        }),
      }),
    );
  });
  it('shows blocked research and its reason without offering a decision', () => {
    state.data!.family = 'venue';
    state.data!.research = {
      status: 'blocked',
      attempts: 3,
      last_attempt_at: '2026-10-21T10:00:00Z',
      next_attempt_at: null,
      outcome: {
        reason: 'No canonical venue candidates in the same city and country',
        source_url: 'javascript:alert(1)',
      },
    };
    render(
      <ReviewCaseDetail
        item={item('venue', 'blocked')}
        busy={false}
        onDecision={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText('Research is blocked')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Research status' })).getByText(
        'No canonical venue candidates in the same city and country',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link selected venue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open research source' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Queue another research attempt' }),
    ).toBeInTheDocument();
  });
  it('uses live comparison and requires renewed confirmation when case evidence changes', () => {
    state.data!.family = 'venue';
    state.data!.members = [member('source-one'), member('source-two')].map((m) => ({
      ...m,
      entity_id: 'e1',
      current_record: { ...m.current_record, updated_at: 'stale-cached-timestamp' },
    }));
    const save = vi.fn();
    const props = {
      item: item('venue'),
      busy: false,
      onDecision: save,
      onBack: vi.fn(),
      onSkip: vi.fn(),
    };
    const { rerender } = render(<ReviewCaseDetail {...props} />);
    expect(screen.getByText('42 Source Street')).toBeVisible();
    expect(screen.getByText(/Exact name/)).toHaveTextContent('40 m');
    expect(screen.getByLabelText('Search venues in this city')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Evidence and decision note'), {
      target: { value: 'The event source identifies this exact address.' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /I checked the current record/ }));
    const link = screen.getByRole('button', { name: 'Link selected venue' });
    expect(link).toBeDisabled();
    fireEvent.click(screen.getByRole('radio'));
    expect(link).toBeEnabled();
    fireEvent.click(link);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          venue_id: 'venue-live',
          member_ids: ['source-one', 'source-two'],
          expected_updated_at: '2026-10-21T12:00:00Z',
        },
      }),
    );
    state.data = { ...state.data!, fingerprint: 'new-current-evidence' };
    rerender(<ReviewCaseDetail {...props} />);
    expect(
      screen.getByRole('checkbox', { name: /I checked the current record/ }),
    ).not.toBeChecked();
    expect(screen.getByRole('radio')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Link selected venue' })).toBeDisabled();
  });
  it('does not offer a decision when current evidence failed to load', () => {
    state.data = null;
    state.error = new Error('Evidence unavailable');
    render(
      <ReviewCaseDetail
        item={item()}
        busy={false}
        onDecision={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Evidence unavailable');
    expect(screen.queryByRole('button', { name: /Accept shared artwork/ })).not.toBeInTheDocument();
  });
});
