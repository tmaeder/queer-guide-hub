import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QR_STYLE, generateQr } from '@/lib/redirects/qr';
import { QrExport } from './RedirectQrDialog';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'qr-owner' } }) }));
vi.mock('@/hooks/useRedirectQrStyle', () => ({
  useRedirectQrStyle: () => ({
    isSuccess: true,
    isError: false,
    data: { style: DEFAULT_QR_STYLE, source: 'default' },
  }),
}));
vi.mock('@/lib/redirects/qr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redirects/qr')>()),
  generateQr: vi.fn(async () => ({
    svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    png: 'data:image/png;base64,cXI=',
    jpg: 'data:image/jpeg;base64,cXI=',
  })),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('QR exports', () => {
  it('exports the generated PNG, JPG and SVG with correct formats and filenames', async () => {
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
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Download PNG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download JPG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download SVG' }));
    expect(downloads).toEqual([
      { href: 'data:image/png;base64,cXI=', name: 'queerguide-qr.png', attached: true },
      { href: 'data:image/jpeg;base64,cXI=', name: 'queerguide-qr.jpg', attached: true },
      { href: 'blob:qr-export', name: 'queerguide-qr.svg', attached: true },
    ]);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe('image/svg+xml');
    vi.runAllTimers();
  });
  it('switches managed exports to the public install page and copies that entry without private data', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const source = 'https://links.example.com/?utm_source=poster';
    const view = render(
      <QueryClientProvider client={new QueryClient()}>
        <QrExport url={source} managedShortLink linkId="00000000-0000-4000-8000-000000000001" />
      </QueryClientProvider>,
    );
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('radio', { name: 'App installation' }));
    const target = 'https://links.example.com/?qg_handoff=install&utm_source=poster';
    await screen.findByAltText('QR code for ' + target);
    expect(generateQr).toHaveBeenLastCalledWith(
      target + '&qg_qr=1',
      expect.any(Object),
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy install link' }));
    expect(writeText).toHaveBeenCalledWith(target);
    expect(screen.getByText(/without recording a visit/)).toBeInTheDocument();
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <QrExport
          url="https://links.example.com/another"
          managedShortLink
          linkId="00000000-0000-4000-8000-000000000002"
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('radio', { name: 'Open link' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Copy install link' })).toBeNull();
  });
  it('keeps unmanaged QR exports free of app-install controls', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <QrExport url="https://example.com/content" />
      </QueryClientProvider>,
    );
    await screen.findByRole('img');
    expect(screen.queryByRole('radio', { name: 'App installation' })).toBeNull();
  });
  it('regenerates styles and blocks export when colors cannot be scanned', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <QrExport url="https://queer.guide/go/abc" />
      </QueryClientProvider>,
    );
    await screen.findByRole('img');
    fireEvent.change(screen.getByLabelText('QR dots'), { target: { value: 'joined' } });
    expect(screen.getByLabelText('QR dots')).toHaveValue('joined');
    fireEvent.change(screen.getByLabelText('QR dot color'), {
      target: { value: DEFAULT_QR_STYLE.background },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('stronger contrast');
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
