import { describe, it, expect } from 'vitest';
import { resolveImageUrl } from '../resolveImageUrl';

describe('resolveImageUrl', () => {
  it('prefers optimizedUrl', () => {
    expect(resolveImageUrl({ optimizedUrl: 'o', thumbnailUrl: 't', imageUrl: 'i' })).toBe('o');
  });
  it('preferThumb returns thumbnailUrl', () => {
    expect(resolveImageUrl({ optimizedUrl: 'o', thumbnailUrl: 't', preferThumb: true })).toBe('t');
  });
  it('falls back to thumbnailUrl', () => {
    expect(resolveImageUrl({ thumbnailUrl: 't', imageUrl: 'i' })).toBe('t');
  });
  it('falls back to imageUrl', () => {
    expect(resolveImageUrl({ imageUrl: 'i' })).toBe('i');
  });
  it('returns null when nothing usable', () => {
    expect(resolveImageUrl({ imageUrl: '  ' })).toBeNull();
    expect(resolveImageUrl({})).toBeNull();
  });
  it('returns null when a raw string is passed instead of an options object', () => {
    // Defensive: TS doesn't catch this (string is assignable to {} with all
    // optional fields). Five marketplace-guide callers shipped exactly this
    // bug in #1169. The runtime guard now returns null and logs in dev.
    expect(resolveImageUrl('https://example.com/foo.jpg' as unknown as Parameters<typeof resolveImageUrl>[0])).toBeNull();
    expect(resolveImageUrl(null as unknown as Parameters<typeof resolveImageUrl>[0])).toBeNull();
    expect(resolveImageUrl(undefined as unknown as Parameters<typeof resolveImageUrl>[0])).toBeNull();
  });
});
