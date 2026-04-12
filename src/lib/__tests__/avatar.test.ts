import { describe, it, expect } from 'vitest';
import { generateAvatarUrl } from '../avatar';

describe('generateAvatarUrl', () => {
  it('should return null for null input', () => {
    expect(generateAvatarUrl(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(generateAvatarUrl(undefined)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(generateAvatarUrl('')).toBeNull();
  });

  it('should return a data URI SVG', () => {
    const url = generateAvatarUrl('John Doe');
    expect(url).toMatch(/^data:image\/svg\+xml,/);
  });

  it('should include initials for two-word name', () => {
    const url = generateAvatarUrl('John Doe')!;
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('JD');
  });

  it('should include single initial for one-word name', () => {
    const url = generateAvatarUrl('Alice')!;
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('A');
  });

  it('should be deterministic for same input', () => {
    expect(generateAvatarUrl('test@example.com')).toBe(generateAvatarUrl('test@example.com'));
  });

  it('should be case-insensitive', () => {
    expect(generateAvatarUrl('Test')).toBe(generateAvatarUrl('test'));
  });

  it('should accept custom size', () => {
    const url = generateAvatarUrl('Test', 100)!;
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('width="100"');
    expect(decoded).toContain('height="100"');
  });

  it('should use last name initial for multi-word names', () => {
    const url = generateAvatarUrl('Jean Paul Sartre')!;
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('JS');
  });
});
