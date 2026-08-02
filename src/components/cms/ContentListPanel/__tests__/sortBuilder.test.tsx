/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SortBuilder, SortRows } from '../filters/SortBuilder';
import type { FieldConfig } from '@/types/cms';
import type { SortSpec } from '../viewSpec';

const f = (over: Partial<FieldConfig> & { name: string }): FieldConfig =>
  ({ label: over.name, type: 'text', group: 'basic', ...over }) as FieldConfig;

const fields: FieldConfig[] = [
  f({ name: 'name', label: 'Name' }),
  f({ name: 'price', label: 'Price', type: 'number' }),
  f({ name: 'updated_at', label: 'Updated', type: 'datetime' }),
  // Not sortable — must never be offered.
  f({ name: 'amenities', label: 'Amenities', type: 'tags' }),
];

/** The trigger only — badge counts. */
function setupTrigger(sorts: SortSpec[]) {
  const onChange = vi.fn();
  render(<SortBuilder fields={fields} sorts={sorts} onChange={onChange} />);
  return { onChange };
}

/** The row list directly, so no Radix popover has to be opened in jsdom. */
function setup(sorts: SortSpec[]) {
  const onChange = vi.fn();
  render(<SortRows fields={fields} sorts={sorts} onChange={onChange} />);
  return { onChange };
}

describe('SortBuilder trigger', () => {
  it('counts active sorts', () => {
    setupTrigger([
      { field: 'name', dir: 'asc' },
      { field: 'price', dir: 'desc' },
    ]);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows no badge when nothing is sorted', () => {
    setupTrigger([]);
    expect(screen.getByRole('button', { name: /Sort/ })).toBeInTheDocument();
  });
});

describe('reordering', () => {
  const two: SortSpec[] = [
    { field: 'name', dir: 'asc' },
    { field: 'price', dir: 'desc' },
  ];

  it('moves a sort down, changing precedence', () => {
    const { onChange } = setup(two);
    fireEvent.click(screen.getByRole('button', { name: 'Move Name down' }));
    expect(onChange).toHaveBeenCalledWith([two[1], two[0]]);
  });

  it('moves a sort up', () => {
    const { onChange } = setup(two);
    fireEvent.click(screen.getByRole('button', { name: 'Move Price up' }));
    expect(onChange).toHaveBeenCalledWith([two[1], two[0]]);
  });

  it('disables the moves that would fall off either end', () => {
    setup(two);
    expect(screen.getByRole('button', { name: 'Move Name up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Price down' })).toBeDisabled();
  });

  it('removes only the targeted sort', () => {
    const { onChange } = setup(two);
    fireEvent.click(screen.getByRole('button', { name: 'Remove sort: Name' }));
    expect(onChange).toHaveBeenCalledWith([two[1]]);
  });
});

describe('field choice', () => {
  it('never offers a field that cannot be sorted', () => {
    // `tags` is an array column; ordering by it is meaningless.
    setup([{ field: 'name', dir: 'asc' }]);
    fireEvent.click(screen.getByLabelText('Sort field'));
    expect(screen.queryByText('Amenities')).not.toBeInTheDocument();
  });

  it('adds the first unused field', () => {
    const { onChange } = setup([{ field: 'name', dir: 'asc' }]);
    fireEvent.click(screen.getByRole('button', { name: /Add sort/ }));
    expect(onChange).toHaveBeenCalledWith([
      { field: 'name', dir: 'asc' },
      { field: 'price', dir: 'asc' },
    ]);
  });

  it('stops offering Add once every sortable field is used', () => {
    setup([
      { field: 'name', dir: 'asc' },
      { field: 'price', dir: 'asc' },
      { field: 'updated_at', dir: 'asc' },
    ]);
    expect(screen.getByRole('button', { name: /Add sort/ })).toBeDisabled();
  });
});

describe('direction labels', () => {
  it('reads A→Z for text', () => {
    setup([{ field: 'name', dir: 'asc' }]);
    expect(screen.getByText('A → Z')).toBeInTheDocument();
  });

  it('reads oldest/newest for a date, not A→Z', () => {
    // "A → Z" on a timestamp column tells the reader nothing.
    setup([{ field: 'updated_at', dir: 'asc' }]);
    expect(screen.getByText('Oldest first')).toBeInTheDocument();
  });

  it('reads 1→9 for a number', () => {
    setup([{ field: 'price', dir: 'asc' }]);
    expect(screen.getByText('1 → 9')).toBeInTheDocument();
  });
});
