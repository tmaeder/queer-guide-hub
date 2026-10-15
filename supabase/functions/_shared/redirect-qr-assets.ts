import type { SupabaseClient } from '@supabase/supabase-js';
import { UUID } from './redirect-api.ts';
import { previewImageInfo } from './redirect-presentation.ts';
export const QR_ASSET_BUCKET = 'redirect-brand-assets';
// Keep only the awaitable SDK result at this boundary, avoiding nominal
// PostgREST builder types across Edge import providers. Runtime guards below
// validate each operation's actual payload before using it.
export interface QrAssetDb {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: Awaited<ReturnType<SupabaseClient['rpc']>>['data'];
    error: { code?: string; message?: string } | null;
  }>;
}
export interface QrAssetStorage {
  origin: string;
  serviceKey: string;
}
export function qrAssetStorageConfig(url: string, key: string): QrAssetStorage | null {
  if (
    !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) ||
    !key ||
    key.length > 4096 ||
    /\s/.test(key)
  )
    return null;
  return { origin: url.replace(/\/$/, ''), serviceKey: key };
}
export async function qrLogoInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Provide a PNG or JPG logo and the current preference version');
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some((key) => !['image', 'version'].includes(key)) ||
    !Object.hasOwn(data, 'version') ||
    (data.version !== null && (typeof data.version !== 'string' || !UUID.test(data.version))) ||
    typeof data.image !== 'string' ||
    !data.image.length ||
    data.image.length > 2000000 ||
    data.image.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(data.image)
  )
    throw new Error('Provide base64 PNG/JPG bytes and the current preference version');
  const bytes = Uint8Array.from(atob(data.image), (char) => char.charCodeAt(0));
  const info = previewImageInfo(bytes);
  if (info.width > 1024 || info.height > 1024)
    throw new Error('Logo dimensions must be no larger than 1024 × 1024');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return {
    version: data.version as string | null,
    bytes,
    ...info,
    sha256: Array.from(digest, (n) => n.toString(16).padStart(2, '0')).join(''),
  };
}
async function qrStorageJson(response: Response) {
  if (
    !response.ok ||
    !response.body ||
    !response.headers.get('Content-Type')?.toLowerCase().includes('application/json')
  )
    throw new Error('Storage request failed');
  const reader = response.body.getReader();
  let length = 0,
    text = '';
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 16384) {
      await reader.cancel();
      throw new Error('Storage response too large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}
function qrStorageHeaders(config: QrAssetStorage) {
  return { Authorization: 'Bearer ' + config.serviceKey, apikey: config.serviceKey };
}
export async function uploadQrLogoObject(
  config: QrAssetStorage,
  asset: { id: string; key: string },
  input: Awaited<ReturnType<typeof qrLogoInput>>,
  fetcher: typeof fetch = fetch,
) {
  if (
    typeof asset.id !== 'string' ||
    !UUID.test(asset.id) ||
    asset.key !== asset.id + '.' + input.extension
  )
    throw new Error('Invalid logo upload reservation');
  const response = await fetcher(
    config.origin + '/storage/v1/object/' + QR_ASSET_BUCKET + '/' + asset.key,
    {
      method: 'POST',
      headers: {
        ...qrStorageHeaders(config),
        'Content-Type': input.mime,
        'x-upsert': 'false',
        'Cache-Control': 'max-age=3600',
      },
      body: new Uint8Array(input.bytes).buffer,
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
      cache: 'no-store',
    },
  );
  const receipt = await qrStorageJson(response);
  if (receipt.Key !== QR_ASSET_BUCKET + '/' + asset.key)
    throw new Error('Storage receipt mismatch');
}
export async function storeRedirectQrLogo(
  db: QrAssetDb,
  config: QrAssetStorage,
  actor: string,
  domain: string | null,
  input: Awaited<ReturnType<typeof qrLogoInput>>,
  fetcher: typeof fetch = fetch,
) {
  const reservation = await db.rpc('reserve_redirect_qr_logo', {
    p_actor: actor,
    p_domain: domain,
    p_version: input.version,
    p_mime: input.mime,
    p_bytes: input.bytes.length,
    p_width: input.width,
    p_height: input.height,
    p_sha256: input.sha256,
  });
  if (reservation.error) return reservation;
  const asset = reservation.data as Record<string, unknown> | null;
  if (asset?.retryAfter) return reservation;
  if (
    !asset ||
    typeof asset.id !== 'string' ||
    typeof asset.key !== 'string' ||
    !UUID.test(asset.id) ||
    asset.key !== asset.id + '.' + input.extension
  )
    throw new Error('Invalid logo upload reservation');
  try {
    await uploadQrLogoObject(config, { id: asset.id, key: asset.key }, input, fetcher);
  } catch {
    // Reservation survives crashes/timeouts; the cleanup worker owns this exact key.
    return {
      data: null,
      error: {
        code: 'QR_STORAGE',
        message:
          'Logo upload outcome is unavailable. The reserved asset will be cleaned up; reload settings before trying again.',
      },
    };
  }
  return db.rpc('finish_redirect_qr_logo', { p_actor: actor, p_id: asset.id });
}
export async function dispatchRedirectQrAssetCleanup(
  db: QrAssetDb,
  config: QrAssetStorage | null,
  fetcher: typeof fetch = fetch,
) {
  if (!config) return { configured: false, processed: 0, failed: 0, stale: 0 };
  const pruned = await db.rpc('prune_redirect_qr_image_history', { p_limit: 1000 });
  if (pruned.error) throw new Error('Could not prune QR image history');
  const claimed = await db.rpc('claim_redirect_qr_asset_cleanup', { p_limit: 3 });
  if (claimed.error || !Array.isArray(claimed.data) || claimed.data.length > 3)
    throw new Error('Could not claim asset cleanup');
  const count = { configured: true, processed: 0, failed: 0, stale: 0 };
  for (const asset of claimed.data) {
    if (
      !asset ||
      typeof asset.id !== 'string' ||
      !UUID.test(asset.id) ||
      !UUID.test(asset.lease) ||
      ![asset.id + '.png', asset.id + '.jpg'].includes(asset.key)
    )
      throw new Error('Invalid asset cleanup claim');
    let success = false;
    try {
      const response = await fetcher(config.origin + '/storage/v1/object/' + QR_ASSET_BUCKET, {
        method: 'DELETE',
        headers: { ...qrStorageHeaders(config), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [asset.key] }),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
        cache: 'no-store',
      });
      const removed = await qrStorageJson(response);
      if (
        !Array.isArray(removed) ||
        removed.length > 1 ||
        removed.some((item) => item?.name !== asset.key)
      )
        throw new Error('Invalid cleanup receipt');
      success = true;
    } catch {
      count.failed++;
    }
    const finished = await db.rpc('finish_redirect_qr_asset_cleanup', {
      p_id: asset.id,
      p_lease: asset.lease,
      p_success: success,
    });
    if (finished.error) throw new Error('Could not acknowledge asset cleanup');
    if (finished.data === true) count.processed++;
    else count.stale++;
  }
  return count;
}

/** Add only deterministic public object URLs; never accept a caller-supplied host/path. */
type HostedLogo<T> = T extends object ? T & { url: string } : T;
export type QrLogoPublicResponse<T> = T extends (infer Row)[]
  ? QrLogoPublicResponse<Row>[]
  : T extends object
    ? { [Field in keyof T]: Field extends 'logoAsset' | 'effectiveLogo' ? HostedLogo<T[Field]> : T[Field] }
    : T;
export function qrLogoPublicResponse<T>(value: T, projectUrl: string): QrLogoPublicResponse<T> {
  if (Array.isArray(value)) return value.map((row) => qrLogoPublicResponse(row, projectUrl)) as QrLogoPublicResponse<T>;
  if (!value || typeof value !== 'object') return value as QrLogoPublicResponse<T>;
  const output: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const field of ['logoAsset', 'effectiveLogo'])
    if (output[field]) {
      const asset = output[field] as Record<string, unknown>;
      if (
        !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(projectUrl) ||
        typeof asset.id !== 'string' ||
        typeof asset.key !== 'string' ||
        !UUID.test(asset.id) ||
        ![asset.id + '.png', asset.id + '.jpg'].includes(asset.key)
      )
        throw new Error('Invalid hosted logo reference');
      output[field] = {
        ...asset,
        url:
          projectUrl.replace(/\/$/, '') +
          '/storage/v1/object/public/' +
          QR_ASSET_BUCKET +
          '/' +
          asset.key,
      };
    }
  return output as QrLogoPublicResponse<T>;
}
