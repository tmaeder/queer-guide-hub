/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedOption } from '@/hooks/useManagedOptions';
import type { FieldConfig } from '@/types/cms';
const state = vi.hoisted(() => ({
  browse: [] as ManagedOption[],
  options: [
    { value: 'root', label: 'Root', active: true },
    { value: 'self', label: 'Self', active: true },
  ],
  loading: false,
  error: null as string | null,
  retry: vi.fn(),
}));
vi.mock('@/hooks/useManagedOptions', async (original) => ({
  ...(await original<typeof import('@/hooks/useManagedOptions')>()),
  useManagedOptions: (source?: FieldConfig['dynamicOptions']) =>
    source?.table === 'taxonomy_terms' && source.filters?.taxonomy === 'marketplace_browse'
      ? {
          ...state,
          options: source.valuePrefix
            ? state.browse
                .filter((o) => o.value.startsWith(source.valuePrefix!))
                .map((o) => ({ ...o, value: o.value.slice(source.valuePrefix!.length) }))
            : state.browse,
        }
      : state,
}));
import { DynamicChoiceField } from '../DynamicChoiceField';
const field: FieldConfig = {
  name: 'parent_id',
  label: 'Parent',
  type: 'select',
  group: 'basic',
  dynamicOptions: { table: 'taxonomy_terms', valueColumn: 'id', labelColumn: 'name' },
};
beforeEach(() => {
  state.error = null;
  state.loading = false;
  state.retry.mockClear();
});
describe('managed vocabulary editor field', () => {
  it('allows clearing a parent as SQL null and excludes self-parenting', () => {
    const onChange = vi.fn();
    render(
      <DynamicChoiceField
        field={field}
        value="root"
        onChange={onChange}
        allValues={{ id: 'self', taxonomy: 'venue_category' }}
      />,
    );
    expect(screen.queryByRole('option', { name: 'Self' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
  it('shows a retry action and disables choice changes if the vocabulary cannot load', () => {
    state.error = 'Could not load choices.';
    render(<DynamicChoiceField field={field} value="root" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load choices.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.retry).toHaveBeenCalledOnce();
  });
});

describe('managed marketplace hierarchy', () => {
  const browseField = (name: string, valuePrefix: string): FieldConfig => ({
    ...field,
    name,
    dynamicOptions: {
      table: 'taxonomy_terms',
      valueColumn: 'value',
      labelColumn: 'name',
      filters: { taxonomy: 'marketplace_browse' },
      valuePrefix,
    },
  });
  beforeEach(() => {
    state.browse = [
      { value: 'department:open', label: 'Open', active: true, data: { id: 'd1' } },
      { value: 'department:closed', label: 'Closed', active: false, data: { id: 'd2' } },
      { value: 'group:shirts', label: 'Shirts', active: true, data: { id: 'g1', parent_id: 'd1' } },
      { value: 'group:other', label: 'Other', active: true, data: { id: 'g2', parent_id: 'd2' } },
      { value: 'fine:tee', label: 'Tee', active: true, data: { id: 'f1', parent_id: 'g1' } },
      {
        value: 'fine:other',
        label: 'Other fine',
        active: true,
        data: { id: 'f2', parent_id: 'g2' },
      },
    ];
  });
  it('hides groups with inactive ancestors and clears the fine type after a group change', () => {
    const onChange = vi.fn();
    const setFields = vi.fn();
    render(
      <DynamicChoiceField
        field={browseField('subcategory_group', 'group:')}
        value={null}
        onChange={onChange}
        setFields={setFields}
      />,
    );
    expect(screen.queryByRole('option', { name: 'Other' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'shirts' } });
    expect(onChange).toHaveBeenCalledWith('shirts');
    expect(setFields).toHaveBeenCalledWith({ subcategory_fine: null });
  });
  it('offers fine types from the selected group while keeping an existing historical selection', () => {
    render(
      <DynamicChoiceField
        field={browseField('subcategory_fine', 'fine:')}
        value="other"
        onChange={vi.fn()}
        allValues={{ subcategory_group: 'shirts' }}
      />,
    );
    expect(screen.getByRole('option', { name: 'Tee' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Other fine' })).toBeInTheDocument();
  });
});
