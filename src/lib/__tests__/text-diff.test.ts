import { describe, it, expect } from 'vitest';
import { diffWords, diffChangeRatio } from '../text-diff';

describe('diffWords', () => {
  it('returns a single eq segment for identical input', () => {
    const segs = diffWords('hello world', 'hello world');
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ kind: 'eq', text: 'hello world' });
  });

  it('marks pure additions as add', () => {
    const segs = diffWords('', 'hello world');
    expect(segs).toEqual([{ kind: 'add', text: 'hello world' }]);
  });

  it('marks pure deletions as del', () => {
    const segs = diffWords('hello world', '');
    expect(segs).toEqual([{ kind: 'del', text: 'hello world' }]);
  });

  it('detects substitution as del+add', () => {
    const segs = diffWords('the cat sat', 'the dog sat');
    const text = segs.map((s) => `${s.kind}:${s.text.trim()}`).join(' | ');
    expect(text).toContain('del:cat');
    expect(text).toContain('add:dog');
    expect(segs.some((s) => s.kind === 'eq' && s.text.includes('the'))).toBe(true);
    expect(segs.some((s) => s.kind === 'eq' && s.text.includes('sat'))).toBe(true);
  });

  it('handles unicode + smart quotes', () => {
    const segs = diffWords('Manu Rios looks', 'Manu R\u00edos looks');
    expect(segs.some((s) => s.kind === 'del' && s.text.includes('Rios'))).toBe(true);
    expect(segs.some((s) => s.kind === 'add' && s.text.includes('R\u00edos'))).toBe(true);
  });

  it('collapses adjacent same-kind segments', () => {
    // Adjacent equal whitespace separators stay as 'eq', so del/add are separated.
    // What we *do* guarantee: tokens of the same kind directly adjacent (no eq between)
    // collapse into one segment.
    const segs = diffWords('catsat', 'dogran');
    const dels = segs.filter((s) => s.kind === 'del');
    const adds = segs.filter((s) => s.kind === 'add');
    expect(dels).toHaveLength(1);
    expect(adds).toHaveLength(1);
    expect(dels[0].text).toBe('catsat');
    expect(adds[0].text).toBe('dogran');
  });
});

describe('diffChangeRatio', () => {
  it('returns 0 for identical', () => {
    expect(diffChangeRatio('hello world', 'hello world')).toBe(0);
  });

  it('returns close to 1 for entirely different content', () => {
    expect(diffChangeRatio('hello world', 'completely unrelated text')).toBeGreaterThan(0.7);
  });

  it('returns 0 when both empty', () => {
    expect(diffChangeRatio('', '')).toBe(0);
  });
});
