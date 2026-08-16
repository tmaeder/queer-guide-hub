import { AlertOctagon, AlertTriangle, Circle, Droplet } from 'lucide-react';

/**
 * The locked palette for STI transmission risk.
 *
 * Same documented exception class as `substanceRisk.ts` and the trip-safety
 * traffic light in `useRiskVisual.ts`: a functional risk scale where scanning
 * speed beats palette consistency, contained in one allowlisted module so the
 * per-tag band and the full matrix cannot drift.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL — every level carries a distinct `Icon` and
 * a text `label`, and consumers render both. `blood_involved` is NOT a level:
 * it renders as the `BloodIcon` marker beside the cell's own icon, because the
 * source data treats "risk with blood" as a modifier, not a rank.
 *
 * THE INK BORDER IS LOAD-BEARING — these tints sit near 1.1:1 against paper
 * (a saturated grid is unreadable) and clear WCAG 1.4.11 only against the 2px
 * ink border every filled cell carries. Never render a fill without it.
 * `stiRisk.test.ts` re-derives all of this rather than trusting the comment.
 */

export type TransmissionRisk = 'high' | 'medium' | 'low';

export interface TransmissionRiskVisual {
  /** HSL channel triple — wrap in hsl() at the call site. */
  tint: string;
  /** Text/glyph colour for use ON `tint`. */
  ink: string;
  label: string;
  meaning: string;
  Icon: typeof AlertOctagon;
  /** Matches public.sti_risk_rank() — worst first. */
  severity: number;
}

const VISUALS: Record<TransmissionRisk, TransmissionRiskVisual> = {
  high: {
    tint: '0 93% 94%',
    ink: '0 63% 31%',
    label: 'High risk',
    meaning: 'A main transmission route for this infection during unprotected sex.',
    Icon: AlertOctagon,
    severity: 1,
  },
  medium: {
    tint: '48 96% 89%',
    ink: '32 81% 29%',
    label: 'Medium risk',
    meaning: 'Transmission happens this way, but less efficiently than the main routes.',
    Icon: AlertTriangle,
    severity: 2,
  },
  low: {
    tint: '204 94% 94%',
    ink: '201 90% 27%',
    label: 'Low risk',
    meaning: 'Transmission this way is documented but uncommon.',
    Icon: Circle,
    severity: 3,
  },
};

/** Order used by the legend and every grouped list. Worst first. */
export const TRANSMISSION_RISK_ORDER: TransmissionRisk[] = ['high', 'medium', 'low'];

/** The "risk with blood" modifier glyph. A marker, never a colour. */
export const BloodIcon = Droplet;

export function isTransmissionRisk(v: string): v is TransmissionRisk {
  return v in VISUALS;
}

/**
 * An unrecognised risk resolves to `high`, never to a blank cell: if the
 * database moves ahead of the bundle, the honest render errs toward caution
 * on a safety chart.
 */
export function transmissionRiskVisual(risk: string): TransmissionRiskVisual {
  return isTransmissionRisk(risk) ? VISUALS[risk] : VISUALS.high;
}
