import { describe, expect, it } from 'vitest';
import { hasSocialLinks, instagramHandle } from '@/pages/VenueDetail.parts';

describe('instagramHandle', () => {
  it('extracts the handle from the URL form the column actually holds', () => {
    expect(instagramHandle('https://www.instagram.com/atlantisevents/')).toBe('atlantisevents');
    expect(instagramHandle('https://instagram.com/TheClubColumbus')).toBe('TheClubColumbus');
  });
  it('strips a leading @ and accepts a bare handle', () => {
    expect(instagramHandle('@atlantaeagle')).toBe('atlantaeagle');
    expect(instagramHandle('atlantaeagle')).toBe('atlantaeagle');
  });
  it('returns null for empty or non-profile values', () => {
    expect(instagramHandle(null)).toBeNull();
    expect(instagramHandle('')).toBeNull();
    expect(instagramHandle('https://www.instagram.com/p/abc123/')).toBeNull();
  });
});

describe('hasSocialLinks', () => {
  it('is true for a usable profile URL', () => {
    expect(hasSocialLinks({ facebook: 'https://www.facebook.com/atlantaeagle' })).toBe(true);
  });
  it('is false for empty, non-object or junk values', () => {
    expect(hasSocialLinks({})).toBe(false);
    expect(hasSocialLinks(null)).toBe(false);
    expect(hasSocialLinks([])).toBe(false);
    expect(hasSocialLinks({ facebook: '' })).toBe(false);
  });
});
