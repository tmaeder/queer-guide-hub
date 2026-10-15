import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { DEFAULT_QR_STYLE } from '@/lib/redirects/qr';
import { RedirectBulkQrDialog } from './RedirectBulkQrDialog';
import { manualRedirect } from '@/lib/redirects/inventory';
const mocks = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'qr-owner' } }) }));
vi.mock('@/hooks/useRedirectBulkQrStyles', () => ({
  useRedirectBulkQrStyles: (rows: { id: string }[]) => ({
    isSuccess: true,
    isError: false,
    data: new Map(rows.map((row) => [row.id, DEFAULT_QR_STYLE])),
  }),
}));
vi.mock('@/lib/redirects/qrBundle', () => ({ buildQrBundle: mocks.build }));
const rows = [
  manualRedirect({ id: 'one', type: 'SHORT', slug: 'one', target: '/events', is_enabled: true }),
];
const onClose = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  mocks.build.mockResolvedValue({
    bytes: new Uint8Array([80, 75]).buffer,
    count: 1,
    firstPreview: 'data:image/png;base64,cXI=',
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('bulk QR preparation and download', () => {
  it('enables ZIP download only after verification and invalidates it after style/format changes', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const create = vi.fn((_blob: unknown) => 'blob:verified-qr');
    const revoke = vi.fn();
    const NativeURL = URL;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static createObjectURL = create;
        static revokeObjectURL = revoke;
      },
    );
    render(<RedirectBulkQrDialog rows={rows} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Download QR ZIP' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare QR ZIP' }));
    expect(await screen.findByAltText('First verified QR code in this export')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download QR ZIP' })).not.toBeDisabled();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Download QR ZIP' }));
    expect(create).toHaveBeenCalledOnce();
    expect((create.mock.calls[0][0] as Blob).type).toBe('application/zip');
    expect(click).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:verified-qr');
    vi.useRealTimers();
    fireEvent.change(screen.getByLabelText('QR dots'), { target: { value: 'joined' } });
    expect(screen.getByRole('button', { name: 'Download QR ZIP' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Bulk QR format'), { target: { value: 'all' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare QR ZIP' }));
    await screen.findByAltText('First verified QR code in this export');
    expect(mocks.build.mock.calls[1][1].dots).toBe('joined');
    expect(mocks.build.mock.calls[1][2]).toBe('all');
  });
  it('shows verification errors and never offers a partial ZIP', async () => {
    mocks.build.mockRejectedValue(new Error('Could not verify /go/one'));
    render(<RedirectBulkQrDialog rows={rows} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare QR ZIP' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not verify /go/one');
    expect(screen.getByRole('button', { name: 'Download QR ZIP' })).toBeDisabled();
  });
  it('cancels active generation and permits retry without offering stale results', async () => {
    mocks.build.mockImplementation(
      (_rows, _style, _format, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelled', 'AbortError')),
            { once: true },
          ),
        ),
    );
    render(<RedirectBulkQrDialog rows={rows} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare QR ZIP' }));
    expect(screen.getByLabelText('Bulk QR format')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel generation' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Prepare QR ZIP' })).not.toBeDisabled(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Download QR ZIP' })).toBeDisabled();
  });
});
