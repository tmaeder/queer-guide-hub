import { describe, it, expect } from 'vitest';
import { safeText, safeHas, hasPlaceholderLeak, PLACEHOLDER_PATTERNS } from '../safeDisplay';

describe('safeText', () => {
  it('returns fallback for null / undefined / NaN', () => {
    expect(safeText(null)).toBe('');
    expect(safeText(undefined)).toBe('');
    expect(safeText(Number.NaN)).toBe('');
    expect(safeText(null, '—')).toBe('—');
  });

  it('returns fallback for non-string objects and arrays', () => {
    expect(safeText({ name: 'x' })).toBe('');
    expect(safeText([1, 2])).toBe('');
    expect(safeText(() => 'x')).toBe('');
  });

  it('returns fallback for forbidden literal strings', () => {
    expect(safeText('null')).toBe('');
    expect(safeText('undefined')).toBe('');
    expect(safeText('[object Object]')).toBe('');
    expect(safeText('  NULL  ')).toBe('');
  });

  it('strips unrendered moustache tokens', () => {
    expect(safeText('{{title}}')).toBe('');
    expect(safeText('Hello {{name}}')).toBe('Hello');
    expect(safeText('{{a}}{{b}}')).toBe('');
  });

  it('passes through valid strings and numbers', () => {
    expect(safeText('Berlin')).toBe('Berlin');
    expect(safeText('  Berlin  ')).toBe('Berlin');
    expect(safeText(0)).toBe('0');
    expect(safeText(42)).toBe('42');
    expect(safeText(true)).toBe('true');
  });
});

describe('safeHas', () => {
  it('mirrors safeText emptiness', () => {
    expect(safeHas(null)).toBe(false);
    expect(safeHas('null')).toBe(false);
    expect(safeHas('{{x}}')).toBe(false);
    expect(safeHas('Berlin')).toBe(true);
    expect(safeHas(0)).toBe(true);
  });
});

describe('hasPlaceholderLeak', () => {
  it('detects forbidden tokens', () => {
    expect(hasPlaceholderLeak('Foo null bar')).toBe(true);
    expect(hasPlaceholderLeak('undefined view')).toBe(true);
    expect(hasPlaceholderLeak('[object Object]')).toBe(true);
    expect(hasPlaceholderLeak('Hello {{name}}')).toBe(true);
  });

  it('does not flag legitimate substrings', () => {
    expect(hasPlaceholderLeak('Annulled')).toBe(false);
    expect(hasPlaceholderLeak('Sundown')).toBe(false);
    expect(hasPlaceholderLeak('')).toBe(false);
    expect(hasPlaceholderLeak(null)).toBe(false);
  });

  it('exposes patterns', () => {
    expect(PLACEHOLDER_PATTERNS.length).toBeGreaterThan(0);
  });
});
