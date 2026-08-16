import { describe, expect, it } from 'vitest';
import { PRIDE_FLAGS } from '../prideFlags';
import { HANKY_CODE } from '../hankyCode';
import { flagByTagSlug, flagsForIdentityTag } from '../index';

const HEX = /^#[0-9A-F]{6}$/i;

describe('pride flag data', () => {
  it('has unique flag ids', () => {
    const ids = PRIDE_FLAGS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique flagTagSlugs', () => {
    const slugs = PRIDE_FLAGS.map((f) => f.flagTagSlug).filter(Boolean);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses valid 6-digit hex for every stripe and overlay', () => {
    for (const f of PRIDE_FLAGS) {
      for (const s of f.stripes) expect(s.hex, `${f.id} stripe`).toMatch(HEX);
      if (!f.overlay) continue;
      if (f.overlay.kind === 'chevron') {
        for (const c of f.overlay.colors) expect(c, `${f.id} chevron`).toMatch(HEX);
      } else if (f.overlay.kind === 'circle') {
        expect(f.overlay.ringHex, `${f.id} ring`).toMatch(HEX);
      } else {
        expect(f.overlay.hex, `${f.id} overlay`).toMatch(HEX);
      }
    }
  });

  it('never lists a slug as both a flag tag and an identity tag', () => {
    const flagSlugs = new Set(PRIDE_FLAGS.map((f) => f.flagTagSlug).filter(Boolean));
    for (const f of PRIDE_FLAGS) {
      for (const slug of f.identityTagSlugs) {
        expect(flagSlugs.has(slug), `${slug} is both`).toBe(false);
      }
    }
  });

  it('has at least one stripe and positive weights everywhere', () => {
    for (const f of PRIDE_FLAGS) {
      expect(f.stripes.length, f.id).toBeGreaterThan(0);
      for (const s of f.stripes) {
        if (s.weight !== undefined) expect(s.weight, f.id).toBeGreaterThan(0);
      }
    }
  });

  it('derives both link indexes', () => {
    expect(flagByTagSlug.get('leather-pride-flag')?.id).toBe('leather-pride');
    expect(flagsForIdentityTag('lesbian').map((f) => f.id)).toContain('lesbian-pride');
    expect(flagsForIdentityTag('no-such-slug')).toEqual([]);
    expect(flagsForIdentityTag(null)).toEqual([]);
  });
});

describe('hanky code data', () => {
  it('has unique ids and valid hexes', () => {
    const ids = HANKY_CODE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of HANKY_CODE) expect(e.hex, e.id).toMatch(HEX);
  });

  it('keeps the Townsend classic core at exactly ten colours', () => {
    expect(HANKY_CODE.filter((e) => e.tier === 'classic')).toHaveLength(10);
  });
});
