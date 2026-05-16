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
});
