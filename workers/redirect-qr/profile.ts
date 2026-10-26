import { boundedBytes } from './request';
import { QrImageError } from './render';
import { qrStyleError, type QrStyle } from '../../src/lib/redirects/qrRender';
function invalidProfile(): never {
  throw new QrImageError('QR image profile unavailable', 503);
}
export async function readQrImageProfile(
  token: string,
  origin: string,
  anonKey: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, string>> {
  if (
    !/^qg_qr_[a-f0-9]{64}$/.test(token) ||
    !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(origin) ||
    !anonKey ||
    anonKey.length > 4096 ||
    /\s/.test(anonKey)
  )
    return invalidProfile();
  let response: Response;
  try {
    response = await fetcher(
      origin.replace(/\/$/, '') + '/functions/v1/redirect-api/public-qr-image',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token, apikey: anonKey },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        // Workers implements manual/follow only. Non-2xx responses, including
        // redirects, are rejected below without sending the capability onward.
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      },
    );
  } catch {
    return invalidProfile();
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404)
      throw new QrImageError('QR image link not found or no longer shared', 404);
    if (response.status === 422)
      throw new QrImageError('Saved QR branding is unavailable; review its settings', 422);
    return invalidProfile();
  }
  if (
    response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  ) {
    await response.body?.cancel();
    return invalidProfile();
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(await boundedBytes(response, 16384)),
    );
  } catch {
    return invalidProfile();
  }
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).some(
      (key) => !['url', 'tracked', 'style', 'effectiveLogo', 'logoSource'].includes(key),
    ) ||
    typeof data.url !== 'string' ||
    typeof data.tracked !== 'boolean' ||
    !data.style ||
    typeof data.style !== 'object' ||
    Array.isArray(data.style) ||
    Object.keys(data.style).some(
      (key) => !['dots', 'border', 'center', 'foreground', 'background'].includes(key),
    ) ||
    qrStyleError(data.style as QrStyle) ||
    !['default', 'workspace', 'domain', 'hidden', 'custom'].includes(String(data.logoSource))
  )
    return invalidProfile();
  const parameters: Record<string, string> = {
    url: data.url,
    tracked: data.tracked ? '1' : '0',
    ...(data.style as Record<string, string>),
  };
  if (data.effectiveLogo !== null) {
    const asset = data.effectiveLogo as Record<string, unknown>;
    if (
      !asset ||
      typeof asset !== 'object' ||
      Array.isArray(asset) ||
      typeof asset.id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(asset.id) ||
      !['image/png', 'image/jpeg'].includes(String(asset.mime)) ||
      asset.key !== asset.id + (asset.mime === 'image/png' ? '.png' : '.jpg') ||
      asset.url !==
        origin.replace(/\/$/, '') +
          '/storage/v1/object/public/redirect-brand-assets/' +
          asset.key ||
      !Number.isInteger(asset.bytes) ||
      Number(asset.bytes) < 1 ||
      Number(asset.bytes) > 1500000 ||
      ![asset.width, asset.height].every(
        (value) => Number.isInteger(value) && Number(value) > 0 && Number(value) <= 1024,
      ) ||
      typeof asset.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)
    )
      return invalidProfile();
    parameters.logo = String(asset.key);
    parameters.logoHash = asset.sha256;
  }
  return parameters;
}
