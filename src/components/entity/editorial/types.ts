import type { ComponentType, ReactNode } from 'react';

export interface SectionDef {
  id: string;
  label: ReactNode;
  /** Optional icon shown beside the label in the section nav only. */
  icon?: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  kicker?: string;
  /** Optional one-line deck under the heading. */
  description?: ReactNode;
  /** Optional header-right slot, e.g. a "see all" link. */
  action?: ReactNode;
  content: ReactNode;
  /**
   * Drop the section entirely — heading, "see all" action and section-nav entry.
   *
   * `EditorialDetailLayout` already drops a section whose `content` is nullish,
   * `false` or an empty array. This flag is for the case it cannot see: a
   * `content` that is a perfectly valid element whose COMPONENT returns null.
   * `CityLandmarksRail`, `VillagesRail`, `GoNowRail`, `GuidesRail` and
   * `TrendingStrip` all do that, and the result was a kicker + `<h2>` + a live
   * nav anchor standing over nothing — verified in production on /going-out's
   * "Scenes" in Zürich. Self-hiding the RAIL does not self-hide the SECTION.
   *
   * Pass the same emptiness condition the child uses, e.g.
   * `hidden: !landmarks?.length`.
   */
  hidden?: boolean;
  /**
   * Keep the heading for screen readers and the outline, but do not draw it.
   * For a section whose own first screen already says what it is, so the
   * heading only repeats the section-nav tab right above it.
   */
  hideHeading?: boolean;
}
