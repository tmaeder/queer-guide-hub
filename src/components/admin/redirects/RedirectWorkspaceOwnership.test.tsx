import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectWorkspaceOwnership } from './RedirectWorkspaceOwnership';
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  scoped: vi.fn(),
  legacy: false,
  admitted: false,
  denied: false,
  conflict: false,
}));
const workspace = '10000000-0000-4000-8000-000000000001',
  actor = '10000000-0000-4000-8000-000000000002',
  target = '10000000-0000-4000-8000-000000000003',
  member = '10000000-0000-4000-8000-000000000004',
  version = '10000000-0000-4000-8000-000000000005';
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '10000000-0000-4000-8000-000000000002' } }),
}));
vi.mock('@/lib/redirects/memberApi', () => ({
  createWorkspaceRedirectApi: (id: string) => {
    mocks.scoped(id);
    return mocks.api;
  },
}));
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RedirectWorkspaceOwnership workspaceId={workspace} />
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.legacy = false;
  mocks.admitted = false;
  mocks.denied = false;
  mocks.conflict = false;
  mocks.api.mockImplementation(async (path: string, method = 'GET') => {
    if (mocks.denied) throw new Error('Current Owner access required');
    if (method === 'POST') {
      if (mocks.conflict) throw new Error('Member role changed; review again');
      mocks.admitted = true;
      return { userId: target, version };
    }
    if (method === 'DELETE') {
      mocks.admitted = false;
      return { userId: target, removed: true, remainingOwners: 1 };
    }
    const candidates =
      new URL('https://fixture.invalid' + path).searchParams.get('view') === 'candidates';
    return {
      legacy: mocks.legacy,
      workspace: {
        id: workspace,
        name: 'Community team',
        slug: 'community-team',
        status: 'provisioning',
      },
      data: candidates
        ? [
            ...(!mocks.admitted
              ? [{ memberId: member, userId: target, label: 'Sam', role: 'viewer', verified: true }]
              : []),
            {
              memberId: 'unverified-member',
              userId: 'unverified-user',
              label: 'Unverified teammate',
              role: 'member',
              verified: false,
            },
          ]
        : [
            {
              userId: actor,
              label: 'Creator',
              memberRole: null,
              grantedAt: null,
              version,
              canRemove: mocks.admitted,
            },
            ...(mocks.admitted
              ? [
                  {
                    userId: target,
                    label: 'Sam',
                    memberRole: 'viewer',
                    grantedAt: null,
                    version,
                    canRemove: true,
                  },
                ]
              : []),
          ],
      count: candidates ? 2 : mocks.admitted ? 2 : 1,
      nextCursor: null,
    };
  });
});
describe('workspace Owner review', () => {
  it('reviews the exact account/workspace before granting and confirms versioned removal', async () => {
    const view = show();
    const candidate = await screen.findByText('Sam · viewer');
    fireEvent.click(
      within(candidate.closest('li')!).getByRole('button', { name: 'Review Owner access' }),
    );
    expect(screen.getByRole('group', { name: 'Review Owner change' })).toHaveTextContent(
      'Community team',
    );
    expect(screen.getByRole('group', { name: 'Review Owner change' })).toHaveTextContent(target);
    expect(mocks.api.mock.calls.some((call) => call[1] === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Owner access' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/workspace-ownership', 'POST', {
        memberId: member,
        expectedRole: 'viewer',
      }),
    );
    const owner = await screen.findByText('Sam');
    fireEvent.click(
      within(owner.closest('li')!).getByRole('button', { name: 'Remove Owner access' }),
    );
    expect(screen.getByRole('group', { name: 'Review Owner change' })).toHaveTextContent(
      'existing viewer membership',
    );
    expect(mocks.api.mock.calls.some((call) => call[1] === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Owner removal' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/workspace-ownership/' + target, 'DELETE', {
        version,
      }),
    );
    expect(mocks.scoped).toHaveBeenCalledWith(workspace);
    view.unmount();
  });
  it('disables last-Owner removal and unverified admission', async () => {
    const view = show();
    await screen.findByText('Creator (you)');
    expect(screen.getByRole('button', { name: 'Remove Owner access' })).toBeDisabled();
    const unverified = await screen.findByText('Unverified teammate · member');
    expect(
      within(unverified.closest('li')!).getByRole('button', { name: 'Review Owner access' }),
    ).toBeDisabled();
    view.unmount();
  });
  it('keeps legacy Owner administration in application user roles', async () => {
    mocks.legacy = true;
    const view = show();
    expect(await screen.findByRole('link', { name: 'Users & roles' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.queryByRole('button', { name: 'Remove Owner access' })).not.toBeInTheDocument();
    expect(mocks.api.mock.calls.some((call) => call[0].includes('view=candidates'))).toBe(false);
    view.unmount();
  });
  it('closes stale reviews after a conflict without retrying the grant automatically', async () => {
    mocks.conflict = true;
    const view = show();
    const candidate = await screen.findByText('Sam · viewer');
    fireEvent.click(
      within(candidate.closest('li')!).getByRole('button', { name: 'Review Owner access' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Owner access' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Member role changed');
    expect(screen.queryByRole('group', { name: 'Review Owner change' })).not.toBeInTheDocument();
    expect(mocks.api.mock.calls.filter((call) => call[1] === 'POST')).toHaveLength(1);
    view.unmount();
  });
  it('hides cached Owner/candidate metadata and an open review after access loss', async () => {
    const view = show();
    const candidate = await screen.findByText('Sam · viewer');
    fireEvent.click(
      within(candidate.closest('li')!).getByRole('button', { name: 'Review Owner access' }),
    );
    mocks.denied = true;
    await act(async () => {
      await view.client.invalidateQueries({ queryKey: ['redirect-workspace-ownership'] });
    });
    await waitFor(() => expect(screen.queryByText('Creator (you)')).not.toBeInTheDocument());
    expect(screen.queryByText('Sam · viewer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Owner access' })).not.toBeInTheDocument();
    view.unmount();
  });
});
