import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectQrImageLinks } from '../RedirectQrImageLinks';
import { QrExport } from '../RedirectQrDialog';
import { memberRedirectApi } from '@/lib/redirects/memberApi';
import { previewHostedQr } from '@/lib/redirects/qrImages';
import { DEFAULT_QR_STYLE } from '@/lib/redirects/qr';
vi.mock('@/lib/redirects/memberApi', () => ({ memberRedirectApi: vi.fn() }));
vi.mock('@/lib/redirects/qrImages', async (original) => ({
  ...(await original<typeof import('@/lib/redirects/qrImages')>()),
  previewHostedQr: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner-a' } }) }));
vi.mock('@/hooks/useRedirectQrStyle', () => ({
  useRedirectQrStyle: () => ({
    isSuccess: true,
    isFetching: false,
    data: { style: DEFAULT_QR_STYLE, source: 'default' },
  }),
}));
vi.mock('@/lib/redirects/qr', async (original) => ({
  ...(await original<typeof import('@/lib/redirects/qr')>()),
  generateQr: vi
    .fn()
    .mockResolvedValue({ png: 'data:image/png;base64,YWJj', jpg: 'jpg', svg: '<svg/>' }),
}));
const id = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const token = 'qg_qr_' + 'a'.repeat(64);
const record = (recordId = id) => ({
  id: recordId,
  version: id,
  label: 'Newsletter',
  linkId: id,
  createdAt: '2026-10-14T12:00:00Z',
  expiresAt: null,
  revokedAt: null,
  style: {},
  logoMode: 'inherit',
  state: 'published',
  logoAsset: null,
  imageUrls: Object.fromEntries(
    ['png', 'jpg', 'svg'].map((format) => [
      format,
      'https://queer.guide/api/qr?' + new URLSearchParams({ share: token, format }),
    ]),
  ),
});
const api = vi.mocked(memberRedirectApi);
function fixture() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const busy = vi.fn();
  const element = (scope: string) => (
    <QueryClientProvider client={client}>
      <RedirectQrImageLinks
        key={scope}
        accountId={scope}
        url="https://queer.guide/go/demo"
        linkId={id}
        tracked
        style={DEFAULT_QR_STYLE}
        logoMode="saved"
        ready
        explicitAppearance={false}
        onBusy={busy}
      />
    </QueryClientProvider>
  );
  return { client, busy, ...render(element('owner-a')), element };
}
function publish() {
  fireEvent.change(screen.getByLabelText('Image label'), { target: { value: 'Newsletter' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish image link' }));
}
function manage() {
  const details = screen.getByText('Manage image links').closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('URL', URL);
  URL.revokeObjectURL = vi.fn();
  vi.mocked(previewHostedQr).mockResolvedValue('blob:verified');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('hosted QR authoring controls', () => {
  it('keeps one appearance editor through asynchronous QR and publication updates', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <QrExport url="https://queer.guide/go/demo" managedShortLink linkId={id} />
      </QueryClientProvider>,
    );
    await screen.findByAltText('QR code for https://queer.guide/go/demo');
    expect(screen.getAllByLabelText('QR dots')).toHaveLength(1);
    api.mockResolvedValueOnce(record());
    publish();
    await screen.findByLabelText('Published image URL');
    expect(screen.getAllByLabelText('QR dots')).toHaveLength(1);
  });
  it('publishes and verifies the install destination, holding its mode during pending publication', async () => {
    let complete!: (value: unknown) => void;
    api.mockReturnValueOnce(
      new Promise((done) => {
        complete = done;
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <QrExport
          url="https://queer.guide/go/demo?utm_source=poster"
          managedShortLink
          linkId={id}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('radio', { name: 'App installation' }));
    await screen.findByAltText(
      'QR code for https://queer.guide/go/demo?qg_handoff=install&utm_source=poster',
    );
    publish();
    await waitFor(() => expect(api).toHaveBeenCalledOnce());
    expect(api).toHaveBeenCalledWith(
      '/qr-images',
      'POST',
      expect.objectContaining({ linkId: id, purpose: 'install', entryQuery: 'utm_source=poster' }),
      expect.any(AbortSignal),
    );
    expect(screen.getByRole('radio', { name: 'Open link' })).toBeDisabled();
    await act(async () => complete({ ...record(), purpose: 'install' }));
    await screen.findByLabelText('Published image URL');
    expect(previewHostedQr).toHaveBeenCalledWith(
      record().imageUrls.png,
      'https://queer.guide/go/demo?qg_handoff=install&utm_source=poster&qg_qr=1',
      expect.any(AbortSignal),
    );
    expect(screen.getByRole('radio', { name: 'Open link' })).not.toBeDisabled();
  });
  it('holds back bearer copying until hosted verification succeeds and never caches the bearer', async () => {
    let resolve!: (value: string) => void;
    vi.mocked(previewHostedQr).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    api.mockResolvedValueOnce(record());
    const view = fixture();
    publish();
    await screen.findByText('Checking the hosted image…');
    expect(screen.queryByLabelText('Published image URL')).toBeNull();
    expect(view.busy).toHaveBeenCalledWith(true);
    await act(async () => resolve('blob:verified'));
    expect(await screen.findByLabelText('Published image URL')).toHaveValue(record().imageUrls.png);
    fireEvent.change(screen.getByLabelText('Image format'), { target: { value: 'svg' } });
    expect(screen.getByLabelText('Published image URL')).toHaveValue(record().imageUrls.svg);
    expect(JSON.stringify(view.client.getQueryCache().getAll())).not.toContain(token);
    expect(api).toHaveBeenCalledTimes(1);
  });
  it('retries a failed preview without minting another image capability', async () => {
    api.mockResolvedValueOnce(record());
    vi.mocked(previewHostedQr).mockRejectedValueOnce(new Error('Hosted service unavailable'));
    fixture();
    publish();
    await screen.findByText('Hosted service unavailable');
    expect(screen.queryByLabelText('Published image URL')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry hosted preview' }));
    await screen.findByLabelText('Published image URL');
    expect(api).toHaveBeenCalledTimes(1);
    expect(previewHostedQr).toHaveBeenCalledTimes(2);
  });
  it('aborts publication and hides late results after account/selection remount', async () => {
    let resolve!: (value: unknown) => void;
    api.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = fixture();
    publish();
    const signal = api.mock.calls[0][3] as AbortSignal;
    view.rerender(view.element('owner-b'));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(record()));
    expect(screen.queryByText(/Published “Newsletter”/)).toBeNull();
    expect(previewHostedQr).not.toHaveBeenCalled();
  });
  it('requires confirmation, sends captured versions and blocks blind conflict retries', async () => {
    api.mockResolvedValueOnce(record());
    fixture();
    publish();
    await screen.findByLabelText('Published image URL');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this image link' }));
    expect(api).toHaveBeenCalledTimes(1);
    api.mockRejectedValueOnce(new Error('QR image link changed; reload before revoking'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke image link' }));
    await screen.findByText(/QR image link changed; reload before revoking/);
    expect(api.mock.calls[1]).toEqual(['/qr-images/' + id, 'DELETE', { version: id }]);
    expect(screen.getByRole('button', { name: 'Confirm revoke image link' })).toBeDisabled();
    expect(screen.getByLabelText('Published image URL')).toBeInTheDocument();
  });
  it('loads cursor pages only on request and revokes a selected record', async () => {
    api.mockResolvedValueOnce({ data: [record()], nextCursor: id });
    fixture();
    expect(api).not.toHaveBeenCalled();
    manage();
    await screen.findByRole('button', { name: 'Load more image links' });
    api.mockResolvedValueOnce({
      data: [{ ...record(second), label: 'Second image' }],
      nextCursor: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load more image links' }));
    await screen.findByText('Second image');
    expect(api.mock.calls[1][0]).toBe('/qr-images?limit=20&cursor=' + id);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke “Second image”' }));
    api.mockResolvedValueOnce({ ...record(second), revokedAt: '2026-10-14T14:00:00Z' });
    api.mockResolvedValue({
      data: [{ ...record(second), label: 'Second image', revokedAt: '2026-10-14T14:00:00Z' }],
      nextCursor: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke image link' }));
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Confirm image link revocation' })).toBeNull(),
    );
    await screen.findByText('Revoked · This redirect');
    expect(api.mock.calls[2]).toEqual(['/qr-images/' + second, 'DELETE', { version: id }]);
  });
});
