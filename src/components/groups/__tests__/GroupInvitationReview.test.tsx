import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { GroupInvitationReview } from '../GroupInvitationReview';
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  user: { id: 'owner-a' } as { id: string } | null,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: { name?: string }) =>
      fallback.replace('{{name}}', values?.name ?? ''),
    i18n: { resolvedLanguage: 'en' },
  }),
}));
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <GroupInvitationReview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const invitation = {
  inviteId: 'fixture-invite',
  token: 'private/token?fixture',
  group: { name: 'A long community name '.repeat(12) },
};
beforeEach(() => {
  mocks.user = { id: 'owner-a' };
  mocks.invoke.mockReset();
});
it('lists an owned invitation for explicit review without accepting it', async () => {
  mocks.invoke.mockResolvedValue({
    data: { userId: 'owner-a', invitations: [invitation], next: null },
    error: null,
  });
  mount();
  const link = await screen.findByRole('link', {
    name: `Review invitation to ${invitation.group.name}`.trim(),
  });
  expect(link).toHaveAttribute(
    'href',
    `/hub/groups/invite/${encodeURIComponent(invitation.token)}`,
  );
  expect(screen.getByText(/Opening this list does not accept/)).toBeInTheDocument();
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
    'email-subscriptions?action=group_invitations',
    { method: 'GET' },
  );
});
it('does not request or show invitations for an anonymous visitor', () => {
  mocks.user = null;
  const { container } = mount();
  expect(container).toBeEmptyDOMElement();
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('rejects a response for another account and recovers through Retry', async () => {
  mocks.invoke
    .mockResolvedValueOnce({
      data: { userId: 'owner-b', invitations: [invitation], next: null },
      error: null,
    })
    .mockResolvedValue({ data: { userId: 'owner-a', invitations: [], next: null }, error: null });
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Invitations could not load');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('You have no pending group invitations.')).toBeInTheDocument();
});
it('uses bounded server cursors and lets a failed next page return to the previous page', async () => {
  const cursor = '77777777-0000-4000-8000-000000000020';
  mocks.invoke.mockImplementation((url: string) =>
    Promise.resolve(
      url.includes('&after=')
        ? { error: new Error('offline'), data: null }
        : { error: null, data: { userId: 'owner-a', invitations: [invitation], next: cursor } },
    ),
  );
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Next invitations' }));
  await screen.findByRole('alert');
  expect(mocks.invoke).toHaveBeenCalledWith(
    `email-subscriptions?action=group_invitations&after=${cursor}`,
    { method: 'GET' },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Previous invitations' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(await screen.findByRole('link')).toBeInTheDocument();
});
