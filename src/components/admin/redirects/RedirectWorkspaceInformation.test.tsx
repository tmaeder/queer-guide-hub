import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectWorkspaceInformation } from './RedirectWorkspaceInformation';

const mocks = vi.hoisted(() => ({ api: vi.fn(), denied: false }));
vi.mock('@/lib/redirects/memberApi', () => ({ memberRedirectApi: mocks.api }));
const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const createdAt = '2026-10-25T12:00:00Z';
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RedirectWorkspaceInformation userId="account" onClose={() => {}} />
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.denied = false;
  mocks.api.mockImplementation(async (path) => {
    if (mocks.denied) throw new Error('Workspace access changed');
    const query = new URL('https://fixture.invalid' + path).searchParams;
    if (query.get('kind') === 'tokens')
      return {
        data: [
          {
            id: first,
            name: 'Campaign key',
            prefix: 'qg_redirect_ab',
            scopes: ['links:read'],
            linkCount: null,
            status: 'active',
            createdAt,
            secret: 'SHOULD_NOT_RENDER',
          },
        ],
        count: 1,
        nextCursor: null,
      };
    if (query.get('kind') === 'webhooks')
      return {
        data: [
          {
            id: first,
            name: 'Measurement receiver',
            receiverHost: 'https://receiver.example.org',
            eventTypes: ['link.clicked'],
            status: 'disabled',
            createdAt,
            privatePath: 'SHOULD_NOT_RENDER',
          },
        ],
        count: 1,
        nextCursor: null,
      };
    return query.has('after')
      ? {
          data: [{ id: second, name: 'second.example.org', status: 'ready', createdAt }],
          count: 2,
          nextCursor: null,
        }
      : {
          data: [{ id: first, name: 'guide.example.org', status: 'setup_required', createdAt }],
          count: 2,
          nextCursor: first,
        };
  });
});
describe('read-only workspace information', () => {
  it('loads complete domain pages using the returned cursor', async () => {
    show();
    expect(await screen.findByText('guide.example.org')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Load more information' }));
    expect(await screen.findByText('second.example.org')).toBeVisible();
    expect(screen.getAllByText('guide.example.org')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Load more information' })).toBeNull();
    expect(
      mocks.api.mock.calls.some(
        ([path]) => new URL('https://fixture.invalid' + path).searchParams.get('after') === first,
      ),
    ).toBe(true);
  });
  it('shows limited key and webhook details without secrets or write controls', async () => {
    show();
    await screen.findByText('guide.example.org');
    fireEvent.click(screen.getByRole('button', { name: 'API keys' }));
    expect(await screen.findByText('Campaign key')).toBeVisible();
    expect(screen.getByText('qg_redirect_ab…')).toBeVisible();
    expect(screen.queryByText('SHOULD_NOT_RENDER')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Webhooks' }));
    expect(await screen.findByText('Measurement receiver')).toBeVisible();
    expect(screen.getByText('Receiver host: https://receiver.example.org')).toBeVisible();
    expect(screen.queryByText('SHOULD_NOT_RENDER')).toBeNull();
    expect(screen.queryByRole('button', { name: /delete|rotate|send test/i })).toBeNull();
  });
  it('hides previously loaded metadata when current access is denied', async () => {
    const { client } = show();
    await screen.findByText('guide.example.org');
    mocks.denied = true;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['redirect-member', 'account'] });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Workspace access changed');
    expect(screen.queryByText('guide.example.org')).toBeNull();
    mocks.denied = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry information' }));
    await waitFor(() => expect(screen.getByText('guide.example.org')).toBeVisible());
  });
});
