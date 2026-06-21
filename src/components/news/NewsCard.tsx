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
import { formatNewsTag } from '@/lib/newsTags';
import { resolvePublisherName } from '@/lib/publisherName';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import type { NewsCategory } from '@/hooks/useNews';
import { useTranslation } from 'react-i18next';
import { localizedNewsTitle } from '@/lib/newsTitle';
import { ContentLangBadge } from '@/components/i18n/ContentLangBadge';

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
  variant?: 'default' | 'headline' | 'featured' | 'compact' | 'lead' | 'section-hero';
  priority?: boolean;
  hideDate?: boolean;
  density?: 'comfortable' | 'compact';
  imageAsset?: EntityImageAsset;
}

// Pull the first sentence of an excerpt to use as a magazine-style "dek".
// Falls back to the whole excerpt if no sentence boundary is found within 180 chars.
const extractDek = (excerpt: string): string => {
  if (!excerpt) return '';
  const trimmed = excerpt.trim();
  const match = trimmed.match(/^(.+?[.!?])(\s|$)/);
  if (match && match[1].length <= 180) return match[1];
  return trimmed.length > 180 ? trimmed.slice(0, 180).trimEnd() + '…' : trimmed;
};

// Dot pulses next to the timestamp for articles published in the last 60min.
const RECENCY_WINDOW_MS = 60 * 60 * 1000;
const isFreshArticle = (publishedAt: string | null | undefined): boolean => {
  if (!publishedAt) return false;
  return Date.now() - new Date(publishedAt).getTime() < RECENCY_WINDOW_MS;
};

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
  const { i18n } = useTranslation();
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

  const displaySource = resolvePublisherName({
    publisherName: safeText((article as Record<string, unknown>).publisher_name),
    url: safeText(article.url),
    sourceName: safeText(sourcesMap[article.source_id]?.name),
  });

  const getCategoryLabel = (category: string) => {
    const catEntry = Object.values(categoriesMap).find(
      (c) => c.slug === category || c.name.toLowerCase() === category.toLowerCase(),
    );
    if (catEntry) return catEntry.name;
    return category?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const authorName = safeText(cleanAuthor(safeText(article.author)));
  const excerptText = safeText(cleanExcerpt(safeText(article.excerpt)));
  const articleAny = article as Record<string, unknown>;
  const localizedTitle = localizedNewsTitle(
    {
      title: article.title,
      title_i18n: articleAny.title_i18n as Record<string, string> | null | undefined,
    },
    i18n.language,
  );
  const safeTitle = safeText(decodeHtmlEntities(safeText(localizedTitle)));
  const contentLanguage = (articleAny.content_language as string | null | undefined) ?? null;
  // Authoritative language badge — renders nothing when the article language
  // matches the UI locale or is unknown. Flags untranslated foreign cards.
  const langBadge = <ContentLangBadge language={contentLanguage} text={article.title} />;
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
  const fallbackCategoryFromTag =
    !displayCategory && firstUsableTag ? formatNewsTag(firstUsableTag) : null;
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
  const fresh = isFreshArticle(article.published_at);
  const dek = excerptText ? extractDek(excerptText) : '';

  const eyebrowParts = [
    categoryDisplay,
    displaySource,
    relativeDate,
    isPremium ? 'Premium' : null,
    hideDate && article.is_featured ? 'Featured' : null,
  ].filter(Boolean) as string[];

  // Lead variant: full-bleed magazine hero. Title at --text-hero-xl, dek with
  // drop cap, byline row beneath. Image fills the container with a quiet
  // black scrim to keep the title legible. Single CTA: open the article.
  if (variant === 'lead') {
    return (
      <LocalizedLink
        to={`/news/${article.slug}`}
        aria-label={safeTitle}
        className="group block relative overflow-hidden rounded-container no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative w-full aspect-[16/9] md:aspect-[21/9] overflow-hidden bg-muted">
          <img
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            referrerPolicy="no-referrer"
            src={effectiveImage}
            alt=""
            role="presentation"
            width={1600}
            height={900}
            className="block w-full h-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            onError={() => setImgFailed(true)}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent"
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 text-background">
          {eyebrowParts.length > 0 && (
            <p className="text-2xs uppercase tracking-wider opacity-90 flex items-center gap-2">
              {fresh && (
                <span
                  aria-hidden="true"
                  className="inline-block w-1.5 h-1.5 rounded-full bg-background animate-pulse motion-reduce:animate-none"
                />
              )}
              {eyebrowParts.join(' · ')}
            </p>
          )}
          <h2 className="m-0 mt-2 text-display md:text-hero font-bold leading-[0.95] tracking-tight max-w-4xl">
            {safeTitle}
          </h2>
          {langBadge}
          {dek && (
            <p className="news-lead-dek mt-4 max-w-2xl text-base md:text-lg italic leading-snug opacity-95">
              {dek}
            </p>
          )}
          <div className="mt-6 flex items-center gap-4 text-2xs uppercase tracking-wider opacity-90">
            {authorName && <span>By {authorName}</span>}
            {readingTime !== null && (
              <span className="inline-flex items-center gap-1">
                <BookOpen size={12} aria-hidden="true" /> {readingTime} min read
              </span>
            )}
          </div>
        </div>
      </LocalizedLink>
    );
  }

  // Section-hero variant: asymmetric text-left / image-right. Used as the
  // first card inside each <SectionBand/>. Title at --text-headline-lg,
  // italic dek beneath, byline + read-time row.
  if (variant === 'section-hero') {
    return (
      <LocalizedLink
        to={`/news/${article.slug}`}
        aria-label={safeTitle}
        className="group grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-container"
      >
        <div className="md:col-span-7 flex flex-col justify-center gap-4">
          {eyebrowParts.length > 0 && (
            <p className="text-2xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              {fresh && (
                <span
                  aria-hidden="true"
                  className="inline-block w-1.5 h-1.5 rounded-full bg-foreground animate-pulse motion-reduce:animate-none"
                />
              )}
              {eyebrowParts.join(' · ')}
            </p>
          )}
          <h3 className="m-0 text-headline md:text-headline-lg font-bold leading-[1.05] tracking-tight">
            {safeTitle}
          </h3>
          {langBadge}
          {dek && (
            <p className="text-15 italic text-muted-foreground leading-relaxed">{dek}</p>
          )}
          <div className="flex items-center gap-4 text-2xs uppercase tracking-wider text-muted-foreground mt-2">
            {authorName && <span>By {authorName}</span>}
            {readingTime !== null && (
              <span className="inline-flex items-center gap-1">
                <BookOpen size={12} aria-hidden="true" /> {readingTime} min
              </span>
            )}
          </div>
        </div>
        <div className="md:col-span-5 overflow-hidden rounded-container bg-muted">
          <img
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            referrerPolicy="no-referrer"
            src={effectiveImage}
            alt=""
            role="presentation"
            width={800}
            height={600}
            className="block w-full h-full object-cover aspect-[4/3] transition-transform duration-[600ms] ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            onError={() => setImgFailed(true)}
          />
        </div>
      </LocalizedLink>
    );
  }

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
          {langBadge}
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
          {langBadge}
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
          {langBadge}
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
          {langBadge}

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
