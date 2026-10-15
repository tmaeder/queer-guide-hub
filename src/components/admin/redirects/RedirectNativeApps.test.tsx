import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectNativeApps } from './RedirectNativeApps';
const base = {
  id: '10000000-0000-4000-8000-000000000001',
  domainId: null,
  hostname: 'queer.guide',
  label: 'Existing app',
  platform: 'ios' as const,
  appId: 'ABCDE12345.org.example.existing',
  appClipId: null as string | null,
  fingerprints: [] as string[],
  paths: ['/go/*'],
  enabled: false,
  version: '20000000-0000-4000-8000-000000000001',
  updatedAt: '2026-10-15T00:00:00Z',
};
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  user: { id: 'owner' },
  rows: [] as (typeof base)[],
  denied: false,
  conflict: false,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/useRedirectDomainChoices', () => ({
  useRedirectDomainChoices: () => ({
    query: { data: { data: [] }, isPending: false, isError: false },
    selected: '',
    domainId: null,
    valid: true,
    setSelected: vi.fn(),
  }),
}));
vi.mock('@/lib/redirects/memberApi', () => ({ memberRedirectApi: mocks.api }));
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={client}>
      <RedirectNativeApps />
    </QueryClientProvider>
  );
  return { client, tree, ...render(tree()) };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: 'owner' };
  mocks.rows = [{ ...base }];
  mocks.denied = false;
  mocks.conflict = false;
  mocks.api.mockImplementation(async (path, method, body) => {
    if (mocks.denied) throw new Error('Current workspace owner access required');
    if (path.startsWith('/apps?')) return { data: mocks.rows, count: mocks.rows.length };
    if (method === 'PATCH' && mocks.conflict) throw new Error('App binding changed');
    if (method === 'POST') {
      const saved = { ...base, ...body, id: '10000000-0000-4000-8000-000000000002' };
      mocks.rows = [...mocks.rows, saved];
      return saved;
    }
    if (method === 'PATCH') {
      const saved = { ...base, ...body, version: '20000000-0000-4000-8000-000000000002' };
      mocks.rows = [saved];
      return saved;
    }
    if (method === 'DELETE') {
      mocks.rows = [];
      return { deleted: true };
    }
  });
});
describe('native app registry', () => {
  it('registers a disabled app with explicit identity and short-link path scope', async () => {
    show();
    await screen.findByLabelText('App label');
    expect(
      screen.getByRole('checkbox', { name: 'Publish this app association' }),
    ).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('App label'), { target: { value: 'New app' } });
    fireEvent.change(screen.getByLabelText('iOS application identifier'), {
      target: { value: 'ABCDE12345.org.example.new' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Register app' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/apps', 'POST', {
        label: 'New app',
        platform: 'ios',
        appId: 'ABCDE12345.org.example.new',
        appClipId: null,
        domainId: null,
        fingerprints: [],
        paths: ['/go/*'],
        enabled: false,
      }),
    );
  });
  it('saves an explicit App Clip identity alongside its signed iOS parent', async () => {
    show();
    await screen.findByLabelText('App label');
    fireEvent.change(screen.getByLabelText('App label'), { target: { value: 'Clip app' } });
    fireEvent.change(screen.getByLabelText('iOS application identifier'), {
      target: { value: 'ABCDE12345.org.example.parent' },
    });
    fireEvent.change(screen.getByLabelText('App Clip application identifier (optional)'), {
      target: { value: 'ABCDE12345.org.example.parent.Clip' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Register app' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        '/apps',
        'POST',
        expect.objectContaining({
          appId: 'ABCDE12345.org.example.parent',
          appClipId: 'ABCDE12345.org.example.parent.Clip',
          enabled: false,
        }),
      ),
    );
  });
  it('requires Android release fingerprints and publishes only on explicit selection', async () => {
    show();
    await screen.findByLabelText('App label');
    fireEvent.change(screen.getByLabelText('App Clip application identifier (optional)'), {
      target: { value: 'ABCDE12345.org.example.parent.Clip' },
    });
    fireEvent.change(screen.getByLabelText('Platform'), { target: { value: 'android' } });
    expect(
      screen.queryByLabelText('App Clip application identifier (optional)'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('SHA-256 release signing fingerprints')).toBeRequired();
    fireEvent.change(screen.getByLabelText('App label'), { target: { value: 'Android app' } });
    fireEvent.change(screen.getByLabelText('Android package name'), {
      target: { value: 'org.example.android' },
    });
    fireEvent.change(screen.getByLabelText('SHA-256 release signing fingerprints'), {
      target: { value: 'a'.repeat(64) },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Publish this app association' }));
    fireEvent.click(screen.getByRole('button', { name: 'Register app' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        '/apps',
        'POST',
        expect.objectContaining({ enabled: true, appClipId: null, fingerprints: ['a'.repeat(64)] }),
      ),
    );
  });
  it('retains stale drafts and reloads an explicit current version before retry', async () => {
    show();
    await screen.findByRole('button', { name: 'Edit Existing app' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Existing app' }));
    fireEvent.change(screen.getByLabelText('App label'), { target: { value: 'Unsaved app' } });
    mocks.conflict = true;
    fireEvent.click(screen.getByRole('button', { name: 'Save app binding' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('App label')).toHaveValue('Unsaved app');
    expect(screen.getByRole('button', { name: 'Save app binding' })).toBeDisabled();
    mocks.rows = [
      { ...base, label: 'Latest app', version: '20000000-0000-4000-8000-000000000002' },
    ];
    fireEvent.click(screen.getByRole('button', { name: 'Reload app settings' }));
    await waitFor(() => expect(screen.getByLabelText('App label')).toHaveValue('Latest app'));
  });
  it('hides cached app fields after authority is denied on refresh', async () => {
    const view = show();
    await screen.findByText('Existing app · ios · Disabled');
    mocks.denied = true;
    await act(async () => {
      await view.client.invalidateQueries({ queryKey: ['redirect-native-apps', 'owner'] });
    });
    await waitFor(() => expect(screen.queryByLabelText('App label')).toBeNull());
    expect(screen.queryByText(base.appId)).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Current workspace owner');
  });
  it('confirms removal with the reviewed version', async () => {
    show();
    await screen.findByRole('button', { name: 'Remove Existing app' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Existing app' }));
    expect(mocks.api.mock.calls.some(([, method]) => method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm app removal' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/apps/' + base.id, 'DELETE', {
        version: base.version,
      }),
    );
  });
});
