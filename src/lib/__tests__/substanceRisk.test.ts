import { describe, it, expect } from 'vitest';
import { contrastRatio, parseHslChannels } from '@/lib/wcagContrast';
import {
  INTERACTION_ORDER,
  interactionVisual,
  isInteractionStatus,
  sourceLabel,
  creditSources,
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

describe('interaction credit sources', () => {
  it('translates only the lowercase importer key and passes everything else through', () => {
    // `tripsit` is stored lowercase; every other source is stored display-ready.
    // A source missing from the map must render as itself, never as a default —
    // a hardcoded fallback is how all 476 grid cells came to read "TripSit".
    expect(sourceLabel('tripsit')).toBe('TripSit');
    expect(sourceLabel('eve&rave Substanzhandbuch')).toBe('eve&rave Substanzhandbuch');
    expect(sourceLabel('FDA label')).toBe('FDA label');
    expect(sourceLabel(null)).toBe('');
  });

  it('dedupes by source NAME, not by URL', () => {
    // Shipped broken once: the seven poppers/PDE5 rows cite four different
    // DailyMed documents — sildenafil/Viagra, tadalafil/Cialis and
    // vardenafil/Levitra share a label, avanafil has its own — so a URL-keyed
    // dedup printed "FDA label, FDA label, FDA label, FDA label".
    const rows = [
      { source: 'FDA label', source_url: 'https://dailymed.nlm.nih.gov/a' },
      { source: 'FDA label', source_url: 'https://dailymed.nlm.nih.gov/b' },
      { source: 'FDA label', source_url: 'https://dailymed.nlm.nih.gov/c' },
      { source: 'FDA label', source_url: 'https://dailymed.nlm.nih.gov/d' },
    ];
    expect(creditSources(rows)).toEqual([
      { name: 'FDA label', url: 'https://dailymed.nlm.nih.gov/a' },
    ]);
  });

  it('names every distinct source, in input order', () => {
    // The defect this whole change exists for: 421 tripsit + 48 eve&rave + 7 FDA
    // rows were credited to TripSit alone.
    const rows = [
      { source: 'tripsit', source_url: 'https://combo.tripsit.me/' },
      { source: 'eve&rave Substanzhandbuch', source_url: 'https://www.eve-rave.ch/x' },
      { source: 'tripsit', source_url: 'https://combo.tripsit.me/' },
      { source: 'FDA label', source_url: 'https://dailymed.nlm.nih.gov/a' },
    ];
    expect(creditSources(rows).map((s) => s.name)).toEqual([
      'TripSit',
      'eve&rave Substanzhandbuch',
      'FDA label',
    ]);
  });

  it('drops a source it cannot link, rather than emitting a dead credit', () => {
    expect(creditSources([{ source: 'Some Journal', source_url: null }])).toEqual([]);
    expect(creditSources([{ source: undefined, source_url: undefined }])).toEqual([]);
  });
});
