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

/**
 * The border colour every filled mark carries. A MODE-INDEPENDENT LITERAL, and
 * that is the whole point.
 *
 * `border-foreground` is the trap here, the same one `--color-logo-plate-ink`
 * exists to dodge: it reads as "ink", is ink in light mode, passes review and
 * every class-name test — and in dark mode `--foreground` IS paper, so a
 * near-white 2px border would land on a near-white tint and the contrast this
 * border exists to provide would be gone in the mode where it is least
 * recoverable. The tints in `VISUALS` are fixed light pastels in BOTH modes
 * (they are literals, not tokens), so their border has to be too: polarity
 * belongs to the MARK, not to the theme.
 *
 * `stiRisk.test.ts` measures against this export rather than a copy, so the
 * constant and the guarantee cannot drift apart.
 */
export const RISK_MARK_BORDER = '0 0% 7%';

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
  // `in` walks the prototype chain, so `'toString'` answered TRUE and
  // `VISUALS['toString']` handed back `Object.prototype.toString` — an object
  // with no `.Icon`, which React renders as `Element type is invalid` and takes
  // the WHOLE ROUTE down, not one cell. That is the exact opposite of the
  // fail-safe contract the next function documents. A DB CHECK constrains the
  // column today; this file's job is to survive the day it does not.
  return Object.prototype.hasOwnProperty.call(VISUALS, v);
}

/**
 * An unrecognised risk resolves to `high`, never to a blank cell: if the
 * database moves ahead of the bundle, the honest render errs toward caution
 * on a safety chart.
 */
export function transmissionRiskVisual(risk: string): TransmissionRiskVisual {
  return isTransmissionRisk(risk) ? VISUALS[risk] : VISUALS.high;
}
