import { OccurrenceList } from '@/components/transit/OccurrenceList';
import { newsRows } from '@/components/transit/entityRows';
import type { ArticleRelation } from './types';

export interface CityNewsTabProps {
  articles: ArticleRelation[];
  locale: string;
  openLabel: string;
}

/**
 * Rule 2: no empty state. The old version rendered "No news available — check
 * back later" for every city with no coverage, which is 2,200 of 3,070. The
 * page now simply has no news section for those.
 *
 * Dated headline rows rather than a card grid: six `NewsCard`s cost 1,273px on
 * Berlin for six photographs and six excerpts, and a city page's news module
 * is context — the feed itself is one link away. Same module, same helper and
 * same `floodFirst={false}` as the country single, so the two pages read alike.
 */
export function CityNewsTab({ articles, locale, openLabel }: CityNewsTabProps) {
  const rows = newsRows(articles, { locale, openLabel, limit: 5 });
  if (rows.length === 0) return null;
  return <OccurrenceList occurrences={rows} floodFirst={false} />;
}
