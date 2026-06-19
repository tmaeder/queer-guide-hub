import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TopicChip } from './TopicChip';
import { SectionBand } from '@/components/news/editorial/SectionBand';
import { Eyebrow } from '@/components/ui/Eyebrow';
import type { NewsTopic } from './NewsControlBar';
import type { NewsCategory } from '@/hooks/useNews';
import type { EntityImageAsset } from '@/hooks/useEntityImageAssets';
import type { Tables } from '@/integrations/supabase/types';

type Article = Tables<'news_articles'> & { news_sources?: Tables<'news_sources'> };
type Candidate = Record<string, unknown> & { id: string; published_at?: string | null };

const FALLBACK_WINDOW_MS = 48 * 60 * 60 * 1000;

function matchesTopic(a: Candidate, slug: string): boolean {
  const s = slug.toLowerCase();
  if (String((a.category_canonical as string) ?? '').toLowerCase() === s) return true;
  if (String((a.category as string) ?? '').toLowerCase() === s) return true;
  return ((a.tags as string[] | undefined) ?? []).some((t) => String(t).toLowerCase() === s);
}

interface TopicsBrowserProps {
  topics: NewsTopic[];
  selectedTopics: string[];
  isFollowed: (slug: string) => boolean;
  onToggleFollow: (slug: string) => void;
  onToggleFilter: (slug: string) => void;
  articles: Candidate[];
  lastVisit: (slug: string) => number | null;
  markVisited: (slug: string) => void;
  sectionCats: NewsCategory[];
  articlesByCategory: Map<string, Article[]>;
  sourcesMap?: Record<string, { id: string; name: string; url?: string }>;
  categoriesMap?: Record<string, NewsCategory>;
  assets?: Map<string, EntityImageAsset>;
}

// Browse + follow surface. A followable topic grid (with "N new since last
// visit" counters) over the editorial category SectionBands.
export function TopicsBrowser({
  topics,
  selectedTopics,
  isFollowed,
  onToggleFollow,
  onToggleFilter,
  articles,
  lastVisit,
  markVisited,
  sectionCats,
  articlesByCategory,
  sourcesMap,
  categoriesMap,
  assets,
}: TopicsBrowserProps) {
  const { t } = useTranslation();

  const counts = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- Date.now() snapshot recomputes when topics/articles/lastVisit change, the intended cadence.
    const nowMs = Date.now();
    const map: Record<string, number> = {};
    for (const topic of topics) {
      const baseline = lastVisit(topic.slug) ?? nowMs - FALLBACK_WINDOW_MS;
      map[topic.slug] = articles.filter(
        (a) =>
          a.published_at &&
          new Date(a.published_at).getTime() > baseline &&
          matchesTopic(a, topic.slug),
      ).length;
    }
    return map;
  }, [topics, articles, lastVisit]);

  return (
    <div className="flex flex-col gap-12">
      {topics.length > 0 && (
        <section aria-labelledby="follow-topics-heading">
          <Eyebrow as="p" className="mb-1">
            {t('pages.news.followTopicsEyebrow', 'Follow topics')}
          </Eyebrow>
          <h2 id="follow-topics-heading" className="m-0 mb-4 text-headline font-bold tracking-tight">
            {t('pages.news.followTopicsTitle', 'Build your feed')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <TopicChip
                key={topic.slug}
                slug={topic.slug}
                label={topic.label}
                size="lg"
                active={selectedTopics.includes(topic.slug)}
                followed={isFollowed(topic.slug)}
                count={counts[topic.slug]}
                onToggleFilter={(s) => {
                  markVisited(s);
                  onToggleFilter(s);
                }}
                onToggleFollow={onToggleFollow}
              />
            ))}
          </div>
        </section>
      )}

      {sectionCats.map((cat) => {
        const items = articlesByCategory.get(cat.slug) ?? [];
        if (items.length === 0) return null;
        return (
          <SectionBand
            key={cat.id}
            category={cat}
            articles={items}
            sourcesMap={sourcesMap}
            categoriesMap={categoriesMap}
            assets={assets}
          />
        );
      })}
    </div>
  );
}
