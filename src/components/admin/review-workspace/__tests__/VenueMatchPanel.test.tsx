import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VenueMatchPanel } from '../VenueMatchPanel';
import type { ReviewItem } from '@/hooks/useAdminReview';
const state = vi.hoisted(() => ({ query: {} as Record<string, unknown> }));
vi.mock('@/hooks/useVenueMatchReview', () => ({ useVenueMatchReview: () => state.query }));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: string) => value }));
const item = { entity_id: 'event', entity_table: 'events' } as ReviewItem;
beforeEach(() => {
  state.query = {
    data: {
      event: {
        id: 'event',
        venue_name: 'Source Hall',
        address: '42 Main Street, Zürich',
        city_id: 'city',
        updated_at: '2026-10-21T10:00:00Z',
        source_url: 'https://example.org/event',
      },
      city: 'Zürich',
      country: 'Switzerland',
      candidates: [
        {
          id: 'venue',
          name: 'Catalogue Hall',
          address: '42 Main Street',
          website: 'https://example.org',
          name_exact: false,
          distance_m: 1200,
        },
      ],
    },
    refetch: vi.fn(),
  };
});
describe('venue comparison', () => {
  it('compares source and catalogue facts and requires an explicit selection', () => {
    const onSelect = vi.fn();
    render(<VenueMatchPanel item={item} busy={false} selection={null} onSelect={onSelect} />);
    expect(screen.getByText('Source Hall')).toBeVisible();
    expect(screen.getByText('42 Main Street, Zürich')).toBeVisible();
    expect(screen.getByText('Zürich, Switzerland')).toBeVisible();
    expect(screen.getByText('42 Main Street')).toBeVisible();
    expect(screen.getByText(/Similar name/)).toHaveTextContent('1,200 m');
    expect(screen.getByRole('link', { name: 'Check event source' })).toHaveAttribute(
      'href',
      'https://example.org/event',
    );
    expect(screen.getByRole('radio')).not.toBeChecked();
    fireEvent.click(screen.getByRole('radio'));
    expect(onSelect).toHaveBeenLastCalledWith({
      venue_id: 'venue',
      expected_updated_at: '2026-10-21T10:00:00Z',
    });
    fireEvent.change(screen.getByLabelText('Search venues in this city'), {
      target: { value: 'other' },
    });
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('radio')).not.toBeChecked();
  });
  it('invalidates a previous selection during background revalidation', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <VenueMatchPanel item={item} busy={false} selection={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('radio'));
    state.query = { ...state.query, isFetching: true };
    rerender(
      <VenueMatchPanel
        item={item}
        busy={false}
        selection={{ venue_id: 'venue', expected_updated_at: '2026-10-21T10:00:00Z' }}
        onSelect={onSelect}
      />,
    );
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('radio')).not.toBeChecked();
    expect(screen.getByRole('radio')).toBeDisabled();
  });
  it('makes missing candidates actionable without inventing a match', () => {
    (state.query.data as { candidates: unknown[] }).candidates = [];
    render(<VenueMatchPanel item={item} busy={false} selection={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/No open catalogue venue matches/)).toBeVisible();
    expect(screen.queryByRole('radio')).toBeNull();
  });
  it('clears a selection on reload and surfaces failures', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <VenueMatchPanel item={item} busy={false} selection={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: 'Reload venue candidates' }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(state.query.refetch).toHaveBeenCalledOnce();
    state.query = { isError: true };
    rerender(<VenueMatchPanel item={item} busy={false} selection={null} onSelect={onSelect} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Reload before linking');
  });
});
