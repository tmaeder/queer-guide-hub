import { RIGHT_TOPICS, topicBySlug, type RightTopic } from './rightsCatalog';

/**
 * Canonical news tags that provide current reporting context for each legal
 * right. Values use the post-normalisation `news_articles.tags` vocabulary;
 * aliases belong in the database normaliser, never in this reader-facing map.
 */
export const RIGHTS_NEWS_TAGS: Readonly<Record<string, readonly string[]>> = {
  criminalisation: [
    'criminalization-of-homosexuality',
    'decriminalization',
    'sodomy-laws',
    'anti-lgbtqia-laws',
  ],
  expression: ['freedom-of-expression', 'censorship', 'anti-lgbtqia-laws'],
  association: ['freedom-of-association', 'assembly-rights', 'anti-lgbtqia-laws'],
  constitutional: ['constitutional-rights', 'constitutional-protection', 'equal-protection'],
  employment: ['employment-discrimination', 'workplace-discrimination', 'workplace-equality'],
  housing: ['housing-discrimination', 'housing-equality'],
  education: ['inclusive-education', 'education-discrimination', 'school-discrimination'],
  health: ['healthcare-discrimination', 'health-equity', 'healthcare'],
  'goods-services': ['public-accommodations', 'service-discrimination', 'discrimination'],
  bullying: ['bullying', 'school-bullying'],
  'hate-crime': ['hate-crimes', 'anti-lgbtqia-violence'],
  incitement: ['hate-speech', 'incitement-to-hatred'],
  marriage: ['same-sex-marriage'],
  'civil-union': ['civil-unions', 'civil-partnerships', 'same-sex-relationships'],
  adoption: ['same-sex-adoption', 'adoption-family', 'adoption'],
  'gender-recognition': [
    'legal-gender-recognition',
    'gender-recognition-laws',
    'gender-marker',
    'self-id',
  ],
  'conversion-therapy': ['conversion-therapy'],
  intersex: ['intersex-rights', 'intersex', 'bodily-autonomy'],
};

export function newsTagsForRight(topic: RightTopic | string): readonly string[] {
  const slug = typeof topic === 'string' ? topic : topic.slug;
  return RIGHTS_NEWS_TAGS[slug] ?? [];
}

export function rightFromNewsParam(value: string | null | undefined): RightTopic | null {
  return value ? (topicBySlug(value) ?? null) : null;
}

/** Exposed for contract tests and archive option rendering. */
export const RIGHTS_WITH_NEWS = RIGHT_TOPICS.filter((topic) => newsTagsForRight(topic).length > 0);
