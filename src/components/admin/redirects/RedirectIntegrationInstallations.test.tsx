import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectIntegrationInstallations } from './RedirectIntegrationInstallations';
import type { RedirectWorkspaceRole } from '@/lib/redirects/roles';
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  role: 'member' as string,
  denied: false,
  uncertain: false,
  beforeCommit: false,
  created: false,
  revoked: false,
}));
vi.mock('@/lib/redirects/memberApi', () => ({ memberRedirectApi: mocks.api }));
const id = '10000000-0000-4000-8000-000000000001',
  link = '10000000-0000-4000-8000-000000000002';
const secret = 'qg_redirect_' + 'a'.repeat(64);
const installation = () => ({
  id,
  provider: 'segment',
  name: 'Campaign adapter',
  createdAt: '2026-10-25T12:00:00Z',
  expiresAt: '2027-01-23T12:00:00Z',
  credentialPrefix: 'qg_redirect_12345678',
  credentialLastUsedAt: null,
  linkCount: 1,
  status: mocks.revoked ? 'revoked' : 'configured',
  canRevoke: !mocks.revoked,
});
function show(role: RedirectWorkspaceRole = 'member') {
  mocks.role = role;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RedirectIntegrationInstallations userId="account" workspaceRole={role} />
      </QueryClientProvider>,
    ),
  };
}
async function configure() {
  fireEvent.click(await screen.findByRole('button', { name: 'Configure conversion adapter' }));
  fireEvent.change(screen.getByLabelText('Setup name'), { target: { value: 'Campaign adapter' } });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'https://queer.guide/go/editable' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create conversion credential' }));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied = false;
  mocks.uncertain = false;
  mocks.beforeCommit = false;
  mocks.created = false;
  mocks.revoked = false;
  mocks.api.mockImplementation(async (path: string, method = 'GET') => {
    if (mocks.denied) throw new Error('Current workspace access denied');
    if (path === '/session') return { role: mocks.role, label: 'Fixture member' };
    if (path.startsWith('/links?'))
      return {
        data: [
          { id: link, shortUrl: 'https://queer.guide/go/editable', canEdit: true },
          { id: 'denied', shortUrl: 'https://queer.guide/go/view-only', canEdit: false },
        ],
        count: 2,
        nextCursor: null,
      };
    if (path === '/integrations' && method === 'POST') {
      if (mocks.beforeCommit) {
        mocks.beforeCommit = false;
        throw new Error('Request outcome unknown');
      }
      const replay = mocks.created;
      mocks.created = true;
      if (mocks.uncertain) {
        mocks.uncertain = false;
        throw new Error('Response lost');
      }
      return { created: !replay, installation: installation(), credential: replay ? null : secret };
    }
    if (path === '/integrations/' + id && method === 'DELETE') {
      mocks.revoked = true;
      return installation();
    }
    if (path.startsWith('/integrations?requestId='))
      return { installation: mocks.created ? installation() : null };
    if (path.startsWith('/integrations?'))
      return {
        data: mocks.created ? [installation()] : [],
        count: mocks.created ? 1 : 0,
        nextCursor: null,
      };
    throw new Error('Unexpected fixture request ' + path);
  });
});
describe('member conversion adapter setup', () => {
  it('limits the picker to editable links, shows the key once and requires explicit revocation', async () => {
    const view = show();
    await configure();
    expect(screen.queryByText('https://queer.guide/go/view-only')).not.toBeInTheDocument();
    expect(await screen.findByLabelText('One-time server credential')).toHaveValue(secret);
    const create = mocks.api.mock.calls.find(
      (call) => call[0] === '/integrations' && call[1] === 'POST',
    )![2];
    expect(create).toMatchObject({
      provider: 'segment',
      name: 'Campaign adapter',
      linkIds: [link],
    });
    expect(create.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(Date.parse(create.expiresAt) - Date.now()).toBeGreaterThan(89 * 86400000);
    expect(
      JSON.stringify(
        view.client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain(secret);
    fireEvent.click(screen.getByRole('button', { name: 'Hide key' }));
    expect(screen.queryByLabelText('One-time server credential')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke credential' }));
    expect(mocks.api.mock.calls.some((call) => call[1] === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('/integrations/' + id, 'DELETE'));
    expect(await screen.findByText(/Integration credential revoked/)).toBeVisible();
    view.unmount();
  });
  it('retries an unknown response with the same request and never invents a recovered key', async () => {
    mocks.uncertain = true;
    const view = show();
    await configure();
    expect(await screen.findByRole('alert')).toHaveTextContent('Response lost');
    expect(screen.getByLabelText('Setup name')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry same setup' }));
    expect(await screen.findByText(/This setup was already created/)).toBeVisible();
    const calls = mocks.api.mock.calls.filter(
      (call) => call[0] === '/integrations' && call[1] === 'POST',
    );
    expect(calls).toHaveLength(2);
    expect(calls[0][2]).toEqual(calls[1][2]);
    expect(screen.queryByLabelText('One-time server credential')).not.toBeInTheDocument();
    view.unmount();
  });
  it('retains the request ID when lookup has no committed receipt yet', async () => {
    mocks.beforeCommit = true;
    const view = show();
    await configure();
    expect(await screen.findByRole('alert')).toHaveTextContent('Request outcome unknown');
    fireEvent.click(screen.getByRole('button', { name: 'Check setup status' }));
    expect(await screen.findByText(/No committed setup was found/)).toBeVisible();
    expect(screen.getByLabelText('Setup name')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry same setup' }));
    expect(await screen.findByLabelText('One-time server credential')).toHaveValue(secret);
    const calls = mocks.api.mock.calls.filter(
      (call) => call[0] === '/integrations' && call[1] === 'POST',
    );
    expect(calls).toHaveLength(2);
    expect(calls[0][2]).toEqual(calls[1][2]);
    view.unmount();
  });
  it.each(['viewer', 'billing'] as const)('keeps %s setup information read-only', async (role) => {
    mocks.created = true;
    const view = show(role);
    expect(await screen.findByText('Campaign adapter · Segment')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Configure conversion adapter' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke credential' })).not.toBeInTheDocument();
    expect(mocks.api.mock.calls.some((call) => call[0].startsWith('/links?'))).toBe(false);
    view.unmount();
  });
  it('hides the key and previous rows when current access refresh is denied', async () => {
    const view = show();
    await configure();
    expect(await screen.findByLabelText('One-time server credential')).toHaveValue(secret);
    mocks.denied = true;
    await act(async () => {
      await view.client.invalidateQueries({ queryKey: ['redirect-member', 'account'] });
    });
    await waitFor(() =>
      expect(screen.queryByLabelText('One-time server credential')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Campaign adapter · Segment')).not.toBeInTheDocument();
    view.unmount();
  });
});
