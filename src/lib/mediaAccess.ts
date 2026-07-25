import type { AccessLevel, UnifiedMediaItem } from '@/components/cms/MediaLibrary/types';

export const PUBLIC_MEDIA_BUCKET = 'cms-media';
export const PRIVATE_MEDIA_BUCKET = 'dam-private';

/** Which storage bucket holds bytes for a given access tier. */
export function bucketForTier(access: AccessLevel): string {
  return access === 'public' ? PUBLIC_MEDIA_BUCKET : PRIVATE_MEDIA_BUCKET;
}

/**
 * Object key for an upload of the given tier. Private tiers are namespaced by tier as the
 * first path segment ('partner/…' | 'internal/…') — the dam-private storage RLS keys read
 * access off that segment (staff see all; partner segment is readable by any authed user).
 */
export function objectKeyForTier(access: AccessLevel, filename: string): string {
  return access === 'public' ? filename : `${access}/${filename}`;
}

/** A private cms_media row keeps its bytes off the public URL and must be signed to view. */
export function isPrivateMedia(item: Pick<UnifiedMediaItem, 'source_type' | 'access_level' | 'storage_path' | 'bucket_name'>): boolean {
  return (
    item.source_type === 'cms_media' &&
    item.access_level !== 'public' &&
    !!item.storage_path &&
    item.bucket_name === PRIVATE_MEDIA_BUCKET
  );
}
