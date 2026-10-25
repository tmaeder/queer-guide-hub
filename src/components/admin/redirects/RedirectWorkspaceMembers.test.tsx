import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectWorkspaceMembers } from './RedirectWorkspaceMembers';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), userId: 'owner-a' }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
const member = { id: 'member', label: 'Sam', kind: 'user', role: 'member', active: true };
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RedirectWorkspaceMembers />
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = 'owner-a';
  mocks.invoke.mockImplementation(async (_path, options) => ({
    data: options.method === 'GET' ? { data: [member], count: 1 } : { id: 'member' },
    error: null,
  }));
});
describe('workspace membership editor', () => {
  it('requires separate Owner removal before member-role/status controls', async () => {
    mocks.invoke.mockImplementation(async (_path, options) => ({
      data:
        options.method === 'GET' ? { data: [{ ...member, isWorkspaceOwner: true }], count: 1 } : {},
      error: null,
    }));
    const view = show();
    expect(await screen.findByLabelText('Role for Sam')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(screen.getByText(/Remove explicit Owner access in Workspace Owners/)).toBeVisible();
    view.unmount();
  });
  it('lets an owner assign the Billing role to an existing teammate', async () => {
    show();
    fireEvent.change(await screen.findByLabelText('Role for Sam'), {
      target: { value: 'billing' },
    });
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith('redirect-api/members/member', {
        method: 'PATCH',
        body: { role: 'billing' },
      }),
    );
  });
  it('requires a second explicit action before deleting membership and credentials', async () => {
    show();
    await screen.findByText('Sam');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.invoke.mock.calls.every(([, options]) => options.method !== 'DELETE')).toBe(true);
    expect(screen.getByText(/all bound API credentials/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith('redirect-api/members/member', {
        method: 'DELETE',
      }),
    );
  });
  it('can create a machine identity without an account identifier', async () => {
    show();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Campaign worker' } });
    fireEvent.change(screen.getByLabelText('Identity'), { target: { value: 'machine' } });
    expect(screen.queryByLabelText('Account UUID')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith('redirect-api/members', {
        method: 'POST',
        body: { label: 'Campaign worker', kind: 'machine', role: 'member' },
      }),
    );
  });
  it('hides previous member rows after a denied refresh', async () => {
    const { client } = show();
    await screen.findByText('Sam');
    mocks.invoke.mockResolvedValue({ data: { error: 'Current owner required' }, error: null });
    await client.invalidateQueries({ queryKey: ['redirect-workspace-members'] });
    await screen.findByText('Current owner required');
    expect(screen.queryByText('Sam')).toBeNull();
  });
  it('remounts drafts by account and ignores an old mutation completion', async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.invoke.mockImplementation(async (_path, options) =>
      options.method === 'POST'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { data: { data: [member], count: 1 }, error: null },
    );
    const { client, rerender } = show();
    await screen.findByText('Sam');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Old draft' } });
    fireEvent.change(screen.getByLabelText('Identity'), { target: { value: 'machine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    await waitFor(() =>
      expect(mocks.invoke.mock.calls.some(([, options]) => options.method === 'POST')).toBe(true),
    );
    mocks.userId = 'owner-b';
    rerender(
      <QueryClientProvider client={client}>
        <RedirectWorkspaceMembers />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText('Name')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New account draft' } });
    finish({ data: { id: 'created-old' }, error: null });
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('New account draft'));
    expect(client.getQueryData(['redirect-workspace-members', 'owner-a'])).toBeUndefined();
  });
});
