/**
 * Which language a guide page uses for its picks.
 *
 * Guides share one renderer, built for buying lists ("Our pick", "See the
 * picks"). A support guide (counselling, health, community services) is read
 * by someone looking for help, and shopping words there read as a product
 * ranking. Formats stay as they are (guide / list / quest); only a guide's
 * category moves it to the support voice. Quests keep their own module.
 */
export type GuideVoice = 'support' | 'shopping' | 'editorial';

const SUPPORT_CATEGORIES = new Set([
  'services',
  'support',
  'health',
  'sexual_health',
  'mental_health',
  'counselling',
  'counseling',
  'legal',
  'crisis',
]);

export function guideVoice(guide: { format: string; category?: string | null }): GuideVoice {
  const category =
    guide.category
      ?.trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_') ?? '';
  if (guide.format !== 'quest' && SUPPORT_CATEGORIES.has(category)) return 'support';
  if (guide.format === 'list' || category === 'shopping' || category === 'products') {
    return 'shopping';
  }
  return 'editorial';
}

/** Human label for a source link: its host, never "Source 1". */
export function sourceLabel(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
