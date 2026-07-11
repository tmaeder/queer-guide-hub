/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// Interpolating t() stub — the test env has no initialized i18n instance.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string; count?: number }) =>
      (opts?.defaultValue ?? _key).replace('{{count}}', String(opts?.count ?? '')),
  }),
}));

import { MonthGrid } from '../MonthGrid';
import type { CalendarItem } from '../types';

const item = (over: Partial<CalendarItem>): CalendarItem => ({
  id: 'x',
  kind: 'event_rsvp',
  layer: 'events',
  title: 'Item',
  subtitle: null,
  starts_at: '2026-07-15T20:00:00',
  ends_at: null,
  all_day: false,
  status: null,
  open_target: '/events/x',
  ...over,
});

const renderGrid = (byDay: Map<string, CalendarItem[]>, onSelectDay = vi.fn()) => {
  render(
    <MemoryRouter>
      <MonthGrid date={new Date('2026-07-15T00:00:00')} byDay={byDay} onSelectDay={onSelectDay} />
    </MemoryRouter>,
  );
  return onSelectDay;
};

describe('MonthGrid', () => {
  it('renders a full-week-aligned July 2026 grid (Jun 29 – Aug 2)', () => {
    renderGrid(new Map());
    const cells = screen.getAllByRole('gridcell');
    expect(cells.length).toBe(35);
    expect(cells[0].getAttribute('aria-label')).toContain('June 29');
    expect(cells[cells.length - 1].getAttribute('aria-label')).toContain('August 2');
  });

  it('collapses history items into one aggregate chip and shows +N overflow', () => {
    const byDay = new Map([
      [
        '2026-07-15',
        [
          item({ id: 'a', title: 'A' }),
          item({ id: 'b', title: 'B' }),
          item({ id: 'c', title: 'C' }),
          item({ id: 'd', title: 'D' }),
          item({ id: 'h1', kind: 'history', layer: 'history', title: 'H1' }),
          item({ id: 'h2', kind: 'history', layer: 'history', title: 'H2' }),
        ],
      ],
    ]);
    renderGrid(byDay);
    // aggregate history chip, not individual names
    expect(screen.getByText(/Queer history · 2/)).toBeTruthy();
    expect(screen.queryByText('H1')).toBeNull();
    // 4 non-history items, 3 chips max → +1 more
    expect(screen.getByText('+1 more')).toBeTruthy();
  });

  it('selects a day on click', () => {
    const onSelect = renderGrid(new Map());
    const cell = screen
      .getAllByRole('gridcell')
      .find((c) => c.getAttribute('aria-label')?.includes('July 15'))!;
    fireEvent.click(cell);
    expect(onSelect).toHaveBeenCalled();
    const d: Date = onSelect.mock.calls[0][0];
    expect(d.getDate()).toBe(15);
  });

  it('moves focus with arrow keys (roving tabindex)', () => {
    renderGrid(new Map());
    const cells = screen.getAllByRole('gridcell');
    const focused = cells.find((c) => c.tabIndex === 0)!;
    focused.focus();
    fireEvent.keyDown(focused, { key: 'ArrowRight' });
    const idx = Number(focused.getAttribute('data-idx'));
    const next = cells.find((c) => Number(c.getAttribute('data-idx')) === idx + 1)!;
    expect(document.activeElement).toBe(next);
  });
});
