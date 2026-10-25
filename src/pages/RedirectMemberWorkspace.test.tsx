import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberWorkspaceContent } from './RedirectMemberWorkspace';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), role: 'member', canEdit: true }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'account' }, loading: false }),
}));
const row = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'pride',
  target: 'https://example.com/register',
  shortUrl: 'https://queer.guide/go/pride',
  folderId: null,
  tagIds: ['tag'],
  comment: 'Shared note',
  isEnabled: true,
  isArchived: false,
  clicks: 3,
  canEdit: true,
  statusCode: 302,
  queryMode: 'PRESERVE',
  utmDefaults: { utm_source: 'poster' },
  expiresAt: null,
  updatedAt: '2026-10-14T00:00:00Z',
};
function RouteProbe() {
  const location = useLocation(),
    navigate = useNavigate();
  return (
    <>
      <p data-testid="view-query">{location.search}</p>
      <button onClick={() => navigate(-1)}>Fixture back</button>
      <button onClick={() => navigate(1)}>Fixture forward</button>
    </>
  );
}
function show(
  userId = 'account',
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
  entries: string[] = ['/links-workspace'],
) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={entries}>
          <RouteProbe />
          <MemberWorkspaceContent key={userId} userId={userId} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = 'member';
  mocks.canEdit = true;
  mocks.invoke.mockImplementation(async (path, options) => {
    if (path.includes('/linked-domains'))
      return {
        data: { data: [], count: 0, builtinCount: 1, nextCursor: null, revision: 'fixture' },
        error: null,
      };
    if (path.includes('/domain-choices'))
      return {
        data: {
          data: [],
          count: 0,
          nextCursor: null,
          primaryDomainId: null,
          primaryUnavailable: false,
        },
        error: null,
      };
    if (path === 'redirect-api/session') return { data: { role: mocks.role }, error: null };
    if (path.includes('/folders?'))
      return {
        data: {
          data: [{ id: 'folder', name: 'Campaign', canEdit: true, canManage: true }],
          nextCursor: null,
        },
        error: null,
      };
    if (path.includes('/tags?'))
      return {
        data: { data: [{ id: 'tag', name: 'Pride', color: 'pink' }], nextCursor: null },
        error: null,
      };
    if (path.includes('/templates?'))
      return {
        data: {
          data: [
            {
              id: 'template',
              name: 'Email launch',
              parameters: { utm_source: 'email', utm_campaign: 'launch' },
            },
          ],
          nextCursor: null,
        },
        error: null,
      };
    if (path.includes('/inventory?'))
      return { data: { data: [], count: 0, nextCursor: null }, error: null };
    if (path.includes('/links?'))
      return {
        data: { data: [{ ...row, canEdit: mocks.canEdit }], count: 1, nextCursor: null },
        error: null,
      };
    if (path.endsWith('/policy') && options.method === 'GET')
      return { data: { policy: { track_conversions: true }, hasPassword: false }, error: null };
    if (path.endsWith('/variants')) return { data: [], error: null };
    return { data: { id: row.id }, error: null };
  });
});
describe('member redirect workspace', () => {
  it('creates a managed domain homepage and keeps its custom namespace', async () => {
    const domain = '00000000-0000-4000-8000-000000000007';
    const original = mocks.invoke.getMockImplementation()!;
    mocks.invoke.mockImplementation(async (path, options) =>
      path.includes('/domain-choices')
        ? {
            data: {
              data: [{ id: domain, hostname: 'links.community.com' }],
              count: 1,
              nextCursor: null,
              primaryDomainId: domain,
              primaryUnavailable: false,
            },
            error: null,
          }
        : original(path, options),
    );
    show();
    await screen.findByText('/go/pride');
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(screen.getByLabelText('Short-link domain')).toHaveValue(domain));
    fireEvent.change(screen.getByLabelText('Destination'), {
      target: { value: 'https://example.org/home' },
    });
    fireEvent.click(screen.getByLabelText('Use domain homepage'));
    expect(screen.getByLabelText('Short path')).toBeDisabled();
    fireEvent.click(
      screen
        .getAllByRole('button', { name: 'Create link' })
        .find((button) => button.closest('form'))!,
    );
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'redirect-api/links',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ isDomainRoot: true, domainId: domain }),
        }),
      ),
    );
  });
  it('composes domain, search, folder and archive bookmarks and clears selection when changing namespace', async () => {
    const domain = '00000000-0000-4000-8000-000000000007';
    const initial = mocks.invoke.getMockImplementation()!;
    mocks.invoke.mockImplementation(async (path, options) =>
      path.includes('/linked-domains')
        ? {
            data: {
              data: [{ id: domain, hostname: 'lost.community.com', linkCount: 1 }],
              count: 1,
              builtinCount: 1,
              nextCursor: null,
              revision: 'rev',
            },
            error: null,
          }
        : initial(path, options),
    );
    show('account', undefined, [
      '/links-workspace?domain=' + domain + '&q=pride&folder=folder&archive=1',
    ]);
    await screen.findByText('/go/pride');
    expect(screen.getByLabelText('Domain filter')).toHaveValue(domain);
    fireEvent.click(screen.getByLabelText('Select /go/pride'));
    fireEvent.change(screen.getByLabelText('Domain filter'), { target: { value: 'builtin' } });
    await waitFor(() =>
      expect(
        mocks.invoke.mock.calls.some(
          ([path]) =>
            path.includes('/links?') &&
            JSON.parse(new URL(path, 'https://fixture.test').searchParams.get('filters')!)
              .domainId === null,
        ),
      ).toBe(true),
    );
    const query = screen.getByTestId('view-query').textContent!;
    expect(new URLSearchParams(query).get('domain')).toBe('builtin');
    expect(screen.getByLabelText('Search links')).toHaveValue('pride');
    expect(screen.getByLabelText('Folder filter')).toHaveValue('folder');
    expect(screen.getByLabelText('Show archived links')).toBeChecked();
    expect(await screen.findByLabelText('Select /go/pride')).not.toBeChecked();
  });
  it('clears transient selections on browser history navigation and retains a no-longer-visible selected domain', async () => {
    const domain = '00000000-0000-4000-8000-000000000007';
    show('account', undefined, [
      '/links-workspace?domain=builtin',
      '/links-workspace?domain=' + domain,
    ]);
    await screen.findByText('/go/pride');
    expect(screen.getByLabelText('Domain filter')).toHaveValue(domain);
    expect(
      screen.getByRole('option', { name: 'Selected domain (not in accessible list)' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Select /go/pride'));
    fireEvent.click(screen.getByRole('button', { name: 'Fixture back' }));
    expect(await screen.findByLabelText('Select /go/pride')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Fixture forward' }));
    expect(await screen.findByLabelText('Select /go/pride')).not.toBeChecked();
  });
  it('does not fall back to an unfiltered list for an invalid domain bookmark', async () => {
    show('account', undefined, ['/links-workspace?domain=invalid']);
    expect(
      await screen.findByText('Invalid domain filter. Choose a domain or all accessible domains.'),
    ).toBeVisible();
    expect(screen.queryByText('/go/pride')).toBeNull();
    expect(mocks.invoke.mock.calls.some(([path]) => path.includes('/links?'))).toBe(false);
  });

  it('retains an existing unavailable branded domain while repairing the destination', async () => {
    const initial = mocks.invoke.getMockImplementation()!;
    const domainId = '00000000-0000-4000-8000-000000000007';
    mocks.invoke.mockImplementation(async (path, options) =>
      path.includes('/links?')
        ? {
            data: {
              data: [
                {
                  ...row,
                  domainId,
                  domainHostname: 'links.community.com',
                  shortUrl: 'https://links.community.com/pride',
                },
              ],
              count: 1,
              nextCursor: null,
            },
            error: null,
          }
        : initial(path, options),
    );
    show();
    await screen.findByText('https://links.community.com/pride');
    fireEvent.click(screen.getByRole('button', { name: 'Edit https://links.community.com/pride' }));
    expect(screen.getByLabelText('Short-link domain')).toHaveValue(domainId);
    expect(
      screen.getByRole('option', { name: 'links.community.com (current)' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Destination'), {
      target: { value: 'https://example.org/repaired' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'redirect-api/links/' + row.id,
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ domainId, target: 'https://example.org/repaired' }),
        }),
      ),
    );
  });
  it.each(['viewer', 'billing'])(
    'lets %s read links while keeping mutation controls unavailable',
    async (role) => {
      mocks.role = role;
      // Cached link capabilities from an earlier role cannot override the current role.
      mocks.canEdit = true;
      show();
      await screen.findByText('/go/pride');
      expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Edit /go/pride' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Manage tags' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Link behavior' }));
      expect(
        await screen.findByText(
          'You can view these settings. Edit access is required to change them.',
        ),
      ).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Save link behavior' })).toBeNull();
      expect(screen.getByRole('checkbox', { name: 'Attribute leads and sales' })).toBeDisabled();
      expect(mocks.invoke.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    },
  );
  it('saves member policy changes through the scoped patch endpoint with explicit clearing', async () => {
    show();
    await screen.findByText('/go/pride');
    fireEvent.click(screen.getByRole('button', { name: 'Link behavior' }));
    const tracking = await screen.findByRole('checkbox', { name: 'Attribute leads and sales' });
    fireEvent.click(tracking);
    fireEvent.click(screen.getByRole('button', { name: 'Save link behavior' }));
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'redirect-api/links/' + row.id + '/policy',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({
            policy: expect.objectContaining({
              track_conversions: false,
              geo_targets: null,
              expires_at: null,
            }),
          }),
        }),
      ),
    );
    expect(mocks.invoke.mock.calls.some(([path]) => path === 'save-redirect-policy')).toBe(false);
  });
  it('allows folder editors to rename while retaining owner-only deletion and access controls', async () => {
    const base = mocks.invoke.getMockImplementation()!;
    mocks.invoke.mockImplementation(async (path, options) =>
      path.includes('/folders?')
        ? {
            data: {
              data: [
                {
                  id: 'folder',
                  name: 'Campaign',
                  canEdit: true,
                  canRename: true,
                  canManage: false,
                },
              ],
              nextCursor: null,
            },
            error: null,
          }
        : base(path, options),
    );
    show();
    await screen.findByText('/go/pride');
    fireEvent.change(screen.getByLabelText('Folder filter'), { target: { value: 'folder' } });
    expect(await screen.findByRole('button', { name: 'Rename folder' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Delete folder' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage folder access' })).toBeNull();
  });
  it('prefills a new link, applies shared UTM templates and leaves its slug for server allocation', async () => {
    show();
    await screen.findByText('/go/pride');
    fireEvent.click(screen.getByRole('button', { name: 'Create from link' }));
    expect(screen.getByLabelText('Destination')).toHaveValue(row.target);
    expect(screen.getByLabelText('Short path')).toHaveValue('');
    expect(screen.getByLabelText('utm_source')).toHaveValue('poster');
    expect(screen.getByRole('checkbox', { name: 'Pride' })).toBeChecked();
    fireEvent.change(screen.getByLabelText('Prefill campaign template'), {
      target: { value: 'template' },
    });
    expect(screen.getByLabelText('utm_source')).toHaveValue('email');
    await waitFor(() => expect(screen.getByLabelText('Short-link domain')).toBeEnabled());
    fireEvent.click(
      screen
        .getAllByRole('button', { name: 'Create link' })
        .find((b) => b.getAttribute('type') === 'submit')!,
    );
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'redirect-api/links',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            target: row.target,
            utmDefaults: { utm_source: 'email', utm_campaign: 'launch' },
            tagIds: ['tag'],
          }),
        }),
      ),
    );
    const call = mocks.invoke.mock.calls.find(
      ([path, options]) => path === 'redirect-api/links' && options.method === 'POST',
    );
    expect(call?.[1].body).not.toHaveProperty('slug');
  });
  it('does not issue a delete until confirmation and reports server permission denial', async () => {
    const initial = mocks.invoke.getMockImplementation()!;
    mocks.invoke.mockImplementation(async (path, options) =>
      path.endsWith('/links/bulk')
        ? { data: { error: 'Link is outside credential scope' }, error: null }
        : initial(path, options),
    );
    show();
    await screen.findByText('/go/pride');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select /go/pride' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    expect(mocks.invoke.mock.calls.some(([path]) => path.endsWith('/links/bulk'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm permanent deletion' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Link is outside credential scope');
    expect(screen.getByRole('checkbox', { name: 'Select /go/pride' })).toBeChecked();
  });
  it('does not show a previous account’s links while the next account is being verified', async () => {
    const view = show('first');
    await screen.findByText('/go/pride');
    mocks.invoke.mockImplementation(() => new Promise(() => {}));
    view.rerender(
      <QueryClientProvider client={view.client}>
        <MemoryRouter>
          <MemberWorkspaceContent key="second" userId="second" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByText('/go/pride')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Checking workspace access');
  });
});
