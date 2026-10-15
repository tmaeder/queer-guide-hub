import { previewImageInfo } from './redirect-presentation.ts';
import { UUID, tokenDigest } from './redirect-api.ts';
import { qrStylePreferenceInput } from './redirect-qr-style.ts';
import {
  qrLogoPublicResponse,
  uploadQrLogoObject,
  type QrAssetDb,
  type QrAssetStorage,
  type qrLogoInput,
} from './redirect-qr-assets.ts';
export const QR_IMAGE_TOKEN = /^qg_qr_[a-f0-9]{64}$/;
export function createQrImageToken() {
  return (
    'qg_qr_' +
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  );
}
export function qrImageLinkInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Provide image link fields');
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) =>
        ![
          'linkId',
          'url',
          'label',
          'expiresAt',
          'style',
          'logoMode',
          'logo',
          'purpose',
          'entryQuery',
        ].includes(key),
    ) ||
    Object.hasOwn(data, 'linkId') === Object.hasOwn(data, 'url')
  )
    throw new Error('Choose a link or an explicit URL');
  const result: Record<string, unknown> = {};
  if ('purpose' in data) {
    if (
      !['visit', 'install'].includes(data.purpose as string) ||
      (data.purpose === 'install' && !('linkId' in data))
    )
      throw new Error('Choose visit or app installation for a managed link');
    result.purpose = data.purpose;
  }
  if ('linkId' in data) {
    if (typeof data.linkId !== 'string' || !UUID.test(data.linkId))
      throw new Error('Choose a valid managed link');
    result.linkId = data.linkId;
  } else {
    if (
      typeof data.url !== 'string' ||
      /\s/.test(data.url) ||
      Array.from(data.url).some((char) => char.charCodeAt(0) < 32)
    )
      throw new Error('Provide an HTTP(S) URL without credentials');
    let url: URL;
    try {
      url = new URL(data.url);
    } catch {
      throw new Error('Provide a valid HTTP(S) URL');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      new TextEncoder().encode(url.href).length > 2048
    )
      throw new Error('Provide an HTTP(S) URL without credentials up to 2048 bytes');
    result.url = url.href;
  }
  if ('entryQuery' in data) {
    if (
      data.purpose !== 'install' ||
      typeof data.entryQuery !== 'string' ||
      data.entryQuery.length > 2048
    )
      throw new Error('Entry query requires app installation');
    const query = new URLSearchParams(data.entryQuery);
    const reserved =
      /^(?:pw|password|qg_click_id|qg_handoff|qg_app_choice|qg_handoff_(?:token|app|action)|x-qg-handoff-(?:token|app|action))$/i;
    if (
      [...query.keys()].some(
        (key) => !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key) || reserved.test(key),
      ) ||
      query.size > 32
    )
      throw new Error('Provide a public campaign query without credentials or handoff fields');
    const normalized = query.toString();
    if (normalized.length > 2048) throw new Error('Entry query exceeds 2048 bytes');
    result.entryQuery = normalized;
  }
  if ('label' in data) {
    if (typeof data.label !== 'string' || !data.label.trim() || data.label.trim().length > 100)
      throw new Error('Image label must be 1–100 characters');
    result.label = data.label.trim();
  }
  if ('expiresAt' in data) {
    if (data.expiresAt === null) result.expiresAt = null;
    else {
      if (
        typeof data.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(data.expiresAt)) ||
        Date.parse(data.expiresAt) <= Date.now() ||
        Date.parse(data.expiresAt) > Date.now() + 366 * 86400000
      )
        throw new Error('Choose expiry within one year or no expiry');
      result.expiresAt = new Date(data.expiresAt).toISOString();
    }
  }
  if ('style' in data)
    result.style = (
      qrStylePreferenceInput({ version: null, style: data.style }) as { style: unknown }
    ).style;
  if ('logo' in data) {
    if (
      typeof data.logo !== 'string' ||
      !data.logo.length ||
      data.logo.length > 2000000 ||
      data.logo.length % 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data.logo) ||
      (data.logoMode !== undefined && data.logoMode !== 'custom')
    )
      throw new Error('Provide base64 PNG/JPG artwork with custom logo mode');
    result.logo = data.logo;
    result.logoMode = 'custom';
  }
  if ('logoMode' in data && !('logo' in data)) {
    if (!['inherit', 'none'].includes(data.logoMode as string))
      throw new Error('Choose inherited or hidden artwork');
    result.logoMode = data.logoMode;
  }
  return result;
}
export function qrImageRevokeInput(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    typeof (value as Record<string, unknown>).version !== 'string' ||
    !UUID.test((value as Record<string, string>).version)
  )
    throw new Error('Provide the current image version');
  return { version: (value as Record<string, string>).version };
}
export function qrImageUrls(token: string) {
  if (!QR_IMAGE_TOKEN.test(token)) throw new Error('Invalid image capability');
  const url = (format: string) =>
    'https://queer.guide/api/qr?' + new URLSearchParams({ share: token, format });
  return { png: url('png'), jpg: url('jpg'), svg: url('svg') };
}
export async function publicQrImageRequest(
  req: Request,
  db: QrAssetDb,
  storageOrigin: string,
  cors: Record<string, string> = {},
) {
  const headers = {
    ...cors,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex',
    'X-Content-Type-Options': 'nosniff',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (req.method !== 'GET' || new URL(req.url).search)
    return json({ error: 'Invalid public QR image request' }, 400);
  const token = req.headers.get('Authorization')?.match(/^Bearer (qg_qr_[a-f0-9]{64})$/)?.[1];
  if (!token) return json({ error: 'QR image link not found' }, 404);
  try {
    const result = await db.rpc('redirect_public_qr_image', { p_hash: await tokenDigest(token) });
    if (result.error)
      return json(
        {
          error: result.error.code?.startsWith('22')
            ? 'Saved QR branding is unavailable; review its settings'
            : 'QR image profile unavailable',
        },
        result.error.code?.startsWith('22') ? 422 : 503,
      );
    if (!result.data) return json({ error: 'QR image link not found' }, 404);
    return json(qrLogoPublicResponse(result.data, storageOrigin));
  } catch {
    return json({ error: 'QR image profile unavailable' }, 503);
  }
}

/** Verify with the fixed scan-checking service, then upload once and finalize the same draft. */
export async function storeQrImageArtwork(
  db: QrAssetDb,
  config: QrAssetStorage,
  actor: string | null,
  principal: string | null,
  image: { id: string; version: string },
  input: Awaited<ReturnType<typeof qrLogoInput>>,
  fetcher: typeof fetch = fetch,
) {
  const reservation = await db.rpc('reserve_redirect_qr_image_logo', {
    p_actor: actor,
    p_principal: principal,
    p_image: image.id,
    p_version: image.version,
    p_mime: input.mime,
    p_bytes: input.bytes.length,
    p_width: input.width,
    p_height: input.height,
    p_sha256: input.sha256,
  });
  if (reservation.error || reservation.data?.retryAfter) return reservation;
  const asset = reservation.data;
  if (
    !asset ||
    !UUID.test(asset.id) ||
    asset.key !== asset.id + '.' + input.extension ||
    !asset.profile ||
    typeof asset.profile.url !== 'string' ||
    typeof asset.profile.tracked !== 'boolean'
  )
    throw new Error('Invalid artwork reservation');
  let encoded = '';
  for (let offset = 0; offset < input.bytes.length; offset += 8192)
    encoded += String.fromCharCode(...input.bytes.subarray(offset, offset + 8192));
  let response: Response;
  try {
    response = await fetcher('https://queer.guide/api/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: asset.profile.url,
        tracked: asset.profile.tracked ? '1' : '0',
        format: 'png',
        size: '1024',
        ...asset.profile.style,
        logo: 'data:' + input.mime + ';base64,' + btoa(encoded),
      }),
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return {
      data: null,
      error: {
        code: 'QR_VERIFY',
        message: 'Artwork verification is unavailable. The image draft has not been published.',
      },
    };
  }
  if (response.status === 429) {
    await response.body?.cancel();
    return { data: { retryAfter: 60 }, error: null };
  }
  if (
    !response.ok ||
    response.headers.get('Content-Type')?.split(';')[0] !== 'image/png' ||
    response.headers.get('X-QG-QR-Verified') !== '1'
  ) {
    await response.body?.cancel();
    return {
      data: null,
      error: {
        code: response.status === 400 || response.status === 422 ? '22023' : 'QR_VERIFY',
        message:
          'Custom artwork could not be scan-verified. The image draft has not been published.',
      },
    };
  }
  try {
    if (!response.body) throw new Error('Missing verified image');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 1500000) throw new Error('Verified image exceeded limit');
        chunks.push(part.value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    } finally {
      reader.releaseLock();
    }
    const png = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      png.set(part, offset);
      offset += part.length;
    }
    const info = previewImageInfo(png);
    if (info.mime !== 'image/png' || info.width !== 1024 || info.height !== 1024)
      throw new Error('Invalid verification raster');
  } catch {
    return {
      data: null,
      error: {
        code: 'QR_VERIFY',
        message:
          'Artwork verification response is unavailable. The image draft has not been published.',
      },
    };
  }
  try {
    await uploadQrLogoObject(config, asset, input, fetcher);
  } catch {
    return {
      data: null,
      error: {
        code: 'QR_STORAGE',
        message:
          'Artwork upload outcome is unavailable. The draft was not published; the reserved asset will be cleaned up.',
      },
    };
  }
  return db.rpc('finish_redirect_qr_image_logo', {
    p_actor: actor,
    p_principal: principal,
    p_image: image.id,
    p_asset: asset.id,
  });
}
