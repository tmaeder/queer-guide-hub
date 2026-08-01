/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tag } from 'lucide-react';
import { ContentListTimeline } from '../ContentListTimeline';
import { ContentListCalendar } from '../ContentListCalendar';
import { dateFields, dateOf, dayKey, UPDATED_AT } from '../dateFields';
import type { ContentTypeConfig } from '@/types/cms';
import type { ListItem } from '../types';

/**
 * Timeline and Calendar are available for every registered type, so they must
 * work from the normalized ListItem plus a chosen column — no per-type wiring.
 */

const config = {
  id: 'events',
  tableName: 'events',
  primaryKey: 'id',
  titleField: 'title',
  icon: Tag,
  label: { singular: 'Event', plural: 'Events' },
  color: 'hsl(0 0% 20%)',
  fields: [
    { name: 'starts_at', label: 'Starts', type: 'datetime', group: 'basic' },
    { name: 'published_on', label: 'Published', type: 'date', group: 'basic' },
    { name: 'title', label: 'Title', type: 'text', group: 'basic' },
    { name: 'secret_at', label: 'Secret', type: 'date', group: 'basic', hidden: true },
  ],
} as unknown as ContentTypeConfig;

const item = (over: Partial<ListItem> & { raw?: Record<string, unknown> } = {}): ListItem =>
  ({
    id: over.id ?? 'a',
    title: over.title ?? 'Pride Berlin',
    description: over.description,
    contentType: 'events',
    contentTypeLabel: 'Event',
    contentTypeColor: 'hsl(0 0% 20%)',
    status: over.status,
    updatedAt: over.updatedAt,
    raw: over.raw ?? {},
  }) as ListItem;

describe('dateFields', () => {
  it('offers only date columns, and never hidden ones', () => {
    expect(dateFields(config).map((f) => f.name)).toEqual(['starts_at', 'published_on']);
  });

  it('is empty for a null config', () => {
    expect(dateFields(null)).toEqual([]);
  });

  it('falls back to updated_at so a type with no date column still works', () => {
    const row = item({ updatedAt: '2026-03-04T10:00:00Z' });
    expect(dateOf(row, null)?.getFullYear()).toBe(2026);
    expect(dateOf(row, UPDATED_AT)?.getFullYear()).toBe(2026);
  });

  it('returns null rather than inventing a date for missing or junk values', () => {
    // A fabricated "now" would silently pile undated records onto today.
    expect(dateOf(item({ raw: {} }), 'starts_at')).toBeNull();
    expect(dateOf(item({ raw: { starts_at: 'not-a-date' } }), 'starts_at')).toBeNull();
    expect(dateOf(item({ raw: { starts_at: null } }), 'starts_at')).toBeNull();
  });

  it('keys days in local time, so a date lands on the day you see', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('timeline view', () => {
  it('groups by month and orders newest first', () => {
    render(
      <ContentListTimeline
        items={[
          item({ id: 'a', title: 'January thing', raw: { starts_at: '2026-01-10T12:00:00Z' } }),
          item({ id: 'b', title: 'March thing', raw: { starts_at: '2026-03-10T12:00:00Z' } }),
        ]}
        loading={false}
        dateField="starts_at"
        onEdit={vi.fn()}
      />,
    );
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings[0]).toContain('March');
    expect(headings[1]).toContain('January');
  });

  it('shows undated records last instead of dropping them', () => {
    // A missing date is usually why someone opened this view.
    render(
      <ContentListTimeline
        items={[
          item({ id: 'a', title: 'Dated', raw: { starts_at: '2026-01-10T12:00:00Z' } }),
          item({ id: 'b', title: 'No date', raw: {} }),
        ]}
        loading={false}
        dateField="starts_at"
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('No date')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading').map((h) => h.textContent ?? '');
    expect(headings[headings.length - 1]).toContain('Undated');
  });

  it('opens the editor for the clicked record', () => {
    const onEdit = vi.fn();
    render(
      <ContentListTimeline
        items={[item({ id: 'x', title: 'Clickable', raw: { starts_at: '2026-01-10T12:00:00Z' } })]}
        loading={false}
        dateField="starts_at"
        onEdit={onEdit}
      />,
    );
    screen.getByRole('button', { name: /Clickable/ }).click();
    expect(onEdit).toHaveBeenCalledWith('events', 'x');
  });
});

describe('calendar view', () => {
  it('renders a month grid with weekday headers', () => {
    render(<ContentListCalendar items={[]} loading={false} dateField={null} onEdit={vi.fn()} />);
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });

  it('places a record on its own day', () => {
    const now = new Date();
    const onThe10th = new Date(now.getFullYear(), now.getMonth(), 10, 12).toISOString();
    render(
      <ContentListCalendar
        items={[item({ id: 'a', title: 'On the tenth', raw: { starts_at: onThe10th } })]}
        loading={false}
        dateField="starts_at"
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'On the tenth' })).toBeInTheDocument();
  });

  it('reports undated records rather than silently omitting them', () => {
    // Otherwise the calendar claims the type has fewer records than it does.
    render(
      <ContentListCalendar
        items={[item({ id: 'a', title: 'No date', raw: {} })]}
        loading={false}
        dateField="starts_at"
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText(/1 record .* no date/)).toBeInTheDocument();
  });
});
