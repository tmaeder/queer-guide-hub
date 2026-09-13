import { describe, it, expect } from 'vitest';
import { lineDiff, collapseContext, diffStats } from '../lineDiff';

describe('lineDiff', () => {
  it('reports no change for identical input', () => {
    const d = lineDiff('a\nb\nc', 'a\nb\nc')!;
    expect(diffStats(d)).toEqual({ added: 0, removed: 0 });
  });

  it('reports an edited line as one removal and one addition', () => {
    const d = lineDiff('a\nb\nc', 'a\nB\nc')!;
    expect(diffStats(d)).toEqual({ added: 1, removed: 1 });
    expect(d.find((l) => l.op === 'remove')?.text).toBe('b');
    expect(d.find((l) => l.op === 'add')?.text).toBe('B');
  });

  it('does NOT report a moved line as a rewrite', () => {
    // The reason this is LCS and not a set difference. An editor publishing a
    // major version needs to see a REVERSED rule; if reordering also lights up
    // red and green, the screen stops distinguishing the two.
    const d = lineDiff('rule-a\nrule-b\nrule-c', 'rule-b\nrule-c\nrule-a')!;
    const { added, removed } = diffStats(d);
    expect(added).toBe(1);
    expect(removed).toBe(1);
    // rule-b and rule-c survive as context rather than being re-emitted.
    expect(d.filter((l) => l.op === 'context').map((l) => l.text)).toEqual(['rule-b', 'rule-c']);
  });

  it('handles pure insertion and pure deletion', () => {
    expect(diffStats(lineDiff('a\nc', 'a\nb\nc')!)).toEqual({ added: 1, removed: 0 });
    expect(diffStats(lineDiff('a\nb\nc', 'a\nc')!)).toEqual({ added: 0, removed: 1 });
  });

  it('refuses rather than hanging on input past the bound', () => {
    const huge = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
    expect(lineDiff(huge, huge, 50)).toBeNull();
  });

  it('collapses unchanged runs but keeps context around every change', () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 20', 'CHANGED');
    const collapsed = collapseContext(lineDiff(before, after)!, 2);

    expect(collapsed.some((l) => l.text === 'CHANGED')).toBe(true);
    expect(collapsed.some((l) => l.text === 'line 19')).toBe(true); // context kept
    expect(collapsed.some((l) => l.text === 'line 5')).toBe(false); // far away, dropped
    expect(collapsed.some((l) => l.text === '…')).toBe(true); // and the gap is marked
    expect(collapsed.length).toBeLessThan(20);
  });
});
