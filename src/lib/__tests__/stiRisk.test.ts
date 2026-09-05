import { describe, it, expect } from 'vitest';
import { contrastRatio, parseHslChannels } from '@/lib/wcagContrast';
import {
  TRANSMISSION_RISK_ORDER,
  transmissionRiskVisual,
  isTransmissionRisk,
  RISK_MARK_BORDER,
} from '@/lib/stiRisk';

/**
 * Page background, and the ink every filled mark is bordered with.
 *
 * The border is IMPORTED, not restated. As a local copy this file could go on
 * certifying a contrast ratio against a value the renderer had stopped using —
 * and that ratio is the entire reason the border is mandatory.
 * `RiskMark.test.tsx` asserts the same constant reaches the DOM, which is the
 * half a constants module cannot see.
 */
const PAPER = '60 33% 97%';
const INK = RISK_MARK_BORDER;

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

  it('does not mistake an Object.prototype member for a risk level', () => {
    // `v in VISUALS` walks the prototype chain, so `'toString'` answered TRUE
    // and the lookup returned `Object.prototype.toString` — an object with no
    // `.Icon`, which React renders as "Element type is invalid", taking down
    // the WHOLE ROUTE rather than one cell. The previous "unknown risk" case
    // could not see it: it probed `'not-a-level'`, which is not on the
    // prototype, so the buggy predicate passed it too.
    for (const key of ['toString', 'valueOf', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(isTransmissionRisk(key), `${key} recognised as a risk`).toBe(false);
      const v = transmissionRiskVisual(key);
      expect(v.label, `${key} label`).toBe('High risk');
      expect(typeof v.Icon, `${key} icon`).not.toBe('undefined');
      expect(v.tint, `${key} tint`).toBeTruthy();
    }
  });
});
