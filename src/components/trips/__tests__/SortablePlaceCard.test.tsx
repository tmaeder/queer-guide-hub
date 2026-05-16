/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/utils/equalityScore', () => ({ getScoreRingColor: () => '#0f0' }));
vi.mock('../PlaceBookableLinks', () => ({ PlaceBookableLinks: () => <div data-testid="links" /> }));

import {
  SortablePlaceCard,
  PlaceCardOverlay,
  getPlaceName,
  getPlaceCategory,
} from '../SortablePlaceCard';

function inDnd(child: React.ReactNode, ids: string[]) {
  return (
    <DndContext>
      <SortableContext items={ids}>{child}</SortableContext>
    </DndContext>
  );
}

describe('getPlaceName', () => {
  it('returns venue name if present', () => {
    expect(getPlaceName({ venues: { name: 'V' } } as never)).toBe('V');
  });
  it('returns event title', () => {
    expect(getPlaceName({ events: { title: 'E' } } as never)).toBe('E');
  });
  it('returns hotel name', () => {
    expect(getPlaceName({ hotels: { name: 'H' } } as never)).toBe('H');
  });
  it('falls back to custom_name', () => {
    expect(getPlaceName({ custom_name: 'Custom' } as never)).toBe('Custom');
  });
  it("falls back to 'Untitled Place'", () => {
    expect(getPlaceName({} as never)).toBe('Untitled Place');
  });
});

describe('getPlaceCategory', () => {
  it('returns venue when venue_id set', () => {
    expect(getPlaceCategory({ venue_id: 'v1' } as never)).toBe('venue');
  });
  it('returns event when event_id set', () => {
    expect(getPlaceCategory({ event_id: 'e1' } as never)).toBe('event');
  });
  it('returns hotel when hotel_id set', () => {
    expect(getPlaceCategory({ hotel_id: 'h1' } as never)).toBe('hotel');
  });
  it('falls back to place.category or custom', () => {
    expect(getPlaceCategory({ category: 'restaurant' } as never)).toBe('restaurant');
    expect(getPlaceCategory({} as never)).toBe('custom');
  });
});

const basePlace = {
  id: 'p1',
  trip_id: 't1',
  venues: { name: 'My Venue' },
  countries: { equality_score: 80 },
  start_time: '14:30',
  end_time: '15:45',
  cities: { name: 'Berlin' },
} as never;

describe('SortablePlaceCard', () => {
  it('renders name + time and PlaceBookableLinks', () => {
    render(inDnd(<SortablePlaceCard place={basePlace} onDelete={vi.fn()} />, ['p1']));
    expect(screen.getByText('My Venue')).toBeInTheDocument();
    expect(screen.getByText('14:30 - 15:45')).toBeInTheDocument();
    expect(screen.getByTestId('links')).toBeInTheDocument();
  });

  it('delete button calls onDelete(id)', () => {
    const onDelete = vi.fn();
    render(inDnd(<SortablePlaceCard place={basePlace} onDelete={onDelete} />, ['p1']));
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onDelete).toHaveBeenCalledWith('p1');
  });
});

describe('PlaceCardOverlay', () => {
  it('renders the name (static, no dnd hooks)', () => {
    render(<PlaceCardOverlay place={basePlace} />);
    expect(screen.getByText('My Venue')).toBeInTheDocument();
  });
});
