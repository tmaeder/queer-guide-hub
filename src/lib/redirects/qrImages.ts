import type {
  CreatedQrImageLink,
  QrImageInput,
  QrImageLink,
} from '../../../sdk/redirects/typescript/index';
import { memberRedirectApi } from './memberApi';
import { qrAppearance } from './qrLogos';
import type { QrStyle } from './qr';
export type { CreatedQrImageLink, QrImageLink };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function qrPublicationInput(options: {
  url: string;
  linkId?: string;
  label: string;
  days: number;
  followSaved: boolean;
  style: QrStyle;
  logoMode: 'saved' | 'none' | 'custom';
  purpose?: 'visit' | 'install';
}): QrImageInput {
  const { url, linkId, label, days, followSaved, style, logoMode, purpose = 'visit' } = options;
  if (purpose === 'install' && !linkId)
    throw new Error('App installation images require a managed link.');
  if (!label.trim() || label.trim().length > 100) throw new Error('Enter an image label.');
  if (![0, 30, 365].includes(days)) throw new Error('Choose an image lifetime.');
  let logo: string | undefined;
  if (logoMode === 'custom') {
    const match = style.logo?.match(/^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) throw new Error('Choose PNG or JPG artwork before publishing.');
    logo = match[1];
  }
  const query = new URL(url).searchParams;
  query.delete('qg_handoff');
  const entryQuery = purpose === 'install' ? query.toString() : '';
  return {
    ...(linkId ? { linkId } : { url }),
    ...(entryQuery ? { entryQuery } : {}),
    ...(purpose === 'install' ? { purpose } : {}),
    label: label.trim(),
    expiresAt: days ? new Date(Date.now() + days * 86400000).toISOString() : null,
    style: followSaved ? null : qrAppearance(style),
    logoMode: logoMode === 'saved' ? 'inherit' : logoMode,
    ...(logo ? { logo } : {}),
  };
}

export function validateQrImageUrls(value: CreatedQrImageLink) {
  let token: string | null = null;
  for (const format of ['png', 'jpg', 'svg'] as const) {
    const url = new URL(value.imageUrls?.[format]);
    const share = url.searchParams.get('share');
    if (
      url.origin !== 'https://queer.guide' ||
      url.pathname !== '/api/qr' ||
      url.username ||
      url.password ||
      url.hash ||
      url.searchParams.size !== 2 ||
      url.searchParams.get('format') !== format ||
      !share ||
      !/^qg_qr_[a-f0-9]{64}$/.test(share) ||
      (token && token !== share)
    )
      throw new Error('The published image response was invalid. Reload image links to review it.');
    token = share;
  }
  if (!uuid.test(value.id) || !uuid.test(value.version) || value.state !== 'published')
    throw new Error('The image was not published. Reload image links to review it.');
  return value;
}

export async function createQrImage(input: QrImageInput, signal: AbortSignal) {
  return validateQrImageUrls(
    await memberRedirectApi<CreatedQrImageLink>(
      '/qr-images',
      'POST',
      input as unknown as Record<string, unknown>,
      signal,
    ),
  );
}

export async function readQrImages(cursor: string | null, signal: AbortSignal) {
  const page = await memberRedirectApi<{ data: QrImageLink[]; nextCursor: string | null }>(
    '/qr-images?limit=20' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
    'GET',
    undefined,
    signal,
  );
  let previous = cursor ?? '';
  if (!Array.isArray(page.data) || page.data.length > 20)
    throw new Error('Invalid image links page.');
  for (const row of page.data) {
    if (
      !uuid.test(row.id) ||
      !uuid.test(row.version) ||
      row.id <= previous ||
      typeof row.label !== 'string' ||
      !['pending', 'published'].includes(row.state)
    )
      throw new Error('Image links changed. Reload the list.');
    previous = row.id;
  }
  if (
    page.nextCursor !== null &&
    (!uuid.test(page.nextCursor) ||
      page.nextCursor !== previous ||
      !page.data.length ||
      page.nextCursor === cursor)
  )
    throw new Error('Image pagination did not advance. Reload the list.');
  return page;
}

/** Fetch and independently scan the hosted PNG before offering its bearer URLs. */
export async function previewHostedQr(url: string, expected: string, parentSignal: AbortSignal) {
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(20000)]);
  const response = await fetch(url, {
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal,
  });
  if (
    !response.ok ||
    response.headers.get('Content-Type')?.split(';')[0] !== 'image/png' ||
    response.headers.get('X-QG-QR-Verified') !== '1' ||
    !response.body
  ) {
    await response.body?.cancel();
    throw new Error('Hosted image is unavailable. Retry its preview or revoke the image link.');
  }
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 1500000) throw new Error('Hosted image exceeded the preview limit.');
      chunks.push(new Uint8Array(part.value));
    }
  } finally {
    await reader.cancel();
  }
  const blob = new Blob(chunks, { type: 'image/png' });
  const header = new DataView(await blob.slice(0, 24).arrayBuffer());
  if (
    header.byteLength < 24 ||
    header.getUint32(0) !== 0x89504e47 ||
    header.getUint32(4) !== 0x0d0a1a0a ||
    header.getUint32(12) !== 0x49484452 ||
    header.getUint32(16) > 1024 ||
    header.getUint32(20) > 1024
  )
    throw new Error('Hosted image could not be verified.');
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      const aborted = () => reject(new Error('Hosted image preview timed out or was cancelled.'));
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
      void image
        .decode()
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', aborted));
    });
    signal.throwIfAborted();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth > 1024 ||
      image.naturalHeight > 1024
    )
      throw new Error('Hosted image dimensions are invalid.');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preview is unavailable in this browser.');
    context.drawImage(image, 0, 0);
    const { default: decode } = await import('jsqr');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    signal.throwIfAborted();
    if (decode(pixels.data, pixels.width, pixels.height)?.data !== expected)
      throw new Error(
        'Hosted image did not scan to the selected link. Revoke it and reload the link.',
      );
    return objectUrl;
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}
