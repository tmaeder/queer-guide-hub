import { publicSourceUrl } from './linkTools';
import { generateQr, qrStyleError, qrTrackingUrl, type QrStyle } from './qr';
import type { InventoryRedirect } from './inventory';
export type QrBundleFormat = 'png' | 'jpg' | 'svg' | 'all';
const MAX_BYTES = 64 * 1024 * 1024;
function csv(value: string) {
  const safe = /^[=+@\-\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function binary(data: string, mime: string) {
  const prefix = 'data:' + mime + ';base64,';
  if (!data.startsWith(prefix)) throw new Error('Invalid QR image format');
  const encoded = data.slice(prefix.length);
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) ||
    encoded.length > (MAX_BYTES * 4) / 3
  )
    throw new Error('Invalid QR image data');
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}
export async function buildQrBundle(
  rows: InventoryRedirect[],
  style: QrStyle,
  format: QrBundleFormat,
  options: {
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
    stylesById?: ReadonlyMap<string, QrStyle>;
  } = {},
) {
  if (!rows.length || rows.length > 100 || new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new Error('Select 1–100 distinct redirects');
  if (!['png', 'jpg', 'svg', 'all'].includes(format))
    throw new Error('Choose a supported export format');
  const links = rows.map((row) => {
    const appearance = options.stylesById?.get(row.id) ?? style;
    const styleError = qrStyleError(appearance);
    if (styleError) throw new Error(styleError);
    const source = publicSourceUrl(row.source, row.domainHostname);
    if (!source) throw new Error('No concrete URL for ' + row.source);
    return {
      row,
      style: appearance,
      url: qrTrackingUrl(source, !!row.domainHostname && !!row.isShortLink),
    };
  });
  options.signal?.throwIfAborted();
  const { zipSync } = await import('fflate');
  const zip: Record<string, Uint8Array> = {};
  let total = 0,
    firstPreview = '';
  const manifest: string[][] = [['ID', 'Source', 'Encoded URL', 'Files']];
  options.onProgress?.(0, rows.length);
  for (let index = 0; index < links.length; index++) {
    options.signal?.throwIfAborted();
    const { row, url, style: appearance } = links[index];
    let images: Awaited<ReturnType<typeof generateQr>>;
    try {
      images = await generateQr(url, appearance, options.signal);
    } catch (err) {
      if (options.signal?.aborted) throw err;
      throw new Error(
        'Could not verify ' +
          row.source +
          ': ' +
          (err instanceof Error ? err.message : 'Generation failed'),
        { cause: err },
      );
    }
    options.signal?.throwIfAborted();
    if (!index) firstPreview = images.png;
    const name =
      String(index + 1).padStart(3, '0') +
      '-' +
      (new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'link')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .slice(0, 60);
    const files: string[] = [];
    for (const extension of format === 'all' ? (['png', 'jpg', 'svg'] as const) : [format]) {
      const data =
        extension === 'svg'
          ? Uint8Array.from(new TextEncoder().encode(images.svg))
          : binary(images[extension], extension === 'png' ? 'image/png' : 'image/jpeg');
      total += data.byteLength;
      if (total > MAX_BYTES)
        throw new Error('QR export exceeds 64 MB. Select fewer links or one format.');
      const file = name + '.' + extension;
      zip[file] = data;
      files.push(file);
    }
    manifest.push([row.id, row.source, url, files.join(';')]);
    options.onProgress?.(index + 1, rows.length);
  }
  const manifestBytes = new TextEncoder().encode(
    manifest.map((line) => line.map(csv).join(',')).join('\r\n'),
  );
  total += manifestBytes.byteLength;
  if (total > MAX_BYTES) throw new Error('QR export exceeds 64 MB. Select fewer links.');
  zip['manifest.csv'] = manifestBytes;
  options.signal?.throwIfAborted();
  // Level 0 = STORE: PNG/JPG are already compressed. A late cancel discards
  // the completed bounded archive before the UI can offer it.
  const bytes = zipSync(zip, { level: 0 });
  options.signal?.throwIfAborted();
  if (bytes.byteLength > MAX_BYTES) throw new Error('QR export exceeds 64 MB. Select fewer links.');
  return { bytes, count: rows.length, firstPreview };
}
