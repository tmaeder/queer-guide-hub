import {
  Skull,
  Ban,
  AlertTriangle,
  HelpCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
} from 'lucide-react';

/**
 * The locked palette for drug-interaction risk.
 *
 * WHY THIS IS ALLOWED TO BE CHROMATIC
 *
 * The design system's rule is that colour never encodes state, and track
 * colours never encode risk. This is a documented exception of the same kind as
 * the trip-safety traffic light in `useRiskVisual.ts`: a functional risk scale
 * where a reader's ability to spot "dangerous" in under a second matters more
 * than palette consistency. A monochrome interaction chart is a chart nobody
 * reads correctly at 2am.
 *
 * Raw channel values live ONLY here, so both consumers (the per-substance band
 * and the full matrix) cannot drift, and the eslint colour ban allowlists this
 * single module rather than every surface — the same containment `useRiskVisual`
 * uses.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL
 *
 * Every level carries a distinct `Icon` and a text `label`, and consumers are
 * expected to render both. Three of the seven levels are blues (mirroring the
 * source data's own aqua/blue/dark-blue), which are the hardest to tell apart —
 * they are distinguished by arrow direction (down / right / up), not hue. A
 * reader with any form of colour vision deficiency gets the full meaning from
 * the glyph and the label alone.
 *
 * THE INK BORDER IS LOAD-BEARING, NOT DECORATION
 *
 * These tints sit at 1.06–1.17:1 against paper — deliberately quiet, because a
 * grid of 400 saturated cells is unreadable. They therefore CANNOT satisfy WCAG
 * 1.4.11 against the page. They satisfy it against the 2px ink border every
 * filled cell carries, which is the same border-gating rule the subway track
 * colours already follow. Never render one of these fills without its border.
 *
 * Measured (see `substanceRisk.test.ts`, which re-derives these rather than
 * trusting the comment): text-on-tint 6.08–9.01:1, every tint ≥3:1 vs ink.
 */

export type InteractionStatus =
  | 'dangerous'
  | 'unsafe'
  | 'caution'
  | 'unknown'
  | 'low_risk_decrease'
  | 'low_risk_no_synergy'
  | 'low_risk_synergy';

export interface InteractionVisual {
  /** HSL channel triple — wrap in hsl() at the call site. */
  tint: string;
  /** Text/glyph colour for use ON `tint`. */
  ink: string;
  label: string;
  /** One-line plain-English meaning, shown in the legend and on hover. */
  meaning: string;
  Icon: typeof Skull;
  /** Matches public.substance_interaction_rank() — worst first. */
  severity: number;
}

const VISUALS: Record<InteractionStatus, InteractionVisual> = {
  dangerous: {
    tint: '0 93% 94%',
    ink: '0 63% 31%',
    label: 'Dangerous',
    meaning: 'Avoid entirely. These combinations can kill and their effects are unpredictable.',
    Icon: Skull,
    severity: 1,
  },
  unsafe: {
    tint: '34 100% 92%',
    ink: '15 79% 34%',
    label: 'Unsafe',
    meaning: 'Considerable risk of physical harm. Avoid where possible.',
    Icon: Ban,
    severity: 2,
  },
  caution: {
    tint: '48 96% 89%',
    ink: '32 81% 29%',
    label: 'Caution',
    meaning:
      'Not usually physically harmful, but can be unpleasant or overstimulating and the synergy is hard to predict.',
    Icon: AlertTriangle,
    severity: 3,
  },
  unknown: {
    tint: '51 20% 93%',
    ink: '30 6% 25%',
    label: 'Unknown',
    meaning: 'No reliable information. Absence of a warning is not evidence of safety.',
    Icon: HelpCircle,
    severity: 4,
  },
  low_risk_decrease: {
    tint: '204 94% 94%',
    ink: '201 90% 27%',
    label: 'Low risk, decreased',
    meaning: 'Effects are subtractive — one blunts the other.',
    Icon: ArrowDownRight,
    severity: 5,
  },
  low_risk_no_synergy: {
    tint: '226 100% 94%',
    ink: '244 55% 41%',
    label: 'Low risk, no synergy',
    meaning: 'Effects are additive, with nothing unexpected beyond each drug on its own.',
    Icon: ArrowRight,
    severity: 6,
  },
  low_risk_synergy: {
    tint: '214 95% 93%',
    ink: '226 71% 40%',
    label: 'Low risk, synergy',
    meaning: 'The two amplify each other. Low risk taken carefully, but stronger than expected.',
    Icon: ArrowUpRight,
    severity: 7,
  },
};

/** Order used by the legend and by every grouped list. Worst first. */
export const INTERACTION_ORDER: InteractionStatus[] = [
  'dangerous',
  'unsafe',
  'caution',
  'unknown',
  'low_risk_decrease',
  'low_risk_no_synergy',
  'low_risk_synergy',
];

export function isInteractionStatus(v: string): v is InteractionStatus {
  return v in VISUALS;
}

/**
 * Unknown statuses resolve to `unknown` rather than throwing. A status the
 * client does not recognise means the database moved ahead of the bundle; the
 * honest render is "we don't know", never a blank cell that reads as safe.
 */
export function interactionVisual(status: string): InteractionVisual {
  return isInteractionStatus(status) ? VISUALS[status] : VISUALS.unknown;
}

/**
 * Display names for the `substance_interactions.source` keys.
 *
 * Only the keys an importer stores lowercase need translating — every other
 * source is stored display-ready ("eve&rave Substanzhandbuch", "FDA label") and
 * falls through unchanged. A source missing from this map is NOT an error: the
 * fallback is the stored string, never a guess and never a hardcoded default.
 */
const SOURCE_LABELS: Record<string, string> = {
  tripsit: 'TripSit',
};

export function sourceLabel(source: string | null | undefined): string {
  return SOURCE_LABELS[source ?? ''] ?? source ?? '';
}

/**
 * Collapse per-row provenance into a credit list.
 *
 * KEYED BY DISPLAY NAME, NOT BY URL. Deduping on the URL printed "Interaction
 * data by FDA label, FDA label, FDA label, FDA label" on /tags/poppers: the
 * seven PDE5 combinations cite four different DailyMed documents, because
 * sildenafil/Viagra, tadalafil/Cialis and vardenafil/Levitra each share a label
 * while avanafil has its own. A credit line names WHO the data came from, so
 * one entry per source is the whole point; the first URL for that name is the
 * one it links to. Input order is preserved, so a caller that hands rows over
 * worst-first or weight-first gets that ordering back.
 */
export function creditSources(
  rows: ReadonlyArray<{ source?: string | null; source_url?: string | null }>,
): Array<{ name: string; url: string }> {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (!r.source_url) continue;
    const name = sourceLabel(r.source);
    if (name && !seen.has(name)) seen.set(name, r.source_url);
  }
  return [...seen].map(([name, url]) => ({ name, url }));
}
