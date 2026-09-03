/**
 * Interactive glossary figures — the type contract.
 *
 * A "figure" is a rebuilt, interactive diagram that teaches several glossary
 * terms at once. It is NOT an image. Every reference infographic this system
 * replaces is copyrighted, watermarked or licensed non-commercially, so each
 * figure is authored here from cited data and every source carries a
 * `supports` line saying what it is load-bearing for. That makes the rebuild
 * a reviewable artefact in the diff rather than a claim in a PR description.
 *
 * Three rules are encoded in the types rather than left to review:
 *
 *  1. **`encodesRisk: true` cannot carry an `accent`.** The design system bans
 *     track colours from encoding risk or state (src/index.css). A risk figure
 *     sources colour from `useRiskVisual` and nothing else, so the union below
 *     makes the illegal combination unrepresentable — a compile error, not a
 *     lint rule, for the rule most likely to be broken here.
 *  2. **Every figure ships a `dataTable()`.** Colour and geometry are never the
 *     only channel; the same source array that draws the picture also prints
 *     as a real table. A drift test asserts the two agree.
 *  3. **Labels are i18n keys with fallbacks**, never raw strings and never a
 *     `label_i18n` map. That keeps the whole corpus inside `i18n:check`,
 *     `i18n:fill` and the German-defaults guard.
 */

import type { LazyExoticComponent, ComponentType } from 'react';
import type { OverallRisk } from '@/hooks/useRiskVisual';
import type { Track } from '@/components/transit/routeBulletMap';

/** The four tiers of the locked trip-safety traffic light, verbatim. Sharing
 *  the type (rather than restating four string literals) is what stops a fifth
 *  tier being invented here and drifting from TripSafetyBriefing. */
export type RiskTier = OverallRisk;

export type { Track };

export type Archetype =
  | 'axis-set'
  | 'flow-graph'
  | 'zone-map'
  | 'card-catalog'
  | 'compare-matrix'
  | 'step-run'
  | 'plot-field';

/**
 * How a glossary term relates to a figure.
 *
 * - `subject`  — the figure's canonical home. Exactly one per figure.
 * - `taught`   — a labelled part of the picture; the figure renders in full on
 *                that term's page too.
 * - `mentioned`— legend or footnote only. Never triggers a band.
 */
export type TeachRole = 'subject' | 'taught' | 'mentioned';

export interface Teaches {
  /** `unified_tags.slug`. May not exist yet — the resolver degrades to text. */
  slug: string;
  role: TeachRole;
  /** Which node / axis / zone / step in the figure IS this term. */
  anchor?: string;
}

export interface InfographicSource {
  kind: 'peer-reviewed' | 'guideline' | 'organisation' | 'editorial' | 'wikipedia';
  publisher: string;
  title: string;
  url?: string;
  /** Publication or revision date of the source itself. */
  date?: string;
  /**
   * REQUIRED. What in the figure this source is load-bearing for — "the four
   * risk tiers", "the 72-hour window". A citation that cannot say what it
   * supports is decoration.
   */
  supports: string;
}

/** A term as it actually exists in the database, once resolved. */
export interface ResolvedTerm {
  id: string;
  name: string;
  slug: string;
  status: string;
  /** Set when `status === 'merged'`; the chip links here instead. */
  canonicalSlug?: string;
  isAdult: boolean;
}

export interface DataTable {
  captionKey: string;
  captionFallback: string;
  columns: readonly { key: string; fallback: string }[];
  rows: readonly (readonly string[])[];
}

export interface InfographicViewProps {
  /** The term whose page we are on, so the figure can render it as "you are
   *  here" rather than as a link back to the current page. */
  currentSlug?: string;
  terms: Readonly<Record<string, ResolvedTerm | undefined>>;
  reducedMotion: boolean;
  rtl: boolean;
  /** Unique per mount. Anchors, `aria-controls`, and CSS scoping hang off it. */
  domId: string;
}

interface InfographicBase {
  id: string;
  archetype: Archetype;
  titleKey: string;
  titleFallback: string;
  captionKey: string;
  captionFallback: string;
  /** ONE sentence. Becomes the wrapper's `aria-label` — the whole figure in
   *  words for anyone who will not see it. */
  summaryKey: string;
  summaryFallback: string;
  teaches: readonly Teaches[];
  gate: {
    adult: boolean;
    sensitive: boolean;
    /** Rendered by the content note. Mirrors `unified_tags.sensitive_topics`. */
    topics?: readonly string[];
  };
  sources: readonly InfographicSource[];
  /**
   * ISO date the claims were last checked against their sources. Rendered
   * visibly on claim-bearing figures: on a prevention or harm-reduction
   * diagram, staleness is itself a harm, so the reader gets to see how old
   * the check is rather than trusting that one happened.
   */
  checkedOn: string;
  /**
   * The renderer, wrapped once at module scope with `lazyRetry`.
   *
   * Two things this shape buys. It keeps geometry out of the eager chunk —
   * `lazy()` stores the `import()` factory without running it, so `registry.ts`
   * can hold every meta and still ship none of the drawings; and because the
   * component is created at module load rather than in a render body, it is
   * ONE type for the lifetime of the tab. A component created during render is
   * a new type whenever a memo misses, and React remounts it and discards its
   * state — here that would silently reset a reader's picks mid-diagram.
   */
  View: LazyExoticComponent<ComponentType<InfographicViewProps>>;
  /** Pure. The accessible equivalent, and the drift test's other half. */
  dataTable: () => DataTable;
}

/**
 * `encodesRisk: true` → the figure's colour comes from `useRiskVisual` and it
 * may not name a track. `encodesRisk: false` → it may name exactly one track
 * (or none, and be pure ink). There is no third option, by construction.
 */
export type InfographicMeta =
  | (InfographicBase & { encodesRisk: true; accent?: never })
  | (InfographicBase & { encodesRisk: false; accent?: Track });
