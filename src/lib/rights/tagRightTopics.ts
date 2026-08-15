import { topicBySlug, type RightTopic } from './rightsCatalog';

/**
 * Glossary tags that name a CLASS of law rather than one instrument.
 *
 * `marriage-equality` is not a law — it is 38 national statutes. `decriminalization`
 * is a different instrument in every jurisdiction that has done it. Asked for "the
 * concrete source of law", the honest answer for these is not a citation but the
 * per-country ledger we already hold: the ILGA dataset on `countries.lgbti_*`,
 * surfaced through RIGHT_TOPICS.
 *
 * WHY THIS IS TYPESCRIPT AND NOT A COLUMN. RIGHT_TOPICS is the sole source of truth
 * for the 18 rights and it lives in TS, so a Postgres column could not be
 * FK-constrained to it — a typo'd slug would become a dead link discovered in
 * production. Here it is checked by a unit test at build time. The cost is that an
 * editor cannot add a mapping from /admin; for a set this small and this
 * consequential that gate is deliberate.
 *
 * Keys are `unified_tags.slug`; values are `RIGHT_TOPICS[].slug`.
 */
export const TAG_RIGHT_TOPIC: Readonly<Record<string, string>> = {
  // Family & relationships
  'marriage-equality': 'marriage',
  'same-sex-marriage': 'marriage',
  marriage: 'marriage',
  adoption: 'adoption',
  'adoption-family': 'adoption',

  // Criminalisation
  decriminalization: 'criminalisation',
  'criminalization-of-homosexuality': 'criminalisation',

  // Identity & health
  'legal-gender-recognition': 'gender-recognition',
  'gender-recognition-laws': 'gender-recognition',
  'conversion-therapy': 'conversion-therapy',
  'intersex-rights': 'intersex',

  // Anti-discrimination
  'employment-non-discrimination': 'employment',
  'housing-equality': 'housing',
  'inclusive-education-laws': 'education',
  'inclusive-education': 'education',

  // Criminal justice
  'hate-crimes': 'hate-crime',
  'hate-crime': 'hate-crime',
};

/**
 * Tags that name the WHOLE FIELD rather than one right.
 *
 * `lgbtqia-rights` alone is on 2,093 records — the single most-used law tag on
 * the site — and it had no legal pointer at all, because no answer fitted: there
 * is no one instrument, and picking a single RIGHT_TOPIC would be worse than
 * nothing. `transgender-rights` (674) is the clearest case of that trap; mapping
 * it to `gender-recognition` would quietly say trans rights ARE legal gender
 * recognition, when the corpus also covers healthcare, employment and bullying
 * protection.
 *
 * So these get a third answer: the whole ledger, all 18 rights, per country.
 */
export const UMBRELLA_RIGHTS_TAGS: readonly string[] = [
  'lgbtqia-rights',
  'lgbtq-rights',
  'transgender-rights',
  'gay-rights',
  'queer-rights',
];

/** True when the tag covers the whole rights corpus rather than one right. */
export function isUmbrellaRightsTag(tagSlug: string | null | undefined): boolean {
  return !!tagSlug && UMBRELLA_RIGHTS_TAGS.includes(tagSlug);
}

/** The rights topic a class-of-law tag maps to, or undefined for every other tag. */
export function rightTopicForTag(tagSlug: string | null | undefined): RightTopic | undefined {
  if (!tagSlug) return undefined;
  const topicSlug = TAG_RIGHT_TOPIC[tagSlug];
  return topicSlug ? topicBySlug(topicSlug) : undefined;
}

/**
 * Where a class-of-law tag sends the reader.
 *
 * `/rights/<slug>` does NOT exist — routes.tsx declares only `rights` and
 * `rights/sources`, so a topic path would render NotFound. The per-topic pages are
 * a separate feature; until they land this is a real deep link, because
 * `/rights` gives each topic card an `id` of its slug. When those pages ship, only
 * this one template changes.
 */
export function rightTopicHref(topic: RightTopic): string {
  return `/rights#${topic.slug}`;
}
