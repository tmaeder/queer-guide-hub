/**
 * Whether a glossary entry's photograph band renders — ONE implementation,
 * two readers.
 *
 * `TagFigure` asks it to decide whether to draw, and `TagDetail` asks it to
 * decide whether to push a `photo` stop onto the route strip. That page's own
 * comment is explicit that the station array's order must match the JSX order
 * "or the strip highlights the wrong stop while scrolling", so a component that
 * decides for itself while the page guesses separately is a real defect rather
 * than an untidiness.
 *
 * Pure, and it takes `hasFigure` as a BOOLEAN rather than looking the registry
 * up itself. Two reasons: it keeps `src/lib` from importing out of
 * `src/components`, and `TagDetail` already memoises `figuresForSlug` for its
 * own `figure` station, so asking again there would be a second lookup of the
 * same thing. The lookup may happen twice; the RULE may not.
 */

export interface TagFigureVisibility {
  /** The published photograph, if any. */
  imageUrl: string | null | undefined;
  /** Depicts explicit sexual activity. Implies `is_adult` at the DB level. */
  imageExplicit: boolean | null | undefined;
  /** True when the whole page already sits behind the age gate. */
  pageAlreadyGated: boolean;
  /** Safe mode is on for this reader. */
  safeMode: boolean;
  /** The entry already carries an inline diagram. */
  hasFigure: boolean;
}

export function shouldShowTagFigure(input: TagFigureVisibility): boolean {
  if (!input.imageUrl) return false;

  // Safe mode hides explicit imagery outright — the same rule the figure
  // registry, `rankSimilarTags` and `TagInterchange` already apply. It is a
  // SEPARATE choice from age affirmation: an affirmed adult may still have safe
  // mode on, so this is checked independently of the gate below.
  if (input.imageExplicit && input.safeMode) return false;

  // An explicit photograph may only render where the reader has affirmed their
  // age. `zz_enforce_tag_image_contract` guarantees such a row carries
  // `is_adult`, and an `is_adult` tag's whole page is wrapped in
  // `TagDetailWithGate` — so in practice `pageAlreadyGated` is true here. The
  // check is kept because "in practice" is not an invariant, and the cost of
  // being wrong is explicit material shown to someone who did not opt in.
  if (input.imageExplicit && !input.pageAlreadyGated) return false;

  // Stand down for a diagram. A figure says "these terms are parts of one
  // picture" and a photograph says "this is what the thing looks like"; both at
  // once is the redundancy this feature was retired for in 2026-08.
  if (input.hasFigure) return false;

  return true;
}
