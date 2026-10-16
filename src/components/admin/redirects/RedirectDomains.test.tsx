import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectDomains } from './RedirectDomains';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/lib/redirects/memberApi', () => ({ memberRedirectApi: mocks.api }));
vi.mock('./RedirectPrimaryDomain', () => ({ RedirectPrimaryDomain: () => null }));
const domain = {
  id: 'domain',
  hostname: 'links.example.com',
  version: 'current-version',
  ownershipState: 'pending',
  ownershipVerified: false,
  providerConnected: false,
  disabled: false,
  archived: false,
  rootUrl: null,
  notFoundUrl: null,
  expiredUrl: null,
  verification: {
    type: 'TXT',
    name: '_qg-redirect.links.example.com',
    value: 'qg-redirect=fixture',
  },
};
function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RedirectDomains />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockImplementation(async (_path, method) =>
    method && method !== 'GET' ? domain : { data: [domain], count: 1, nextCursor: null },
  );
});
describe('domain registry setup', () => {
  it('shows honest setup state, exact DNS instructions and version-guarded DNS checks', async () => {
    show();
    fireEvent.click(await screen.findByText(/links.example.com · Awaiting DNS proof/));
    expect(screen.getByText('_qg-redirect.links.example.com')).toBeVisible();
    expect(screen.getByText('TLS and branded routing are not connected.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Check DNS ownership' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/domains/domain/verify', 'POST', {
        version: 'current-version',
      }),
    );
  });
  it('keeps an expanded setup panel open when a successful check changes its server version', async () => {
    let current = { ...domain };
    mocks.api.mockImplementation(async (_path, method) => {
      if (!method || method === 'GET') return { data: [current], count: 1, nextCursor: null };
      current = {
        ...current,
        version: 'verified-version',
        ownershipState: 'verified',
        ownershipVerified: true,
      };
      return current;
    });
    show();
    fireEvent.click(await screen.findByText(/links.example.com · Awaiting DNS proof/));
    await waitFor(() =>
      expect(
        screen.getByText(/links.example.com · Awaiting DNS proof/).closest('details'),
      ).toHaveAttribute('open'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check DNS ownership' }));
    const summary = await screen.findByText(/links.example.com · Ownership verified/);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getByLabelText('Root destination')).toBeVisible();
  });
  it('reviews archival separately from disabling and sends only the guarded archive change', async () => {
    show();
    fireEvent.click(await screen.findByText(/links.example.com · Awaiting DNS proof/));
    fireEvent.click(screen.getByRole('button', { name: /^Archive domain$/ }));
    expect(screen.getByRole('group', { name: 'Archive domain review' })).toHaveTextContent(
      'Existing links and the provider connection keep working',
    );
    expect(screen.getByRole('group', { name: 'Archive domain review' })).toHaveTextContent(
      'primary domain',
    );
    expect(mocks.api.mock.calls.some(([, method]) => method === 'PATCH')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm domain archive' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/domains/domain', 'PATCH', {
        archived: true,
        version: 'current-version',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Domain archived. Existing links and routing keep working.',
    );
  });
  it('searches and filters on the server, resets pagination and restores an archived domain explicitly', async () => {
    const older = { ...domain, id: 'older', hostname: 'older.example.com', archived: true };
    mocks.api.mockImplementation(async (path, method, body) => {
      if (method === 'PATCH') {
        Object.assign(older, body, { version: 'restored-version' });
        return older;
      }
      const query = new URL(path, 'https://fixture.test').searchParams;
      const archive = query.get('archive') ?? 'active';
      const rows = [domain, older].filter(
        (row) =>
          (archive === 'all' || !!row.archived === (archive === 'archived')) &&
          row.hostname.includes(query.get('q') ?? ''),
      );
      return { data: rows, count: rows.length, nextCursor: null };
    });
    show();
    await screen.findByText(/links.example.com · Awaiting DNS proof/);
    fireEvent.change(screen.getByLabelText('Domain status'), { target: { value: 'archived' } });
    const summary = await screen.findByText(/older.example.com · Archived/);
    expect(screen.queryByText(/links.example.com · Awaiting DNS proof/)).toBeNull();
    fireEvent.click(summary);
    fireEvent.click(screen.getByRole('button', { name: 'Restore domain' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/domains/older', 'PATCH', {
        archived: false,
        version: 'current-version',
      }),
    );
    expect(await screen.findByText('No archived domains.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Domain status'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Search domains'), { target: { value: 'older' } });
    fireEvent.click(screen.getByRole('button', { name: /^Search domains$/ }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        '/domains?limit=50&archive=all&q=older',
        'GET',
        undefined,
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText(/older.example.com · Awaiting DNS proof/)).toBeInTheDocument();
    expect(screen.queryByText(/links.example.com · Awaiting DNS proof/)).toBeNull();
  });
  it('stores domain defaults without publishing a working branded URL and confirms challenge replacement', async () => {
    show();
    fireEvent.click(await screen.findByText(/links.example.com · Awaiting DNS proof/));
    fireEvent.change(screen.getByLabelText('Root destination'), {
      target: { value: 'https://example.org/home' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save domain settings' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/domains/domain', 'PATCH', {
        rootUrl: 'https://example.org/home',
        notFoundUrl: null,
        expiredUrl: null,
        disabled: false,
        version: 'current-version',
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Replace ownership challenge' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Replace ownership challenge' }));
    expect(mocks.api.mock.calls.some(([path]) => path.endsWith('/rotate'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm challenge replacement' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/domains/domain/rotate', 'POST', {
        version: 'current-version',
      }),
    );
    expect(screen.queryByRole('link', { name: 'links.example.com' })).toBeNull();
  });
});
