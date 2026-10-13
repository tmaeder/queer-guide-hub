import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectLinkBuilder } from './RedirectLinkBuilder';
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/hooks/useRedirects', () => ({ useRedirects: () => ({ createRedirect: mocks.create }) }));
vi.mock('./RedirectQrDialog', () => ({
  QrExport: ({ url }: { url: string }) => <p>Saved QR URL: {url}</p>,
}));
beforeEach(() => {
  vi.clearAllMocks();
});
function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RedirectLinkBuilder
        onClose={vi.fn()}
        seed={{
          id: 'city',
          source: '/city/old',
          target: '/city/zurich?view=map#places',
          origin: 'city_slug_redirects',
          kind: 'Automatic',
          statusCode: 301,
          state: 'Enabled',
          updatedAt: null,
          campaign: { utm_source: 'poster' },
          prefill: { audience: 'friends & family' },
        }}
      />
    </QueryClientProvider>,
  );
}
describe('tracked link creation', () => {
  it('prefills the selected destination/settings, saves the encoded destination, and generates the persisted short URL', async () => {
    mocks.create.mockResolvedValue({ slug: 'zurich-campaign' });
    show();
    expect(screen.getByLabelText('Destination')).toHaveValue('/city/zurich?view=map#places');
    expect(screen.getByLabelText('Source')).toHaveValue('poster');
    expect(screen.getByLabelText('Parameter value')).toHaveValue('friends & family');
    fireEvent.click(screen.getByRole('button', { name: 'Create tracked link' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const target = new URL(mocks.create.mock.calls[0][0].target, 'https://queer.guide');
    expect(target.searchParams.get('audience')).toBe('friends & family');
    expect(target.searchParams.get('utm_source')).toBe('poster');
    expect(target.hash).toBe('#places');
    expect(
      await screen.findByText('Saved QR URL: https://queer.guide/go/zurich-campaign'),
    ).toBeVisible();
  });
  it('keeps entered fields and reports a failed save without displaying an unsaved QR link', async () => {
    mocks.create.mockResolvedValue(null);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Create tracked link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the link');
    expect(screen.getByLabelText('Destination')).toHaveValue('/city/zurich?view=map#places');
    expect(screen.queryByText(/Saved QR URL/)).toBeNull();
  });
});
