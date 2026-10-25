import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectOtherInventory } from './RedirectOtherInventory';
import { concreteInventorySource } from './inventorySource';
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  denied: false,
  conflict: false,
  version: '10000000-0000-4000-8000-000000000001',
  comment: 'Initial note',
  canEdit: true,
}));
vi.mock('@/lib/redirects/memberApi', () => ({ memberRedirectApi: mocks.api }));
vi.mock('@/components/admin/redirects/RedirectQrDialog', () => ({
  RedirectQrDialog: ({ url }: { url: string }) => <div role="dialog">QR source {url}</div>,
}));
const row = {
  id: 'venue_slug_redirects:old',
  rowId: 'venue_slug_redirects:old',
  source: '/venues/old',
  target: '/venues/current',
  origin: 'venue_slug_redirects',
  kind: 'Automatic' as const,
  statusCode: 301,
  state: 'Enabled' as const,
  updatedAt: null,
  folderId: null,
  tagIds: [],
  isArchived: false,
};
const resources = {
  folders: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Campaign',
      description: '',
      canEdit: true,
      canManage: false,
    },
  ],
  tags: [{ id: '30000000-0000-4000-8000-000000000001', name: 'Pride', color: 'pink' }],
  templates: [],
};
function show(readOnly = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const prefill = vi.fn();
  return {
    client,
    prefill,
    ...render(
      <QueryClientProvider client={client}>
        <RedirectOtherInventory
          userId="account"
          filters={{ search: '', isArchived: false }}
          resources={resources}
          onPrefill={prefill}
          readOnly={readOnly}
        />
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied = false;
  mocks.conflict = false;
  mocks.canEdit = true;
  mocks.version = '10000000-0000-4000-8000-000000000001';
  mocks.comment = 'Initial note';
  mocks.api.mockImplementation(async (path, _method, body) => {
    if (mocks.denied) throw new Error('Inventory access required');
    if (path.startsWith('/inventory/metadata'))
      return {
        ...row,
        comment: mocks.comment,
        metadataVersion: mocks.version,
        canEditMetadata: mocks.canEdit,
      };
    if (path === '/inventory/organization') {
      if (mocks.conflict) throw new Error('Inventory metadata changed');
      mocks.comment = body[0].values.comment ?? mocks.comment;
      mocks.version = '10000000-0000-4000-8000-000000000002';
      return { data: [] };
    }
    return {
      data: [
        {
          ...row,
          comment: mocks.comment,
          metadataVersion: mocks.version,
          canEditMetadata: mocks.canEdit,
        },
      ],
      count: 1,
      nextCursor: null,
    };
  });
});
describe('all-source workspace inventory', () => {
  it('lists real source definitions, opens source QR and prefills a managed link without changing routing', async () => {
    const view = show();
    await screen.findByText('/venues/old');
    fireEvent.click(screen.getByRole('button', { name: 'Create tracked link' }));
    expect(view.prefill).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id }),
      '/venues/current',
    );
    fireEvent.click(screen.getByRole('button', { name: 'QR' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('https://queer.guide/venues/old');
    expect(mocks.api.mock.calls.every(([, method]) => !method || method === 'GET')).toBe(true);
  });
  it('prefills metadata and saves its original version with organization fields only', async () => {
    show();
    await screen.findByText('/venues/old');
    fireEvent.click(screen.getByRole('button', { name: 'Organize' }));
    await screen.findByLabelText('Workspace comment');
    expect(screen.getByLabelText('Workspace comment')).toHaveValue('Initial note');
    fireEvent.change(screen.getByLabelText('Workspace comment'), {
      target: { value: 'Draft note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/inventory/organization', 'POST', [
        {
          id: row.id,
          version: '10000000-0000-4000-8000-000000000001',
          values: { comment: 'Draft note', folderId: null, tagIds: [], isArchived: false },
        },
      ]),
    );
  });
  it('retains a conflicted draft until an explicit reload', async () => {
    show();
    await screen.findByText('/venues/old');
    fireEvent.click(screen.getByRole('button', { name: 'Organize' }));
    await screen.findByLabelText('Workspace comment');
    fireEvent.change(screen.getByLabelText('Workspace comment'), {
      target: { value: 'Unsaved draft' },
    });
    mocks.conflict = true;
    fireEvent.click(screen.getByRole('button', { name: 'Save organization' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Workspace comment')).toHaveValue('Unsaved draft');
    expect(screen.getByRole('button', { name: 'Save organization' })).toBeDisabled();
    mocks.conflict = false;
    mocks.version = '10000000-0000-4000-8000-000000000002';
    mocks.comment = 'Latest note';
    fireEvent.click(screen.getByRole('button', { name: 'Reload settings' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Workspace comment')).toHaveValue('Latest note'),
    );
  });
  it('hides formerly loaded metadata on a denied refresh and enforces viewer controls', async () => {
    mocks.canEdit = false;
    const view = show();
    await screen.findByText('/venues/old');
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View organization' }));
    await screen.findByLabelText('Workspace comment');
    expect(screen.getByLabelText('Workspace comment')).toBeDisabled();
    mocks.denied = true;
    await act(async () => {
      await view.client.invalidateQueries({ queryKey: ['redirect-member', 'account'] });
    });
    await waitFor(() => expect(screen.queryByLabelText('Workspace comment')).toBeNull());
    expect(screen.queryByText('/venues/current')).toBeNull();
  });
  it('caps stale source capabilities when the current workspace role is read only', async () => {
    mocks.canEdit = true;
    show(true);
    await screen.findByText('/venues/old');
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create tracked link' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View organization' }));
    expect(await screen.findByLabelText('Workspace comment')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save organization' })).toBeNull();
  });
  it('sends versioned bulk organization and clears selection when changing source kind', async () => {
    show();
    await screen.findByText('/venues/old');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select source /venues/old' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive selected sources' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/inventory/organization', 'POST', [
        {
          id: row.id,
          version: '10000000-0000-4000-8000-000000000001',
          values: { isArchived: true },
        },
      ]),
    );
    await waitFor(() => expect(screen.queryByText('1 selected source records')).toBeNull());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select source /venues/old' }));
    fireEvent.change(screen.getByLabelText('Source kind'), { target: { value: 'Static' } });
    expect(screen.queryByText('1 selected source records')).toBeNull();
  });
  it('reports a bulk conflict and never retries the mutation automatically', async () => {
    mocks.conflict = true;
    show();
    await screen.findByText('/venues/old');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select source /venues/old' }));
    fireEvent.change(screen.getByLabelText('Source tag'), {
      target: { value: resources.tags[0].id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add tag to sources' }));
    await screen.findByRole('alert');
    expect(mocks.api.mock.calls.filter(([path]) => path === '/inventory/organization')).toEqual([
      [
        '/inventory/organization',
        'POST',
        [{ id: row.id, version: mocks.version, values: { tagIds: [resources.tags[0].id] } }],
      ],
    ]);
  });
  it('does not manufacture concrete URLs for patterns, reservations or regex rules', () => {
    expect(concreteInventorySource({ ...row, source: '/trips/:tripId' })).toBeNull();
    expect(concreteInventorySource({ ...row, source: '@old-account' })).toBeNull();
    expect(
      concreteInventorySource({ ...row, kind: 'Manual', source: '/legacy/*', matchKind: 'PREFIX' }),
    ).toBeNull();
    expect(concreteInventorySource({ ...row, source: '/me' })).toBe('https://queer.guide/me');
  });
});
