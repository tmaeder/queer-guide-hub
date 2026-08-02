/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertyManager } from '../filters/PropertyManager';
import type { FieldConfig } from '@/types/cms';

const f = (over: Partial<FieldConfig> & { name: string }): FieldConfig =>
  ({ label: over.name, type: 'text', group: 'basic', ...over }) as FieldConfig;

const fields: FieldConfig[] = [
  f({ name: 'name', label: 'Name' }),
  f({ name: 'category', label: 'Category', type: 'select' }),
  f({ name: 'city', label: 'City' }),
  // richtext is not displayable in a list cell.
  f({ name: 'description', label: 'Description', type: 'richtext' }),
];

function setup(columns: string[]) {
  const onChange = vi.fn();
  render(<PropertyManager fields={fields} columns={columns} onChange={onChange} />);
  return { onChange };
}

describe('choosing properties', () => {
  it('splits fields into shown and hidden', () => {
    setup(['name']);
    expect(screen.getByRole('switch', { name: 'Hide Name' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show Category' })).toBeInTheDocument();
  });

  it('never offers a field that cannot be rendered in a cell', () => {
    setup(['name']);
    expect(screen.queryByRole('switch', { name: 'Show Description' })).not.toBeInTheDocument();
  });

  it('appends a newly shown property rather than inserting it mid-table', () => {
    const { onChange } = setup(['name']);
    fireEvent.click(screen.getByRole('switch', { name: 'Show Category' }));
    expect(onChange).toHaveBeenCalledWith(['name', 'category']);
  });

  it('removes a hidden property from the order', () => {
    const { onChange } = setup(['name', 'category']);
    fireEvent.click(screen.getByRole('switch', { name: 'Hide Name' }));
    expect(onChange).toHaveBeenCalledWith(['category']);
  });

  it('shows all and hides all', () => {
    const { onChange } = setup(['name']);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    // Description is excluded — "all" means all DISPLAYABLE.
    expect(onChange).toHaveBeenCalledWith(['name', 'category', 'city']);

    fireEvent.click(screen.getByRole('button', { name: 'Hide all' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe('ordering', () => {
  it('moves a property down', () => {
    const { onChange } = setup(['name', 'category']);
    fireEvent.click(screen.getByRole('button', { name: 'Move Name down' }));
    expect(onChange).toHaveBeenCalledWith(['category', 'name']);
  });

  it('moves a property up', () => {
    const { onChange } = setup(['name', 'category']);
    fireEvent.click(screen.getByRole('button', { name: 'Move Category up' }));
    expect(onChange).toHaveBeenCalledWith(['category', 'name']);
  });

  it('disables the moves that would fall off the ends', () => {
    setup(['name', 'category']);
    expect(screen.getByRole('button', { name: 'Move Name up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Category down' })).toBeDisabled();
  });
});

describe('search', () => {
  it('filters the lists, because a type can declare ~55 fields', () => {
    setup(['name', 'category']);
    fireEvent.change(screen.getByLabelText('Find a property'), { target: { value: 'cat' } });
    expect(screen.getByRole('switch', { name: 'Hide Category' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Hide Name' })).not.toBeInTheDocument();
  });

  it('matches on the label, not the column name', () => {
    setup(['name']);
    fireEvent.change(screen.getByLabelText('Find a property'), { target: { value: 'Name' } });
    expect(screen.getByRole('switch', { name: 'Hide Name' })).toBeInTheDocument();
  });
});

describe('empty states', () => {
  it('says so when nothing is shown', () => {
    setup([]);
    expect(screen.getByText('No properties shown.')).toBeInTheDocument();
  });

  it('ignores a column naming a field that no longer exists', () => {
    // Config drift must not render a ghost row.
    setup(['name', 'deleted_field']);
    expect(screen.queryByText('deleted_field')).not.toBeInTheDocument();
  });
});
