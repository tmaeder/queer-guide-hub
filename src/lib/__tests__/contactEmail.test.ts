import { describe, expect, it } from 'vitest';
import { contactEmail } from '@/lib/entityContact';

describe('contactEmail', () => {
  it('strips the trailing mailto scrape artifact', () => {
    expect(contactEmail('info@queerbooks.chmailto')).toBe('info@queerbooks.ch');
    expect(contactEmail('acon@acon.org.aumailto')).toBe('acon@acon.org.au');
  });
  it('strips a leading mailto: scheme and whitespace', () => {
    expect(contactEmail('  mailto:hi@example.org ')).toBe('hi@example.org');
  });
  it('keeps a valid address untouched', () => {
    expect(contactEmail('team@example.com')).toBe('team@example.com');
  });
  it('returns null for values it cannot repair without guessing', () => {
    expect(contactEmail('not an email')).toBeNull();
    expect(contactEmail('a@b')).toBeNull();
    expect(contactEmail('')).toBeNull();
    expect(contactEmail(null)).toBeNull();
    expect(contactEmail('x@y.com, z@w.com')).toBeNull();
  });
});
