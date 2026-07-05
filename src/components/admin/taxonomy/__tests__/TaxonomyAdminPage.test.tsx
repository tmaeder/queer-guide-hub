/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { TaxonomyAdminPage } from '../TaxonomyAdminPage';
import {
  buildEmptyForm,
  rowToForm,
  formToPayload,
  type TaxonomyField,
  type TaxonomyPageConfig,
  type TaxonomyRowBase,
} from '../taxonomyConfig';

vi.mock('@/hooks/useTaxonomyCRUD', () => ({
  useTaxonomyCRUD: () => ({ upsert: vi.fn(), remove: vi.fn() }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isAdmin: true }),
}));
vi.mock('@/components/admin/data-table/AdminDataTable', () => ({
  AdminDataTable: () => <div data-testid="admin-data-table" />,
}));

const fields: TaxonomyField[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, default: '' },
  { key: 'category', label: 'Category', type: 'text', default: '', nullWhenEmpty: true },
  { key: 'aliases', label: 'Aliases', type: 'aliases', default: '' },
  { key: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
  { key: 'is_active', label: 'Active', type: 'switch', default: true },
];

describe('taxonomy form helpers', () => {
  it('buildEmptyForm uses field defaults', () => {
    expect(buildEmptyForm(fields)).toEqual({
      name: '',
      category: '',
      aliases: '',
      sort_order: 0,
      is_active: true,
    });
  });

  it('rowToForm hydrates aliases as CSV and null-safe switches', () => {
    const form = rowToForm(fields, {
      name: 'DJ',
      category: null,
      aliases: ['deejay', 'Disc Jockey'],
      sort_order: null,
      is_active: null,
    });
    expect(form.aliases).toBe('deejay, Disc Jockey');
    expect(form.sort_order).toBe(0);
    expect(form.is_active).toBe(true);
    expect(form.category).toBe('');
  });

  it('formToPayload converts aliases CSV → trimmed lowercase array and nullWhenEmpty', () => {
    const payload = formToPayload(fields, {
      name: 'DJ',
      category: '  ',
      aliases: ' Deejay, , disc JOCKEY ',
      sort_order: 5,
      is_active: false,
    });
    expect(payload.aliases).toEqual(['deejay', 'disc jockey']);
    expect(payload.category).toBeNull();
    expect(payload.sort_order).toBe(5);
  });
});

describe('TaxonomyAdminPage', () => {
  it('renders', () => {
    interface Row extends TaxonomyRowBase {
      description: string | null;
    }
    const config: TaxonomyPageConfig<Row> = {
      table: 'event_types',
      title: 'Event Types',
      subtitle: 'Test',
      entityLabel: 'Event Type',
      toastNoun: 'Event type',
      select: 'id,name',
      fields,
    };
    const qc = new QueryClient();
    const { container } = render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <TaxonomyAdminPage config={config} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
