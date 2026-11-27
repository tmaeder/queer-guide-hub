import { describe, it, expect } from 'vitest';
import { mySizeSlugs, mySizesToggle } from '../mySizes';

describe('mySizeSlugs', () => {
  it('maps letter sizes to marketplace slugs', () => {
    expect(mySizeSlugs({ size_top: 'XXL', size_underwear: 'M' })).toEqual(['2xl', 'm']);
  });
  it('maps EU shoe and trouser sizes, ignores waist/length', () => {
    expect(mySizeSlugs({ size_shoe: 'EU 43', size_bottom: '32/32' })).toEqual(['eu-43']);
    expect(mySizeSlugs({ size_bottom: 'eu48' })).toEqual(['eu-48']);
  });
  it('dedupes and handles nothing stored', () => {
    expect(mySizeSlugs({ size_top: 'M', size_underwear: 'M' })).toEqual(['m']);
    expect(mySizeSlugs(null)).toEqual([]);
  });
});

describe('mySizesToggle', () => {
  it('adds the missing tokens, keeping other filters', () => {
    const r = mySizesToggle(['color-black', 'size-m'], ['m', 'eu-43']);
    expect(r.on).toBe(false);
    expect(r.next).toEqual(['color-black', 'size-m', 'size-eu-43']);
  });
  it('removes them when all are already on', () => {
    const r = mySizesToggle(['size-m', 'size-eu-43', 'color-black'], ['m', 'eu-43']);
    expect(r.on).toBe(true);
    expect(r.next).toEqual(['color-black']);
  });
});
