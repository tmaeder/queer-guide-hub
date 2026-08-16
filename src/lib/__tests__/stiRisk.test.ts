import { describe, it, expect } from 'vitest';
import { contrastRatio, parseHslChannels } from '@/lib/wcagContrast';
import {
  TRANSMISSION_RISK_ORDER,
  transmissionRiskVisual,
  isTransmissionRisk,
} from '@/lib/stiRisk';

/** Page background and the ink every filled cell is bordered with. */
const PAPER = '60 33% 97%';
const INK = '0 0% 7%';

describe('sti transmission risk palette', () => {
  it('parses every channel triple', () => {
    for (const risk of TRANSMISSION_RISK_ORDER) {
      const v = transmissionRiskVisual(risk);
      expect(parseHslChannels(v.tint), `${risk} tint`).not.toBeNull();
      expect(parseHslChannels(v.ink), `${risk} ink`).not.toBeNull();
    }
  });

  it('clears AA for text on its own tint', () => {
    for (const risk of TRANSMISSION_RISK_ORDER) {
      const v = transmissionRiskVisual(risk);
      const ratio = contrastRatio(v.ink, v.tint);
      expect(ratio, `${risk} text-on-tint`).not.toBeNull();
      expect(ratio!, `${risk} text-on-tint = ${ratio?.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clears 1.4.11 against the ink border, which is why the border is required', () => {
    for (const risk of TRANSMISSION_RISK_ORDER) {
      const v = transmissionRiskVisual(risk);
      expect(contrastRatio(INK, v.tint)!, `${risk} tint-vs-ink`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(v.tint, PAPER)!, `${risk} tint-vs-paper`).toBeLessThan(3);
    }
  });

  it('never relies on colour alone — distinct icon and label per level', () => {
    const icons = new Set(TRANSMISSION_RISK_ORDER.map((r) => transmissionRiskVisual(r).Icon));
    const labels = new Set(TRANSMISSION_RISK_ORDER.map((r) => transmissionRiskVisual(r).label));
    expect(icons.size).toBe(TRANSMISSION_RISK_ORDER.length);
    expect(labels.size).toBe(TRANSMISSION_RISK_ORDER.length);
  });

  it('orders worst-first and matches public.sti_risk_rank()', () => {
    const sev = TRANSMISSION_RISK_ORDER.map((r) => transmissionRiskVisual(r).severity);
    expect(sev).toEqual([1, 2, 3]);
    expect(transmissionRiskVisual('high').severity).toBe(1);
  });

  it('degrades an unrecognised risk toward caution, never to blank', () => {
    // On a safety chart the failure mode of an unknown key must overstate,
    // not understate.
    expect(isTransmissionRisk('HIGH RISK')).toBe(false);
    expect(transmissionRiskVisual('HIGH RISK').label).toBe('High risk');
    expect(transmissionRiskVisual('').label).toBe('High risk');
  });
});
