import { Buffer } from 'node:buffer';
import {
  DEFAULT_QR_STYLE,
  qrStyleError,
  qrTrackingUrl,
  type QrStyle,
} from '../../src/lib/redirects/qrRender';
import { QrImageError, inlineLogo, validateLogoBytes, type QrImageFormat } from './render';
const UUID_KEY = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg)$/;
const fields = [
  'url',
  'format',
  'size',
  'tracked',
  'dots',
  'border',
  'center',
  'foreground',
  'background',
  'logo',
  'logoHash',
  'share',
];
export async function boundedBytes(response: Response, max: number) {
  if (!response.body) throw new QrImageError('Image body is missing.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) throw new QrImageError('Image request is too large.', 413);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}
export async function parseQrImageRequest(
  request: Request,
  storageOrigin: string,
  fetcher: typeof fetch = fetch,
  resolveProfile?: (token: string, signal: AbortSignal) => Promise<Record<string, string>>,
) {
  const endpoint = new URL(request.url);
  if (endpoint.search.length > 8192) throw new QrImageError('QR image URL is too long.', 414);
  let values: Record<string, unknown>;
  if (request.method === 'POST') {
    if (
      endpoint.search ||
      request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'
    )
      throw new QrImageError('Send QR parameters as JSON.');
    try {
      values = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await boundedBytes(new Response(request.body), 2100000),
        ),
      );
    } catch (error) {
      if (error instanceof QrImageError) throw error;
      throw new QrImageError('Invalid QR image JSON.');
    }
  } else {
    if (
      [...endpoint.searchParams.keys()].some(
        (key) => endpoint.searchParams.getAll(key).length !== 1,
      )
    )
      throw new QrImageError('Duplicate QR parameters.');
    values = Object.fromEntries(endpoint.searchParams);
  }
  if (
    !values ||
    typeof values !== 'object' ||
    Array.isArray(values) ||
    Object.keys(values).some((key) => !fields.includes(key)) ||
    Object.values(values).some((value) => typeof value !== 'string')
  )
    throw new QrImageError('Invalid QR image parameters.');
  if ('share' in values) {
    if (
      !['GET', 'HEAD'].includes(request.method) ||
      !/^qg_qr_[a-f0-9]{64}$/.test(String(values.share)) ||
      Object.keys(values).some((key) => !['share', 'format', 'size'].includes(key)) ||
      (values.format !== undefined && !['png', 'jpg', 'svg'].includes(String(values.format))) ||
      (values.size !== undefined && !['256', '512', '1024'].includes(String(values.size)))
    )
      throw new QrImageError('Invalid shared QR image parameters.');
    if (!resolveProfile) throw new QrImageError('QR image profile unavailable', 503);
    const profile = await resolveProfile(String(values.share), request.signal);
    values = {
      ...profile,
      ...(values.format !== undefined ? { format: values.format } : {}),
      ...(values.size !== undefined ? { size: values.size } : {}),
    };
  }
  if (
    typeof values.url !== 'string' ||
    new TextEncoder().encode(values.url).length > 2048 ||
    Array.from(values.url).some((char) => char.charCodeAt(0) <= 32)
  )
    throw new QrImageError('Provide an HTTP(S) URL up to 2048 bytes.');
  let url: URL;
  try {
    url = new URL(values.url);
  } catch {
    throw new QrImageError('Provide a valid HTTP(S) URL.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname)
    throw new QrImageError('Provide an HTTP(S) URL without credentials.');
  const format = (values.format ?? 'png') as QrImageFormat,
    size = Number(values.size ?? '1024');
  if (
    !['svg', 'png', 'jpg'].includes(format) ||
    ![256, 512, 1024].includes(size) ||
    (values.tracked !== undefined && !['0', '1'].includes(String(values.tracked)))
  )
    throw new QrImageError('Choose SVG, PNG or JPG and size 256, 512 or 1024.');
  const style = {
    ...DEFAULT_QR_STYLE,
    ...Object.fromEntries(
      ['dots', 'border', 'center', 'foreground', 'background']
        .filter((key) => key in values)
        .map((key) => [key, values[key]]),
    ),
  } as QrStyle;
  const styleError = qrStyleError(style);
  if (styleError) throw new QrImageError(styleError);
  if (values.logo) {
    let bytes: Uint8Array, mime: string;
    if (request.method === 'POST' && String(values.logo).startsWith('data:')) {
      const match = String(values.logo).match(/^data:(image\/(?:png|jpeg));base64,(.*)$/);
      if (
        !match ||
        !match[2] ||
        match[2].length > 2000000 ||
        match[2].length % 4 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(match[2]) ||
        values.logoHash
      )
        throw new QrImageError('Use base64 PNG/JPG artwork without a logo hash.');
      bytes = Buffer.from(match[2], 'base64');
      mime = match[1];
      if (Buffer.from(bytes).toString('base64') !== match[2])
        throw new QrImageError('Invalid logo encoding.');
    } else {
      if (
        !UUID_KEY.test(String(values.logo)) ||
        typeof values.logoHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(values.logoHash)
      )
        throw new QrImageError('Choose an immutable saved logo key and SHA-256.');
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(storageOrigin))
        throw new QrImageError('Saved logo storage is unavailable.', 503);
      const response = await fetcher(
        storageOrigin.replace(/\/$/, '') +
          '/storage/v1/object/public/redirect-brand-assets/' +
          values.logo,
        {
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          // Workers rejects redirect:"error"; the response check below rejects
          // redirects while keeping the fixed asset origin authoritative.
          redirect: 'manual',
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
          cache: 'no-store',
        },
      );
      mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
      if (
        !response.ok ||
        !['image/png', 'image/jpeg'].includes(mime) ||
        mime !== (String(values.logo).endsWith('.png') ? 'image/png' : 'image/jpeg')
      ) {
        await response.body?.cancel();
        throw new QrImageError('Saved logo could not be loaded.', 422);
      }
      bytes = await boundedBytes(response, 1500000);
      const digest = Buffer.from(
        await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
      ).toString('hex');
      if (digest !== values.logoHash)
        throw new QrImageError('Saved logo integrity check failed.', 422);
    }
    await validateLogoBytes(bytes, mime);
    style.logo = inlineLogo(bytes, mime);
  } else if ('logoHash' in values) throw new QrImageError('Choose a saved logo with this hash.');
  return { url: qrTrackingUrl(url.href, values.tracked === '1'), style, format, size };
}
