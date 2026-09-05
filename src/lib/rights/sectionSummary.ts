import { getProtectionStatus, parseSsuDetails } from '@/utils/equalityScore';
import { topicsInSection, type RightSection, type RightTopic } from './rightsCatalog';
import { readRightValue, topicScalarValue } from './rightsValue';

/**
 * A one-line count for a rights section, so it can be collapsed without
 * hiding whether there is anything behind it.
 *
 * The country card renders 18 rows across 5 sections, all open, whether or not
 * the dataset holds anything for them. Collapsing without a summary would
 * replace that wall with five identical closed drawers, which is worse — a
 * reader cannot tell "no protections recorded" from "not opened yet". So the
 * collapsed row has to carry the count.
 *
 * `recorded` is the honest-absence signal: a section where we hold no value at
 * all says so, rather than reporting "0 of 7" and implying a measured zero.
 * That distinction is the same one `readRightValue` makes between `none` (we
 * hold nothing) and `no` (recorded as absent).
 */
export interface SectionSummary {
  /** Topics recording an affirmative protection. */
  covered: number;
  /** Topics counted. `civil-union` folds into `marriage`, as the card renders it. */
  total: number;
  /** Topics where any value at all is held. Zero means honest absence. */
  recorded: number;
}

/** Whether one topic's value is affirmative, and whether it is recorded at all. */
function readTopic(
  country: Record<string, unknown>,
  topic: RightTopic,
): { covered: boolean; recorded: boolean } {
  if (topic.kind === 'protection-matrix') {
    const data = country[topic.column] as Record<string, unknown> | null;
    const status = getProtectionStatus(data);
    const values = topic.attributes.map((a) => status[a]);
    const recorded = values.some((v) => v !== 'No data');
    // Any attribute protected counts the topic as covered: the row's own
    // SO/GI/GE/SC cells carry which ones, and a summary that demanded all four
    // would report "0 of 7" for a country protecting sexual orientation
    // everywhere — a claim its own rows contradict two lines below.
    return { covered: values.includes('Yes'), recorded };
  }

  if (topic.kind === 'union') {
    const ssu = parseSsuDetails(country[topic.column] as string | null);
    const value = readRightValue(ssu.summary);
    return { covered: value.kind === 'yes', recorded: value.kind !== 'none' };
  }

  if (topic.kind === 'gender-recognition') {
    const data = country[topic.column] as Record<string, unknown> | null;
    const marker = data?.gender_marker;
    const value = readRightValue(marker as string | null | undefined);
    return { covered: value.kind === 'yes', recorded: value.kind !== 'none' };
  }

  const value = readRightValue(
    topicScalarValue(country, topic) as string | null | undefined,
    topic.severeNegative,
  );
  return { covered: value.kind === 'yes', recorded: value.kind !== 'none' };
}

export function summariseSection(
  country: Record<string, unknown> | null | undefined,
  section: RightSection,
): SectionSummary {
  if (!country) return { covered: 0, total: 0, recorded: 0 };

  // The card renders marriage and civil union as ONE row off one column;
  // counting both would double-weight unions against every other section.
  const topics = topicsInSection(section).filter((t) => t.slug !== 'civil-union');

  let covered = 0;
  let recorded = 0;
  for (const topic of topics) {
    const read = readTopic(country, topic);
    if (read.covered) covered += 1;
    if (read.recorded) recorded += 1;
  }

  return { covered, total: topics.length, recorded };
}
