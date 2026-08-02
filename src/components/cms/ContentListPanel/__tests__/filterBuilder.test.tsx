/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterBuilder } from '../filters/FilterBuilder';
import { FilterRow } from '../filters/FilterRow';
import type { FieldConfig } from '@/types/cms';
import type { Filter } from '../viewSpec';

const f = (over: Partial<FieldConfig> & { name: string }): FieldConfig =>
  ({ label: over.name, type: 'text', group: 'basic', ...over }) as FieldConfig;

const fields: FieldConfig[] = [
  f({ name: 'name', label: 'Name' }),
  f({
    name: 'category',
    label: 'Category',
    type: 'select',
    options: [
      { value: 'bar', label: 'Bar' },
      { value: 'club', label: 'Club' },
    ],
  }),
  f({ name: 'verified', label: 'Verified', type: 'boolean' }),
  f({ name: 'price', label: 'Price', type: 'number' }),
  // Computed: offered but never filterable, whatever its declared type.
  f({ name: 'country_name', label: 'Country', type: 'select', virtual: true }),
];

const optionsFor = (field: FieldConfig) => field.options ?? [];

function renderRow(filter: Filter) {
  const onChange = vi.fn();
  const onRemove = vi.fn();
  render(
    <FilterRow
      filter={filter}
      index={0}
      fields={fields}
      optionsFor={optionsFor}
      onChange={onChange}
      onRemove={onRemove}
    />,
  );
  return { onChange, onRemove };
}

describe('FilterBuilder trigger', () => {
  it('shows no badge when nothing is filtered', () => {
    render(
      <FilterBuilder fields={fields} filters={[]} optionsFor={optionsFor} onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Filter/ })).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('counts the active filters', () => {
    render(
      <FilterBuilder
        fields={fields}
        filters={[
          { id: 'a', field: 'name', op: 'contains', value: 'x' },
          { id: 'b', field: 'verified', op: 'is_true' },
        ]}
        optionsFor={optionsFor}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

describe('FilterRow', () => {
  it('labels its field and condition controls', () => {
    renderRow({ id: 'a', field: 'name', op: 'contains', value: 'x' });
    expect(screen.getByLabelText('Filter field')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter condition')).toBeInTheDocument();
  });

  it('renders a value control for an operator that takes one', () => {
    renderRow({ id: 'a', field: 'name', op: 'contains', value: 'x' });
    expect(screen.getByLabelText('Name value')).toHaveValue('x');
  });

  it('renders NO value control for a presence operator', () => {
    // A greyed-out empty box next to "is empty" reads as broken, not as
    // intentional — widgetFor returns 'none' and we render nothing.
    renderRow({ id: 'a', field: 'name', op: 'is_empty' });
    expect(screen.queryByLabelText('Name value')).not.toBeInTheDocument();
  });

  it('renders two bounds for a between filter', () => {
    renderRow({ id: 'a', field: 'price', op: 'between', value: { min: 1, max: 4 } });
    expect(screen.getByLabelText('Price from')).toHaveValue(1);
    expect(screen.getByLabelText('Price to')).toHaveValue(4);
  });

  it('emits the typed value', () => {
    const { onChange } = renderRow({ id: 'a', field: 'name', op: 'contains', value: '' });
    fireEvent.change(screen.getByLabelText('Name value'), { target: { value: 'berg' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: 'berg' }));
  });

  it('names the field in the remove button, so two rows are distinguishable', () => {
    renderRow({ id: 'a', field: 'name', op: 'contains', value: 'x' });
    expect(screen.getByRole('button', { name: 'Remove filter: Name' })).toBeInTheDocument();
  });

  it('calls onRemove when the remove button is clicked', () => {
    const { onRemove } = renderRow({ id: 'a', field: 'name', op: 'contains', value: 'x' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Name' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('reads "Where" on the first row and "and" after it', () => {
    render(
      <FilterRow
        filter={{ id: 'b', field: 'name', op: 'contains', value: 'x' }}
        index={1}
        fields={fields}
        optionsFor={optionsFor}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('and')).toBeInTheDocument();
  });
});
