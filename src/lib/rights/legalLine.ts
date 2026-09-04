import { parseSsuDetails } from '@/utils/equalityScore';
import type { MilestoneCategory, MilestoneImpact, MilestoneRef } from '@/types/milestone';
import { RIGHT_SECTION_ORDER, RIGHT_TOPICS, type RightSection } from './rightsCatalog';

/**
 * One country's legal chronology, fused from the two places we keep it.
 *
 * The country card already held every adoption year the dataset records —
 * `decrim_year_1/2`, `marriage_since`, `civil_union_since`, the four
 * `*_since` keys on each protection matrix, `self_id_since` — and rendered
 * them as grey sub-lines under an unrelated status row. The milestone table
 * held the same story as prose. Neither referenced the other, so a reader saw
 * "Marriage since 2017" in one block and "Germany legalises same-sex marriage"
 * in another and had to work out they were the same event.
 *
 * This module is the join. It is deliberately i18n-free and returns a
 * STRUCTURED label rather than a string: the component owns wording, this owns
 * chronology. That is what makes the dedupe rule testable without a render.
 *
 * No hue is decided here and none may be. The rights surfaces are
 * crisis-adjacent — see the headers on `RightsScopeBar` and
 * `LensVerdictSummary` — so the line draws in ink and `impact` is carried by
 * `MilestoneImpactMarker`'s SHAPE (filled disc / open ring / destructive ✕),
 * which survives greyscale. `section` exists for the dedupe rule and for
 * grouping, never for colour.
 */

export type LegalStationSource = 'milestone' | 'ilga';

export type LegalStationLabel =
  /** A milestone's own headline. */
  | { kind: 'milestone'; title: string }
  /** Same-sex activity decriminalised — its own sentence, not a topic name. */
  | { kind: 'decriminalised' }
  /** One or more catalog topics whose statute was adopted that year. */
  | { kind: 'topics'; slugs: string[] };

export interface LegalStation {
  /** Stable within one line; milestones use their own id. */
  id: string;
  year: number;
  source: LegalStationSource;
  section: RightSection;
  label: LegalStationLabel;
  impact: MilestoneImpact;
  /** Milestones only — derived stations have no page to link to. */
  slug?: string;
  /** `city` marks an event that happened in the city being viewed. */
  scope: 'country' | 'city';
}

export interface BuildLegalLineInput {
  /** The `countries` row. Loose by necessity — see CountryRelation. */
  country: Record<string, unknown> | null | undefined;
  milestones?: readonly MilestoneRef[] | null;
  /** Milestones tied to the city being viewed, when there is one. */
  cityMilestones?: readonly MilestoneRef[] | null;
}

/**
 * Which sections a milestone's category can stand in for.
 *
 * Used ONLY to suppress a derived station that a milestone already tells
 * better. It can never remove a milestone, so a wrong entry here costs a
 * duplicate line, not a lost event — which is the right way round.
 *
 * `law-equality` maps to every section that records an equality statute
 * because the category does not say which one; a 2017 equality milestone
 * standing in for a 2017 `marriage_since` is exactly the collision this
 * exists for. Categories absent from this map (`uprising-movement`,
 * `persecution-destruction`, `other`) never suppress anything: a protest and
 * a statute in the same year are two events, not one.
 */
const CATEGORY_COVERS: Partial<Record<MilestoneCategory, readonly RightSection[]>> = {
  'law-decriminalization': ['criminalisation'],
  'law-criminalization': ['criminalisation'],
  'law-equality': ['family', 'antiDiscrimination', 'criminalJustice', 'identity'],
  depathologization: ['identity'],
};

const SECTION_RANK = new Map(RIGHT_SECTION_ORDER.map((s, i) => [s, i]));

/**
 * A four-digit year out of whatever the column holds.
 *
 * ILGA since-values arrive as `"1969"`, `"1969-07-01"` and occasionally a
 * number. Anything that does not yield a plausible year is dropped rather than
 * guessed — a station on the wrong year is worse than a missing one.
 */
export function parseYear(value: unknown): number | null {
  if (value == null || typeof value === 'boolean') return null;
  const match = /\d{4}/.exec(String(value));
  if (!match) return null;
  const year = Number(match[0]);
  return year >= 1000 && year <= 2100 ? year : null;
}

/** The object a topic's since-paths are read from. */
function sinceHost(
  country: Record<string, unknown>,
  column: string,
): Record<string, unknown> | null {
  const raw = country[column];
  // The unions column is a JSON *string*, not an object — the one column in
  // the catalog that needs decoding before its since-paths resolve.
  if (column === 'lgbti_same_sex_unions') {
    return parseSsuDetails(raw as string | null) as unknown as Record<string, unknown>;
  }
  return (raw ?? null) as Record<string, unknown> | null;
}

function milestoneStation(m: MilestoneRef, scope: 'country' | 'city'): LegalStation | null {
  const year = parseYear(m.date);
  if (year == null) return null;
  return {
    id: m.id,
    year,
    source: 'milestone',
    // Only used for ordering ties; a milestone is never the dedupe victim.
    section: CATEGORY_COVERS[m.category ?? 'other']?.[0] ?? 'criminalisation',
    label: { kind: 'milestone', title: m.title },
    impact: m.impact,
    slug: m.slug,
    scope,
  };
}

/**
 * Fuse the ILGA adoption years with the milestone record into one chronology.
 *
 * Ascending by year, because a line is read from where it started. Derived
 * stations are grouped per (section, year): seven anti-discrimination statutes
 * that all commenced in 2006 are one reform, and listing them as seven
 * stations buries the years that carry a different event.
 */
export function buildLegalLine({
  country,
  milestones,
  cityMilestones,
}: BuildLegalLineInput): LegalStation[] {
  const stations: LegalStation[] = [];

  const fromMilestones = [
    ...(milestones ?? []).map((m) => milestoneStation(m, 'country')),
    ...(cityMilestones ?? []).map((m) => milestoneStation(m, 'city')),
  ].filter((s): s is LegalStation => s !== null);

  // A milestone can arrive from both the country and the city query.
  const seenMilestones = new Set<string>();
  for (const s of fromMilestones) {
    if (seenMilestones.has(s.id)) continue;
    seenMilestones.add(s.id);
    stations.push(s);
  }

  // What the milestones already account for, as `${year}:${section}`.
  const covered = new Set<string>();
  for (const m of milestones ?? []) {
    const year = parseYear(m.date);
    if (year == null) continue;
    for (const section of CATEGORY_COVERS[m.category ?? 'other'] ?? []) {
      covered.add(`${year}:${section}`);
    }
  }

  if (country) {
    // (section, year) -> topic slugs adopted then.
    const derived = new Map<string, { section: RightSection; year: number; slugs: string[] }>();

    for (const topic of RIGHT_TOPICS) {
      if (topic.sincePaths.length === 0) continue;
      const host = sinceHost(country, topic.column);
      if (!host) continue;

      for (const path of topic.sincePaths) {
        const year = parseYear(host[path]);
        if (year == null) continue;
        const key = `${topic.section}:${year}`;
        const group = derived.get(key) ?? { section: topic.section, year, slugs: [] };
        if (!group.slugs.includes(topic.slug)) group.slugs.push(topic.slug);
        derived.set(key, group);
      }
    }

    for (const group of derived.values()) {
      if (covered.has(`${group.year}:${group.section}`)) continue;
      const isDecrim = group.section === 'criminalisation';
      stations.push({
        id: `ilga:${group.section}:${group.year}`,
        year: group.year,
        source: 'ilga',
        section: group.section,
        // Decriminalisation reads as a sentence, not as the topic name
        // "Same-sex activity", which alone says nothing about what changed.
        label: isDecrim ? { kind: 'decriminalised' } : { kind: 'topics', slugs: group.slugs },
        // Every since-path in the catalog records a protection being gained.
        impact: 'positive',
        scope: 'country',
      });
    }
  }

  return stations.sort(
    (a, b) =>
      a.year - b.year ||
      (SECTION_RANK.get(a.section) ?? 0) - (SECTION_RANK.get(b.section) ?? 0) ||
      a.id.localeCompare(b.id),
  );
}
