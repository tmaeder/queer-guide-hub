import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Layers } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useRightsNews, type RightsNewsArticle } from '@/hooks/useRightsNews';
import { useEntityImageAssets, type EntityImageAsset } from '@/hooks/useEntityImageAssets';
import { resolveNewsImage } from '@/utils/resolveNewsImage';
import { StationPlate } from '@/components/ui/StationPlate';
import {
  RIGHT_SECTION_LABEL,
  RIGHT_SECTION_ORDER,
  topicListLabel,
  topicsInSection,
  type RightTopic,
} from '@/lib/rights/rightsCatalog';

interface RightsNewsSectionProps {
  topic: RightTopic;
  onTopicChange: (topic: RightTopic) => void;
  countryId?: string | null;
  countryName?: string | null;
}

export function RightsNewsSection({
  topic,
  onTopicChange,
  countryId,
  countryName,
}: RightsNewsSectionProps) {
  const { t } = useTranslation();
  const { data: articles = [], isLoading, error } = useRightsNews(topic, countryId, 6);
  const topicLabel = topicListLabel(topic, t);
  // The RPC's image_url is the publisher's original, which we never hotlink;
  // the mirrored asset lives in image_asset_links, same lookup as /news.
  const articleIds = useMemo(() => articles.map((a) => a.id), [articles]);
  const { assets } = useEntityImageAssets('news_article', articleIds);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-prose">
          <label
            htmlFor="rights-news-topic"
            className="text-2xs font-bold uppercase tracking-wide text-muted-foreground"
          >
            Reporting about
          </label>
          <select
            id="rights-news-topic"
            value={topic.slug}
            onChange={(event) => {
              const selected = RIGHT_SECTION_ORDER.flatMap((section) =>
                topicsInSection(section),
              ).find((candidate) => candidate.slug === event.target.value);
              if (selected) onTopicChange(selected);
            }}
            className="mt-2 block h-12 w-full cursor-pointer rounded-container bg-card px-4 text-15 font-bold text-foreground shadow-soft sm:min-w-72"
          >
            {RIGHT_SECTION_ORDER.map((section) => (
              <optgroup key={section} label={RIGHT_SECTION_LABEL[section]}>
                {topicsInSection(section).map((candidate) => (
                  <option key={candidate.slug} value={candidate.slug}>
                    {topicListLabel(candidate, t)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <p className="m-0 max-w-prose text-13 text-muted-foreground sm:text-right">
          Journalism adds current context. ILGA remains the source for the legal status above.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground" role="status">
          Loading relevant coverage…
        </p>
      ) : error ? (
        <p className="text-muted-foreground" role="alert">
          Relevant coverage is temporarily unavailable.
        </p>
      ) : articles.length === 0 ? (
        <p className="text-muted-foreground">No recent coverage matched {topicLabel}.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <RightsNewsCard
              key={article.id}
              article={article}
              asset={assets.get(article.id)}
              countryName={countryName}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One piece of coverage: photo, a single context chip, the headline, a short
 * excerpt and the byline. The image only ever comes from our mirror
 * (resolveNewsImage never hotlinks a publisher CDN); an article with no
 * mirrored photo, or one that fails to load, gets the house StationPlate —
 * the same image-less art /news uses — so the grid keeps one rhythm without
 * passing a stock texture off as a photo.
 *
 * The old "MATCHES: <topic>" eyebrow is gone: every card in this list matches
 * the topic chosen in the selector above it, so it repeated the selector six
 * times. Only the exception is labelled — broader coverage, and local news.
 */
function RightsNewsCard({
  article,
  asset,
  countryName,
}: {
  article: RightsNewsArticle;
  asset?: EntityImageAsset;
  countryName?: string | null;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const isBroader = article.relevance_tier === 'rights-general-recent';
  const isStory = article.story_article_count > 1 && article.story_slug;
  const href = isStory ? `/news/story/${article.story_slug}` : `/news/${article.slug}`;
  const src = resolveNewsImage({
    imageUrl: article.image_url,
    optimizedUrl: asset?.optimized_url ?? null,
    thumbnailUrl: asset?.thumbnail_url ?? null,
  });

  return (
    <li className="h-full">
      <LocalizedLink
        to={href}
        className="card-lift group flex h-full flex-col overflow-hidden rounded-container bg-card text-inherit no-underline shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {src && !imgFailed ? (
          <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
            <img
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              width={640}
              height={360}
              className="block h-full w-full object-cover"
              onError={() => setImgFailed(true)}
            />
          </div>
        ) : (
          <StationPlate
            theme="news"
            fallbackKey={article.id}
            className="block aspect-[16/9] w-full"
          />
        )}
        <div className="flex flex-1 flex-col gap-2 p-4">
          {isBroader || (article.is_local && countryName) ? (
            <div className="flex flex-wrap items-center gap-1">
              {isBroader ? (
                <span className="rounded-badge bg-surface-container px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                  Broader rights coverage
                </span>
              ) : null}
              {article.is_local && countryName ? (
                <span className="rounded-badge bg-foreground px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-background">
                  {countryName}
                </span>
              ) : null}
            </div>
          ) : null}
          <h3 className="m-0 line-clamp-3 text-15 font-bold leading-tight">{article.title}</h3>
          {article.excerpt ? (
            <p className="m-0 line-clamp-2 text-13 text-muted-foreground">{article.excerpt}</p>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2 text-2xs text-muted-foreground">
            {article.publisher_name ? (
              <span className="inline-flex items-center gap-1 rounded-element bg-muted px-2 py-1 font-bold text-foreground">
                {article.publisher_name}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-element bg-muted px-2 py-1">
              {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
            </span>
            {isStory ? (
              <span className="inline-flex items-center gap-1 rounded-element bg-muted px-2 py-1">
                <Layers size={12} aria-hidden="true" />
                {article.story_article_count} articles
              </span>
            ) : null}
          </div>
        </div>
      </LocalizedLink>
    </li>
  );
}
