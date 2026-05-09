import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Eye, Clock, MapPin, Tag, Lock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Tables } from '@/integrations/supabase/types';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { useState } from 'react';
import { decodeHtmlEntities, cleanAuthor, cleanExcerpt } from '@/utils/htmlDecode';
import { safeText } from '@/utils/safeDisplay';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import type { NewsCategory } from '@/hooks/useNews';

type NewsArticle = Tables<'news_articles'> & {
  news_sources?: Tables<'news_sources'>;
};

const NewsCardFixture = () => (
  <Card>
    <CardHeader style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 className="text-base font-semibold" style={{ fontSize: '1.125rem' }}>Sample News Headline</h3>
      <div className="flex items-center gap-2">
        <Badge style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}>Politics</Badge>
        <Badge variant="outline" style={{ fontSize: '0.75rem' }}>Source</Badge>
      </div>
    </CardHeader>
    <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="text-sm">A sample excerpt for the news article.</p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Clock style={{ height: 14, width: 14 }} />
          <span className="text-xs">2 hours ago</span>
        </div>
      </div>
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
}

export const NewsCard = ({
  article,
  loading = false,
  onViewArticle,
  onFilterByTag,
  onFilterBySource,
  onFilterByCategory,
  onFilterByAuthor,
  showFullContent = false,
  cityNames = {},
  countryNames = {},
  sourcesMap = {},
  tags = [],
  categoriesMap = {},
  variant = 'default',
  priority = false,
  hideDate = false,
}: NewsCardProps) => {
  const navigate = useLocalizedNavigate();
  const [imgFailed, setImgFailed] = useState(false);

  if (loading || !article) {
    return (
      <Skeleton name="news-card" loading={true} fixture={<NewsCardFixture />} fallback={<PageLoadingState count={1} />}>
        <div />
      </Skeleton>
    );
  }

  const publisherName = safeText((article as Record<string, unknown>).publisher_name);
  const sourceFallback = safeText(sourcesMap[article.source_id]?.name);
  const displaySource = publisherName || sourceFallback;

  const getCategoryColor = (category: string) => {
    const catEntry = Object.values(categoriesMap).find(
      c => c.slug === category || c.name.toLowerCase() === category.toLowerCase()
    );
    if (catEntry) return catEntry.color;
    const fallback: Record<string, string> = {
      politics: '#3b82f6', 'human-rights': '#ef4444', entertainment: '#8b5cf6',
      culture: '#8b5cf6', health: '#10b981', sports: '#f97316', business: '#f59e0b',
      technology: '#6366f1', lifestyle: '#ec4899', education: '#06b6d4',
      legislation: '#3b82f6', transgender: '#8b5cf6', rights: '#ef4444',
      advocacy: '#f97316', news: '#64748b', community: '#ec4899',
    };
    return fallback[category?.toLowerCase()] || '#64748b';
  };

  const getCategoryLabel = (category: string) => {
    const catEntry = Object.values(categoriesMap).find(
      c => c.slug === category || c.name.toLowerCase() === category.toLowerCase()
    );
    if (catEntry) return catEntry.name;
    return category?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const authorName = safeText(cleanAuthor(safeText(article.author)));
  const excerptText = safeText(cleanExcerpt(safeText(article.excerpt)));
  const safeTitle = safeText(decodeHtmlEntities(safeText(article.title)));
  const HIDDEN_CATEGORY_VALUES = new Set(['general', 'rss-news', 'rss_news']);
  const isHiddenCategory = (v?: string | null) =>
    !v || HIDDEN_CATEGORY_VALUES.has(String(v).toLowerCase());
  // Prefer canonical category from the news_qa_backfill_category_canonical
  // migration; fall back to the legacy `category` text column.
  const articleAny = article as Record<string, unknown>;
  const canonical = typeof articleAny.category_canonical === 'string' ? (articleAny.category_canonical as string) : null;
  const displayCategory = !isHiddenCategory(canonical)
    ? canonical
    : !isHiddenCategory(article.category)
      ? article.category
      : null;
  const firstUsableTag = tags.find((t) => !isHiddenCategory(t));
  const fallbackCategoryFromTag = !displayCategory && firstUsableTag ? firstUsableTag : null;
  const hasImage = article.image_url && !imgFailed;

  const linkedCities = (article.city_ids || [])
    .map((id: string) => ({ id, name: cityNames[id] }))
    .filter((c: { id: string; name: string | undefined }) => c.name);
  const linkedCountries = (article.country_ids || [])
    .map((id: string) => ({ id, name: countryNames[id] }))
    .filter((c: { id: string; name: string | undefined }) => c.name);
  const hasLocation = linkedCities.length > 0 || linkedCountries.length > 0;

  // Headline variant: ultra-compact, no image
  if (variant === 'headline') {
    return (
      <LocalizedLink
        to={`/news/${article.slug}`}
        aria-label={safeTitle}
        className="flex items-center gap-4 py-3 px-4 transition-colors hover:bg-muted border-b border-border no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate m-0">
            {safeTitle}
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {displayCategory && (
            <Badge
              style={{ backgroundColor: getCategoryColor(displayCategory), color: 'hsl(var(--background))', fontSize: '0.65rem', padding: '1px 6px' }}
            >
              {getCategoryLabel(displayCategory)}
            </Badge>
          )}
          {displaySource && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {displaySource}
            </span>
          )}
          {!hideDate && article.published_at && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
            </span>
          )}
          {hideDate && article.is_featured && (
            <span className="text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">
              Featured
            </span>
          )}
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
        className="flex flex-col md:flex-row gap-6 cursor-pointer transition-opacity hover:opacity-90"
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        {hasImage && (
          <div className="md:flex-[0_0_45%] rounded-lg overflow-hidden">
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError is a non-interactive image lifecycle event */}
            <img
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              decoding="async"
              referrerPolicy="no-referrer"
              src={article.image_url!}
              alt={safeTitle}
              width={800}
              height={240}
              style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block' }}
              onError={() => setImgFailed(true)}
            />
          </div>
        )}
        <div className="flex-1 flex flex-col justify-center gap-3">
          <div className="flex items-center gap-2">
            {displayCategory && (
              <Badge style={{ backgroundColor: getCategoryColor(displayCategory), color: 'hsl(var(--background))' }}>
                {getCategoryLabel(displayCategory)}
              </Badge>
            )}
            {displaySource && (
              <span className="text-xs text-muted-foreground">{displaySource}</span>
            )}
          </div>
          <h3 className="text-xl font-bold leading-tight">
            {safeTitle}
          </h3>
          {excerptText && (
            <p className="text-sm text-muted-foreground" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {excerptText}
            </p>
          )}
          <div className="flex items-center gap-4 text-muted-foreground">
            {authorName && <span className="text-xs">By {authorName}</span>}
            {!hideDate && article.published_at && (
              <span className="text-xs">
                {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
              </span>
            )}
            {hideDate && article.is_featured && (
              <span className="text-xs uppercase tracking-wide">Featured</span>
            )}
          </div>
        </div>
      </LocalizedLink>
    );
  }

  // Compact list variant: thumbnail left, text right (F5)
  if (variant === 'compact') {
    return (
      <LocalizedLink
        to={`/news/${article.slug}`}
        aria-label={safeTitle}
        className="flex gap-3 p-3 rounded-md border border-border hover:bg-muted no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {hasImage ? (
          <img
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            src={article.image_url!}
            alt=""
            width={160}
            height={120}
            style={{ width: 160, height: 120, objectFit: 'cover', flexShrink: 0, borderRadius: 6 }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{ width: 160, height: 120, flexShrink: 0, borderRadius: 6, background: 'hsl(var(--muted))' }}
          />
        )}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {displayCategory && (
              <Badge style={{ backgroundColor: getCategoryColor(displayCategory), color: 'hsl(var(--background))', fontSize: '0.65rem', padding: '1px 6px' }}>
                {getCategoryLabel(displayCategory)}
              </Badge>
            )}
            {(article as Record<string, unknown>).is_premium === true && (
              <Badge style={{ backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', padding: '1px 6px' }}>
                <Lock style={{ height: 9, width: 9 }} aria-hidden="true" /> Premium
              </Badge>
            )}
            {displaySource && (
              <span className="text-xs text-muted-foreground truncate">{displaySource}</span>
            )}
          </div>
          <h3 className="text-base font-semibold leading-snug m-0" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {safeTitle}
          </h3>
          {excerptText && (
            <p className="text-sm text-muted-foreground" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {excerptText}
            </p>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
            {authorName && <span>By {authorName}</span>}
            {!hideDate && article.published_at && (
              <span>{formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}</span>
            )}
          </div>
        </div>
      </LocalizedLink>
    );
  }

  // Default card variant
  return (
    <Card
      style={{
        boxShadow: 'var(--shadow-card)',
        transition: 'all 0.3s',
        borderColor: 'hsl(var(--border))',
        cursor: 'pointer',
      }}
      onClick={() => navigate(`/news/${article.slug}`)}
    >
      <CardHeader style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {hasImage && (
          <div className="relative overflow-hidden rounded-lg">
            <img
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              role="presentation"
              src={article.image_url!}
              alt={safeTitle}
              width={400}
              height={192}
              style={{ width: '100%', height: 192, objectFit: 'cover', transition: 'transform 0.3s' }}
              onError={() => setImgFailed(true)}
            />
            {(article as Record<string, unknown>).is_premium === true && (
              <Badge style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Lock style={{ height: 10, width: 10 }} aria-hidden="true" /> Premium
              </Badge>
            )}
            {article.is_featured && (
              <Badge style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                Featured
              </Badge>
            )}
          </div>
        )}

        {!hasImage && (article as Record<string, unknown>).is_premium === true && (
          <Badge style={{ backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Lock style={{ height: 10, width: 10 }} aria-hidden="true" /> Premium
          </Badge>
        )}
        {!hasImage && article.is_featured && (
          <Badge style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', alignSelf: 'flex-start' }}>
            Featured
          </Badge>
        )}

        <div className="flex items-start justify-between gap-3">
          <h3
            className="font-semibold m-0"
            style={{
              fontSize: '1.125rem',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {safeTitle}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {displayCategory && (
            <Badge
              style={{
                backgroundColor: getCategoryColor(displayCategory),
                color: 'hsl(var(--background))', textTransform: 'capitalize',
                cursor: onFilterByCategory ? 'pointer' : 'default',
              }}
              onClick={(e) => { e.stopPropagation(); onFilterByCategory?.(displayCategory); }}
            >
              {getCategoryLabel(displayCategory)}
            </Badge>
          )}
          {!displayCategory && fallbackCategoryFromTag && (
            <Badge
              style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', cursor: onFilterByCategory ? 'pointer' : 'default' }}
              onClick={(e) => { e.stopPropagation(); onFilterByCategory?.(fallbackCategoryFromTag); }}
            >
              {fallbackCategoryFromTag}
            </Badge>
          )}
          {displaySource && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs border border-border rounded-md px-2 py-0.5 bg-transparent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ cursor: onFilterBySource ? 'pointer' : 'default' }}
              onClick={(e) => {
                e.stopPropagation();
                const src = sourcesMap[article.source_id];
                if (onFilterBySource && src?.id) onFilterBySource(src.id, displaySource);
              }}
              aria-label={onFilterBySource ? `Filter by source ${displaySource}` : `Source: ${displaySource}`}
            >
              {displaySource}
            </button>
          )}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onViewArticle?.(article.id);
            }}
            className="inline-flex items-center text-muted-foreground opacity-50 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            aria-label={displaySource ? `Open original article on ${displaySource} (opens in new tab)` : 'Open original article (opens in new tab)'}
            title="Open original article"
          >
            <ExternalLink style={{ height: 14, width: 14 }} aria-hidden="true" />
          </a>
        </div>
      </CardHeader>

      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {excerptText && (
          <p
            className="text-sm text-muted-foreground"
            style={{
              display: '-webkit-box', WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {excerptText}
          </p>
        )}

        {/* Meta row: date, views, author */}
        <div className="flex flex-wrap items-center gap-4">
          {article.published_at && (
            <div className="flex items-center gap-1">
              <Clock style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
              </span>
            </div>
          )}
          {typeof article.views_count === 'number' && article.views_count > 0 && (
            <div className="flex items-center gap-1">
              <Eye style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
              <span className="text-xs text-muted-foreground">
                {article.views_count} view{article.views_count !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {authorName && (
            <span
              className="text-xs text-muted-foreground"
              style={{ cursor: onFilterByAuthor ? 'pointer' : 'default' }}
              onClick={(e) => { e.stopPropagation(); onFilterByAuthor?.(authorName); }}
            >
              By {authorName}
            </span>
          )}
        </div>

        {showFullContent && article.content && (
          <div style={{ maxWidth: 'none', color: 'var(--foreground)' }} />
        )}

        {/* Tags */}
        {(() => {
          const displayTags = tags
            .map((t) => safeText(t))
            .filter((t) => t && t !== fallbackCategoryFromTag && !isHiddenCategory(t));
          if (displayTags.length === 0) return null;
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag style={{ height: 14, width: 14, color: 'var(--muted-foreground)', flexShrink: 0 }} />
              {displayTags.slice(0, 4).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  style={{ fontSize: '0.7rem', padding: '2px 8px', cursor: onFilterByTag ? 'pointer' : 'default' }}
                  onClick={(e) => { e.stopPropagation(); onFilterByTag?.(tag); }}
                >
                  {tag}
                </Badge>
              ))}
              {displayTags.length > 4 && (
                <Badge variant="outline" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                  +{displayTags.length - 4} more
                </Badge>
              )}
            </div>
          );
        })()}

        {/* Location */}
        {hasLocation && (
          <div
            className="flex flex-wrap items-center gap-1.5 text-muted-foreground"
            style={{ fontSize: '0.8rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <MapPin style={{ height: 14, width: 14, flexShrink: 0 }} />
            {linkedCities.map((city: { id: string; name: string | undefined; slug?: string }, i: number) => (
              <span key={city.id}>
                <LocalizedLink to={`/city/${city.slug || city.id}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                  {city.name}
                </LocalizedLink>
                {(i < linkedCities.length - 1 || linkedCountries.length > 0) && ', '}
              </span>
            ))}
            {linkedCountries.map((country: { id: string; name: string | undefined; slug?: string }, i: number) => (
              <span key={country.id}>
                <LocalizedLink to={`/country/${country.slug || country.id}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                  {country.name}
                </LocalizedLink>
                {i < linkedCountries.length - 1 && ', '}
              </span>
            ))}
          </div>
        )}

        {/* Favorite button */}
        <div className="flex items-center pt-1" onClick={(e) => e.stopPropagation()}>
          <FavoriteButton itemId={article.id} type="news" />
        </div>
      </CardContent>
    </Card>
  );
};
