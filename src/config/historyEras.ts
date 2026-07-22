// Curated era chapters for the /history timeline. Boundaries are editorial
// (contiguous, non-overlapping, grounded in the milestone distribution) and
// deliberately live in code: ten rows of config with i18n copy don't warrant a
// DB table, and tuning a boundary is a one-line change.

export interface HistoryEra {
  slug: string;
  /** Inclusive start year; null = open start (everything before `to`). */
  from: number | null;
  /** Inclusive end year; null = open end (through today). */
  to: number | null;
  titleKey: string;
  introKey: string;
  /**
   * Persecution-heavy era: anchor cards render the restrained (documentary)
   * variant regardless of individual milestone category.
   */
  restrained?: boolean;
}

export const HISTORY_ERAS: HistoryEra[] = [
  { slug: 'hidden-lives', from: null, to: 1799, titleKey: 'milestones.eras.hidden-lives.title', introKey: 'milestones.eras.hidden-lives.intro', restrained: true },
  { slug: 'empire-criminalization', from: 1800, to: 1867, titleKey: 'milestones.eras.empire-criminalization.title', introKey: 'milestones.eras.empire-criminalization.intro', restrained: true },
  { slug: 'birth-of-movement', from: 1868, to: 1932, titleKey: 'milestones.eras.birth-of-movement.title', introKey: 'milestones.eras.birth-of-movement.intro' },
  { slug: 'destruction', from: 1933, to: 1945, titleKey: 'milestones.eras.destruction.title', introKey: 'milestones.eras.destruction.intro', restrained: true },
  { slug: 'homophile-years', from: 1946, to: 1968, titleKey: 'milestones.eras.homophile-years.title', introKey: 'milestones.eras.homophile-years.intro' },
  { slug: 'liberation', from: 1969, to: 1981, titleKey: 'milestones.eras.liberation.title', introKey: 'milestones.eras.liberation.intro' },
  { slug: 'aids-crisis', from: 1982, to: 1995, titleKey: 'milestones.eras.aids-crisis.title', introKey: 'milestones.eras.aids-crisis.intro', restrained: true },
  { slug: 'recognition', from: 1996, to: 2009, titleKey: 'milestones.eras.recognition.title', introKey: 'milestones.eras.recognition.intro' },
  { slug: 'equality-wave', from: 2010, to: 2019, titleKey: 'milestones.eras.equality-wave.title', introKey: 'milestones.eras.equality-wave.intro' },
  { slug: 'backlash-now', from: 2020, to: null, titleKey: 'milestones.eras.backlash-now.title', introKey: 'milestones.eras.backlash-now.intro' },
];

export function eraForYear(year: number): HistoryEra {
  const era = HISTORY_ERAS.find(
    (e) => (e.from === null || year >= e.from) && (e.to === null || year <= e.to),
  );
  // Contiguous open-ended ranges cover every int year; fall back defensively.
  return era ?? HISTORY_ERAS[HISTORY_ERAS.length - 1];
}

/** Display label for an era's year range, e.g. "1969–1981", "Before 1800", "Since 2020". */
export function eraRangeLabel(era: HistoryEra): string {
  if (era.from === null) return `–${era.to}`;
  if (era.to === null) return `${era.from}–`;
  return `${era.from}–${era.to}`;
}
