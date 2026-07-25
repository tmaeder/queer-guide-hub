import { describe, expect, it } from 'vitest';
import {
  parseHslChannels,
  contrastRatio,
  contrastVerdict,
  hslChannelsToCss,
} from '../wcagContrast';

describe('parseHslChannels', () => {
  it('parses valid triples', () => {
    expect(parseHslChannels('0 0% 100%')).toEqual([0, 0, 100]);
    expect(parseHslChannels('210 40.5% 96.1%')).toEqual([210, 40.5, 96.1]);
  });
  it('rejects malformed input', () => {
    expect(parseHslChannels('#ffffff')).toBeNull();
    expect(parseHslChannels('0 0 100')).toBeNull();
    expect(parseHslChannels('0 0% 100%;} body{')).toBeNull();
    expect(parseHslChannels('400 0% 100%')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('0 0% 0%', '0 0% 100%')).toBeCloseTo(21, 1);
  });
  it('is symmetric', () => {
    expect(contrastRatio('0 0% 0%', '0 0% 100%')).toBeCloseTo(contrastRatio('0 0% 100%', '0 0% 0%')!, 5);
  });
  it('same color is 1:1', () => {
    expect(contrastRatio('0 0% 50%', '0 0% 50%')).toBeCloseTo(1, 5);
  });
  it('returns null on malformed input', () => {
    expect(contrastRatio('nope', '0 0% 100%')).toBeNull();
  });
});

describe('contrastVerdict', () => {
  it('grades the default body pair AAA', () => {
    const v = contrastVerdict('0 0% 4%', '0 0% 100%');
    expect(v).not.toBeNull();
    expect(v!.aaa).toBe(true);
    expect(v!.aa).toBe(true);
  });
  it('fails a low-contrast pair', () => {
    const v = contrastVerdict('0 0% 80%', '0 0% 100%');
    expect(v!.aa).toBe(false);
    expect(v!.aaLarge).toBe(false);
  });
  it('grades 3:1-ish pairs as large-only', () => {
    const v = contrastVerdict('0 0% 55%', '0 0% 100%');
    expect(v!.aaLarge).toBe(true);
    expect(v!.aa).toBe(false);
  });
});

describe('hslChannelsToCss', () => {
  it('wraps channels in hsl()', () => {
    expect(hslChannelsToCss('0 0% 96%')).toBe('hsl(0 0% 96%)');
  });
});
