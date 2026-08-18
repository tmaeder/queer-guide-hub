import { describe, it, expect } from 'vitest';
import { contrastRatio, parseHslChannels } from '@/lib/wcagContrast';
import {
  INTERACTION_ORDER,
  interactionVisual,
  isInteractionStatus,
  type InteractionStatus,
} from '@/lib/substanceRisk';

/** Page background and the ink every filled cell is bordered with. */
const PAPER = '60 33% 97%';
const INK = '0 0% 7%';

describe('substance interaction palette', () => {
  it('parses every channel triple', () => {
    for (const status of INTERACTION_ORDER) {
      const v = interactionVisual(status);
      expect(parseHslChannels(v.tint), `${status} tint`).not.toBeNull();
      expect(parseHslChannels(v.ink), `${status} ink`).not.toBeNull();
    }
  });

  it('clears AA for text on its own tint', () => {
    // The number a reader depends on: the label and glyph sit ON the fill.
    for (const status of INTERACTION_ORDER) {
      const v = interactionVisual(status);
      const ratio = contrastRatio(v.ink, v.tint);
      expect(ratio, `${status} text-on-tint`).not.toBeNull();
      expect(ratio!, `${status} text-on-tint = ${ratio?.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clears 1.4.11 against the ink border, which is why the border is required', () => {
    // These tints are deliberately quiet — a grid of 400 saturated cells is
    // unreadable — so they do NOT clear 3:1 against paper and must never be
    // rendered borderless. This asserts both halves of that claim so the
    // rationale cannot rot into a comment nobody re-checks.
    for (const status of INTERACTION_ORDER) {
      const v = interactionVisual(status);
      expect(contrastRatio(INK, v.tint)!, `${status} tint-vs-ink`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(v.tint, PAPER)!, `${status} tint-vs-paper`).toBeLessThan(3);
    }
  });

  it('never relies on colour alone — distinct icon and label per level', () => {
    const icons = new Set(INTERACTION_ORDER.map((s) => interactionVisual(s).Icon));
    const labels = new Set(INTERACTION_ORDER.map((s) => interactionVisual(s).label));
    expect(icons.size).toBe(INTERACTION_ORDER.length);
    expect(labels.size).toBe(INTERACTION_ORDER.length);
  });

  it('distinguishes the three blues by arrow direction, not hue', () => {
    // The three low-risk levels are all blue by design (mirroring the source).
    // Colour-vision-deficient readers get the meaning from the glyph, so those
    // three icons in particular must differ.
    const blues: InteractionStatus[] = [
      'low_risk_decrease',
      'low_risk_no_synergy',
      'low_risk_synergy',
    ];
    expect(new Set(blues.map((s) => interactionVisual(s).Icon)).size).toBe(3);
  });

  it('orders worst-first and matches the database rank', () => {
    const sev = INTERACTION_ORDER.map((s) => interactionVisual(s).severity);
    expect(sev).toEqual([...sev].sort((a, b) => a - b));
    // Mirrors public.substance_interaction_rank(); if that migration changes,
    // this fails rather than letting the UI sort disagree with the RPC.
    expect(sev).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(interactionVisual('dangerous').severity).toBe(1);
  });

  it('degrades an unrecognised status to unknown, never to blank', () => {
    // A blank cell reads as "safe". If the DB gains a status the bundle has not
    // shipped yet, it must read as "we don't know".
    expect(isInteractionStatus('Low Risk & No Synergy')).toBe(false);
    expect(interactionVisual('Low Risk & No Synergy').label).toBe('Unknown');
    expect(interactionVisual('').label).toBe('Unknown');
  });
});
