import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script helper, no type declarations
import { compareToBaseline, gatedAdvisories } from '../../../scripts/lib/npm-audit-ratchet.mjs';

const adv = (url: string, severity: string, name = 'pkg') => ({
  source: 1,
  name,
  url,
  severity,
  title: 't',
});

const report = {
  vulnerabilities: {
    zod: { via: [adv('GHSA-a', 'high', 'zod')] },
    parent: { via: ['zod', adv('GHSA-b', 'moderate')] },
    other: { via: [adv('GHSA-c', 'critical')] },
  },
};

describe('npm audit ratchet', () => {
  it('collects high/critical advisories only, ignoring string via entries', () => {
    expect([...gatedAdvisories(report).keys()].sort()).toEqual(['GHSA-a', 'GHSA-c']);
  });

  it('flags a new advisory and a resolved baseline entry', () => {
    const { added, resolved } = compareToBaseline(gatedAdvisories(report), [
      { id: 'GHSA-a' },
      { id: 'GHSA-gone' },
    ]);
    expect(added.map((a: { id: string }) => a.id)).toEqual(['GHSA-c']);
    expect(resolved.map((b: { id: string }) => b.id)).toEqual(['GHSA-gone']);
  });

  it('refuses something that is not an audit report', () => {
    expect(() => gatedAdvisories({ error: { summary: 'ENOTFOUND' } })).toThrow();
  });
});
