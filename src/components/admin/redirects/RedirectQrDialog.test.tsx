import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QrExport } from './RedirectQrDialog';

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,cXI='),
  toString: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('QR exports', () => {
  it('exports the generated PNG and SVG with correct formats and filenames', async () => {
    const downloads: Array<{ href: string; name: string; attached: boolean }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ href: this.href, name: this.download, attached: this.isConnected });
    });
    const createObjectURL = vi.fn((_blob: unknown) => 'blob:qr-export');
    const NativeURL = URL;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = vi.fn();
      },
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <QrExport url="https://queer.guide/go/pride-qr" />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'data:image/png;base64,cXI=');
    fireEvent.click(screen.getByRole('button', { name: 'Download PNG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download SVG' }));
    expect(downloads).toEqual([
      { href: 'data:image/png;base64,cXI=', name: 'queerguide-qr.png', attached: true },
      { href: 'blob:qr-export', name: 'queerguide-qr.svg', attached: true },
    ]);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe('image/svg+xml');
  });
});
