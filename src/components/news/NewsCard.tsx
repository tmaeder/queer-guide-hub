import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { Share2, BookOpen } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { shareOrCopy, articleShareUrl, estimateReadingTime } from '@/lib/share';
import type { Tables } from '@/integrations/supabase/types';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { useState, useMemo } from 'react';
import { decodeHtmlEntities, cleanAuthor, cleanExcerpt } from '@/utils/htmlDecode';
import { getRandomFallbackImage } from '@/utils/fallbackImages';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import type { EntityImageAsset } from '@/hooks/useEntityImageAssets';
import { safeText } from '@/utils/safeDisplay';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import type { NewsCategory } from '@/hooks/useNews';

type NewsArticle = Tables<'news_articles'> & {
  news_sources?: Tables<'news_sources'>;
};

const NewsCardFixture = () => (
  <Card>
    <CardHeader style={{ flexDirection: 'column' }} className="flex gap-2">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground">Politics · Source · 2h ago</p>
      <h3 className="text-base font-semibold leading-tight">Sample News Headline</h3>
    </CardHeader>
    <CardContent style={{ flexDirection: 'column' }} className="flex gap-2">
      <p className="text-sm text-muted-foreground">A sample excerpt for the news article.</p>
    </CardContent>
  </Card>
);

interface NewsCardProps {
  article?: NewsArticle;
  loading?: boolean;
  onViewArticle?: (articleId: string) => void;
  onFilterByTag?: (tag: string) => void;
  onFilterBySource?: (sourceId: string, sourceName: string) => void;
  onFilterByCategory?: (category: string) => void;
  onFilterByAuthor?: (author: string) => void;
  showFullContent?: boolean;
  cityNames?: Record<string, string>;
  countryNames?: Record<string, string>;
  sourcesMap?: Record<string, { id: string; name: string; url?: string }>;
  tags?: string[];
  categoriesMap?: Record<string, NewsCategory>;
  variant?: 'default' | 'headline' | 'featured' | 'compact';
  priority?: boolean;
  hideDate?: boolean;
  density?: 'comfortable' | 'compact';
  imageAsset?: EntityImageAsset;
}

const buildShareHandler = (slug: string, title: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  void shareOrCopy({ title, url: articleShareUrl(slug) });
};

const HIDDEN_CATEGORY_VALUES = new Set(['general', 'rss-news', 'rss_news']);
const isHiddenCategory = (v?: string | null) =>
  !v || HIDDEN_CATEGORY_VALUES.has(String(v).toLowerCase());

export const NewsCard = ({
  article,
  loading = false,
  onViewArticle: _onViewArticle,
  onFilterByTag: _onFilterByTag,
  onFilterBySource: _onFilterBySource,
  onFilterByCategory: _onFilterByCategory,
  onFilterByAuthor: _onFilterByAuthor,
  showFullContent: _showFullContent = false,
  cityNames: _cityNames = {},
  countryNames: _countryNames = {},
  sourcesMap = {},
  tags = [],
  categoriesMap = {},
  variant = 'default',
  priority = false,
  hideDate = false,
  density = 'comfortable',
  imageAsset,
}: NewsCardProps) => {
  const navigate = useLocalizedNavigate();
  const [imgFailed, setImgFailed] = useState(false);
  const fallbackSrc = useMemo(() => getRandomFallbackImage(), []);

  if (loading || !article) {
    return (
      <Skeleton
        name="news-card"
        loading={true}
        fixture={<NewsCardFixture />}
        fallback={<PageLoadingState count={1} />}
      >
        <div />
      </Skeleton>
    );
  }

  const publisherName = safeText((article as Record<string, unknown>).publisher_name);
  const sourceFallback = safeText(sourcesMap[article.source_id]?.name);
  const displaySource = publisherName || sourceFallback;

  const getCategoryLabel = (category: string) => {
    const catEntry = Object.values(categoriesMap).find(
      (c) => c.slug === category || c.name.toLowerCase() === category.toLowerCase(),
    );
    if (catEntry) return catEntry.name;
    return category?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const authorName = safeText(cleanAuthor(safeText(article.author)));
  const excerptText = safeText(cleanExcerpt(safeText(article.excerpt)));
  const safeTitle = safeText(decodeHtmlEntities(safeText(article.title)));
  const articleAny = article as Record<string, unknown>;
  const canonical =
    typeof articleAny.category_canonical === 'string'
      ? (articleAny.category_canonical as string)
      : null;
  const displayCategory = !isHiddenCategory(canonical)
    ? canonical
    : !isHiddenCategory(article.category)
      ? article.category
      : null;
  const firstUsableTag = tags.find((t) => !isHiddenCategory(t));
  const fallbackCategoryFromTag = !displayCategory && firstUsableTag ? firstUsableTag : null;
  const categoryDisplay = displayCategory
    ? getCategoryLabel(displayCategory)
    : fallbackCategoryFromTag;
  const isPremium = (article as Record<string, unknown>).is_premium === true;

  const resolvedSrc = resolveImageUrl({
    imageUrl: article.image_url,
    optimizedUrl: imageAsset?.optimized_url ?? null,
    thumbnailUrl: imageAsset?.thumbnail_url ?? null,
  });
  const effectiveImage = resolvedSrc && !imgFailed ? resolvedSrc : fallbackSrc;

  const readingTime = estimateReadingTime(
    article.content as string | null | undefined,
    article.excerpt,
  );
  const onShare = buildShareHandler(article.slug, safeTitle);

  const relativeDate =
    !hideDate && article.published_at
      ? formatDistanceToNow(new Date(article.published_at), { addSuffix: true })
      : null;

  const eyebrowParts = [
    categoryDisplay,
    displaySource,
    relativeDate,
    isPremium ? 'Premium' : null,
    hideDate && article.is_featured ? 'Featured' : null,
  ].filter(Boolean) as string[];

  // Headline variant: ultra-compact, no image
  if (variant === 'headline') {
    return (
      <LocalizedLink
        to={`/news/${article.slug}`}
        aria-label={safeTitle}
        className="flex items-center gap-4 py-4 px-4 transition-colors hover:bg-muted border-b border-border no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate m-0">{safeTitle}</h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 text-2xs uppercase tracking-wider text-muted-foreground">
          {eyebrowParts.map((part, i) => (
            <span key={i} className="whitespace-nowrap">
              {part}
            </span>
          ))}
        </div>
      </LocalizedLink>
    );
  }

  // Featured variant: large hero card
  if (variant === 'featured') {
    return (
      <LocalizedLink
        to={`/news/${article.slug}`}
        aria-label={safeTitle}
        className="flex flex-col md:flex-row gap-6 cursor-pointer transition-opacity hover:opacity-90 no-underline"
        style={{ color: 'inherit' }}
      >
        <div className="md:flex-[0_0_45%] rounded-container overflow-hidden">
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError is a non-interactive image lifecycle event */}
          <img
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            referrerPolicy="no-referrer"
            src={effectiveImage}
            alt={safeTitle}
            width={800}
            height={320}
            style={{ width: '100%', height: 320, objectFit: 'cover' }}
            className="block"
            onError={() => setImgFailed(true)}
          />
        </div>
        <div className="flex-1 flex flex-col justify-center gap-2">
          {eyebrowParts.length > 0 && (
            <p className="text-2xs uppercase tracking-wider text-muted-foreground">
              {eyebrowParts.join(' · ')}
            </p>
          )}
          <h3 className="text-2xl font-bold leading-tight m-0">{safeTitle}</h3>
          {excerptText && (
            <p
              className="text-sm text-muted-foreground overflow-hidden"
              style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}
            >
              {excerptText}
            </p>
          )}
          <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-muted-foreground">
            {authorName && <span>By {authorName}</span>}
            {readingTime !== null && (
              <span className="inline-flex items-center gap-1">
                <BookOpen size={12} aria-hidden="true" /> {readingTime} min
              </span>
            )}
            <button
              type="button"
              onClick={onShare}
              aria-label={`Share ${safeTitle}`}
              className="ml-auto inline-flex items-center justify-center rounded-element p-1 hover:bg-muted text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ height: 28, width: 28 }}
            >
              <Share2 size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </LocalizedLink>
    );
  }

  // Compact list variant: thumbnail left, text right
  if (variant === 'compact') {
    return (
      <LocalizedLink
        to={`/news/${article.slug}`}
        aria-label={safeTitle}
        className="flex gap-4 p-4 rounded-container border border-border hover:bg-muted no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          src={effectiveImage}
          alt=""
          role="presentation"
          width={160}
          height={120}
          className="rounded-element shrink-0"
          style={{ width: 160, height: 120, objectFit: 'cover' }}
          onError={() => setImgFailed(true)}
        />
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          {eyebrowParts.length > 0 && (
            <p className="text-2xs uppercase tracking-wider text-muted-foreground truncate">
              {eyebrowParts.join(' · ')}
            </p>
          )}
          <h3
            className="text-base font-semibold leading-snug m-0 overflow-hidden"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
          >
            {safeTitle}
          </h3>
          {excerptText && (
            <p
              className="text-sm text-muted-foreground overflow-hidden"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
            >
              {excerptText}
            </p>
          )}
          <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-muted-foreground mt-auto">
            {readingTime !== null && <span>{readingTime} min</span>}
            <button
              type="button"
              onClick={onShare}
              aria-label={`Share ${safeTitle}`}
              className="ml-auto inline-flex items-center justify-center rounded-element p-1 hover:bg-muted text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ height: 24, width: 24 }}
            >
              <Share2 size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      </LocalizedLink>
    );
  }

  // Default card variant
  return (
    <CardHoverEffect>
      <Card
        className="group transition-colors duration-300 hover:border-foreground/40 cursor-pointer"
        style={{ borderColor: 'hsl(var(--border))' }}
        onClick={() => navigate(`/news/${article.slug}`)}
      >
        <CardHeader style={{ flexDirection: 'column' }} className="flex gap-2 p-0">
          <div className="relative overflow-hidden rounded-container rounded-b-none">
            <img
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              decoding="async"
              referrerPolicy="no-referrer"
              role="presentation"
              src={effectiveImage}
              alt={safeTitle}
              width={400}
              height={density === 'compact' ? 140 : 192}
              style={{
                width: '100%',
                height: density === 'compact' ? 140 : 192,
                objectFit: 'cover',
                display: 'block',
              }}
              onError={() => setImgFailed(true)}
            />
          </div>
        </CardHeader>

        <CardContent style={{ flexDirection: 'column' }} className="flex gap-2 p-6">
          {eyebrowParts.length > 0 && (
            <p className="text-2xs uppercase tracking-wider text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
              {eyebrowParts.join(' · ')}
            </p>
          )}

          <h3
            className="font-semibold m-0 text-base leading-tight overflow-hidden"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
          >
            {safeTitle}
          </h3>

          {excerptText && (
            <p
              className="text-sm text-muted-foreground overflow-hidden"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
            >
              {excerptText}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-muted-foreground min-w-0">
              {readingTime !== null && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <BookOpen size={12} aria-hidden="true" /> {readingTime} min
                </span>
              )}
              {authorName && (
                <span className="truncate">By {authorName}</span>
              )}
            </div>

            <div
              className="flex items-center gap-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
              <FavoriteButton itemId={article.id} type="news" />
              <button
                type="button"
                onClick={onShare}
                aria-label={`Share ${safeTitle}`}
                className="inline-flex items-center justify-center rounded-element p-1 hover:bg-muted text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ height: 28, width: 28 }}
              >
                <Share2 size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </CardHoverEffect>
  );
};
