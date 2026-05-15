import { describe, it, expect } from 'vitest';
import { sanitizeExcerpt, isMeaningfulTag } from '../eventText';

describe('sanitizeExcerpt', () => {
  it('returns empty string for null/undefined input', () => {
    expect(sanitizeExcerpt(null)).toBe('');
    expect(sanitizeExcerpt(undefined)).toBe('');
    expect(sanitizeExcerpt('')).toBe('');
  });

  it('strips HTML tags', () => {
    expect(sanitizeExcerpt('<p>Hello</p>')).toBe('Hello');
  });

  it('collapses repeated whitespace', () => {
    expect(sanitizeExcerpt('a    b\n\nc')).toBe('a b c');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeExcerpt('  hi  ')).toBe('hi');
  });

  it('handles nested and self-closing tags', () => {
    expect(sanitizeExcerpt('<div><br/>one<span>two</span></div>')).toBe('one two');
  });

  it('preserves text content of complex HTML', () => {
    const html = '<p>Pride parade <strong>2026</strong> in <a href="/x">Berlin</a>.</p>';
    // Tags become spaces, then collapsed — punctuation adjacent to tag
    // ends up separated. This is acceptable for excerpt display.
    expect(sanitizeExcerpt(html)).toBe('Pride parade 2026 in Berlin .');
  });
});

describe('isMeaningfulTag', () => {
  it('rejects null/undefined', () => {
    expect(isMeaningfulTag(null)).toBe(false);
    expect(isMeaningfulTag(undefined)).toBe(false);
  });

  it('rejects empty strings and single-character tags', () => {
    expect(isMeaningfulTag('')).toBe(false);
    expect(isMeaningfulTag('a')).toBe(false);
  });

  it.each(['event', 'events', 'misc', 'other', 'general', 'uncategorized'])(
    "rejects generic tag %s",
    tag => {
      expect(isMeaningfulTag(tag)).toBe(false);
    },
  );

  it('is case-insensitive for blocklist', () => {
    expect(isMeaningfulTag('Misc')).toBe(false);
    expect(isMeaningfulTag('GENERAL')).toBe(false);
  });

  it('trims before checking', () => {
    expect(isMeaningfulTag('  event  ')).toBe(false);
  });

  it('accepts meaningful tags', () => {
    expect(isMeaningfulTag('pride')).toBe(true);
    expect(isMeaningfulTag('drag-show')).toBe(true);
  });
});
