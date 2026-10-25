import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AskRedirectEdit, RedirectAccessRequests } from './RedirectAccessRequests';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), changed: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
const request = {
  id: 'request',
  folder_id: 'folder',
  folder_name: 'Campaigns',
  member_label: 'Sam',
  member_role: 'member',
  member_active: true,
  status: 'pending',
  message: 'Please let me update the poster campaign.',
  created_at: '2026-10-14T00:00:00Z',
};
function show(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.changed.mockResolvedValue(undefined);
  mocks.invoke.mockImplementation(async (_path, options) => ({
    data:
      options.method === 'GET'
        ? { data: [request], count: 1, nextCursor: null }
        : { ...request, status: 'approved' },
    error: null,
  }));
});
describe('folder access request controls', () => {
  it('sends a message for the current folder and reports the saved request', async () => {
    show(
      <AskRedirectEdit
        folderId="folder"
        folderName="Campaigns"
        userId="account"
        viewer={false}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Message (optional)'), {
      target: { value: 'Please review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send edit request' }));
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'redirect-api/access-requests',
        expect.objectContaining({
          method: 'POST',
          body: { folderId: 'folder', message: 'Please review' },
        }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Request saved for review');
  });
  it('requires an explicit grant choice and confirmation before approving', async () => {
    show(<RedirectAccessRequests userId="owner" initialView="review" onChanged={mocks.changed} />);
    await screen.findByText('Campaigns');
    fireEvent.click(screen.getByRole('button', { name: 'Approve request' }));
    expect(mocks.invoke.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    fireEvent.change(screen.getByLabelText('Grant folder permission'), {
      target: { value: 'owner' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'redirect-api/access-requests/request',
        expect.objectContaining({
          method: 'PATCH',
          body: { action: 'approve', permission: 'owner' },
        }),
      ),
    );
    await waitFor(() => expect(mocks.changed).toHaveBeenCalled());
  });
  it.each(['viewer', 'billing'])(
    'explains the %s cap and leaves approval disabled',
    async (role) => {
      mocks.invoke.mockResolvedValue({
        data: { data: [{ ...request, member_role: role }], count: 1, nextCursor: null },
        error: null,
      });
      show(
        <RedirectAccessRequests userId="owner" initialView="review" onChanged={mocks.changed} />,
      );
      expect(await screen.findByRole('button', { name: 'Approve request' })).toBeDisabled();
      expect(screen.getByText(/activate or upgrade/)).toBeVisible();
    },
  );
  it('preserves the confirmation and shows current-ownership rejection', async () => {
    const base = mocks.invoke.getMockImplementation()!;
    mocks.invoke.mockImplementation(async (path, options) =>
      options.method === 'PATCH'
        ? { data: { error: 'Folder owner access is required' }, error: null }
        : base(path, options),
    );
    show(<RedirectAccessRequests userId="owner" initialView="review" onChanged={mocks.changed} />);
    await screen.findByText('Campaigns');
    fireEvent.click(screen.getByRole('button', { name: 'Deny request' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm denial' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Folder owner access is required');
    expect(screen.getByRole('button', { name: 'Confirm denial' })).toBeEnabled();
    expect(mocks.changed).not.toHaveBeenCalled();
  });
});
