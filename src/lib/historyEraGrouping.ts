// Pure helpers for the /history era chapters: group timeline rows into eras,
// pick each era's editorial anchors, and sum per-year counts into era counts.
import { HISTORY_ERAS, eraForYear, type HistoryEra } from '@/config/historyEras';
import { milestoneYear } from '@/lib/milestoneDate';
import type { Milestone } from '@/types/milestone';

export interface YearCount {
  y: number;
  n: number;
}

/** Group rows into eras, preserving row order. Every era appears (possibly empty). */
export function groupMilestonesByEra(rows: Milestone[]): Map<string, Milestone[]> {
  const map = new Map<string, Milestone[]>(HISTORY_ERAS.map((e) => [e.slug, []]));
  for (const m of rows) {
    map.get(eraForYear(milestoneYear(m.date)).slug)?.push(m);
  }
  return map;
}

/**
 * Editorial anchors for an era: significance desc → is_featured → has-image →
 * chronological. Persecution/negative milestones still qualify — the card
 * renders them in the restrained variant.
 */
export function pickAnchors(eraRows: Milestone[], max = 2): Milestone[] {
  return [...eraRows]
    .sort(
      (a, b) =>
        b.significance - a.significance ||
        Number(b.is_featured) - Number(a.is_featured) ||
        Number(Boolean(b.image_url)) - Number(Boolean(a.image_url)) ||
        a.date.localeCompare(b.date),
    )
    .slice(0, max);
}

/** Sum the per-year histogram into per-era totals (keyed by era slug). */
export function sumEraCounts(yearCounts: YearCount[]): Map<string, number> {
  const map = new Map<string, number>(HISTORY_ERAS.map((e) => [e.slug, 0]));
  for (const { y, n } of yearCounts) {
    const slug = eraForYear(y).slug;
    map.set(slug, (map.get(slug) ?? 0) + n);
  }
  return map;
}

/** True when the anchor must use the restrained (documentary) treatment. */
export function isRestrainedMilestone(m: Milestone, era?: HistoryEra): boolean {
  return Boolean(era?.restrained) || m.category === 'persecution-destruction' || m.impact === 'negative';
}
