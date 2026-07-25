import { describe, it, expect } from 'vitest';
import {
  PUBLIC_MEDIA_BUCKET,
  PRIVATE_MEDIA_BUCKET,
  bucketForTier,
  objectKeyForTier,
  isPrivateMedia,
} from './mediaAccess';

// This contract is mirrored verbatim by the dam-relocate-asset edge function (Deno cannot
// import this module). If the tier→bucket/key mapping changes here, update that function too.
describe('mediaAccess tier → storage mapping', () => {
  it('routes public bytes to the public bucket, unprefixed', () => {
    expect(bucketForTier('public')).toBe(PUBLIC_MEDIA_BUCKET);
    expect(objectKeyForTier('public', 'abc.webp')).toBe('abc.webp');
  });

  it('routes partner/internal bytes to the private bucket, tier-prefixed', () => {
    expect(bucketForTier('partner')).toBe(PRIVATE_MEDIA_BUCKET);
    expect(bucketForTier('internal')).toBe(PRIVATE_MEDIA_BUCKET);
    expect(objectKeyForTier('partner', 'abc.webp')).toBe('partner/abc.webp');
    expect(objectKeyForTier('internal', 'abc.webp')).toBe('internal/abc.webp');
  });

  it('a partner→internal change alters the key (re-key needed within dam-private)', () => {
    expect(objectKeyForTier('partner', 'x.png')).not.toBe(objectKeyForTier('internal', 'x.png'));
  });

  it('isPrivateMedia only flags cms_media rows that live in the private bucket', () => {
    const base = { source_type: 'cms_media' as const, storage_path: 'internal/x.png', bucket_name: PRIVATE_MEDIA_BUCKET };
    expect(isPrivateMedia({ ...base, access_level: 'internal' })).toBe(true);
    expect(isPrivateMedia({ ...base, access_level: 'partner' })).toBe(true);
    // public tier, or bytes still in the public bucket, or an image_asset → not private
    expect(isPrivateMedia({ ...base, access_level: 'public' })).toBe(false);
    expect(isPrivateMedia({ ...base, access_level: 'internal', bucket_name: PUBLIC_MEDIA_BUCKET })).toBe(false);
    expect(isPrivateMedia({ source_type: 'image_asset', access_level: 'internal', storage_path: 'x', bucket_name: PRIVATE_MEDIA_BUCKET })).toBe(false);
  });
});
