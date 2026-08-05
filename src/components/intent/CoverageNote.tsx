import type { ReactNode } from 'react';

/**
 * A plain statement of what we actually have for this section.
 *
 * The Intent Router promises answers to jobs ("what's on tonight"), but the
 * corpus behind those promises is uneven: 315 future events in total, opening
 * hours on 2.6% of venues, ownership tags on 0.93% of brands. Silently
 * rendering a short list invites the reader to conclude the scene is dead;
 * saying "18 events in the next 7 days worldwide" is the honest alternative and
 * costs one line.
 *
 * Deliberately NOT an Alert, a warning or a `--destructive` colour. Thin data is
 * a fact about our coverage, not an error the reader caused or needs to fix.
 */
export function CoverageNote({ children }: { children: ReactNode }) {
  return <p className="text-13 text-muted-foreground mb-6 max-w-prose">{children}</p>;
}

export default CoverageNote;
