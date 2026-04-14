import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Eye, Clock, MapPin, Tag, Newspaper } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Tables } from '@/integrations/supabase/types';
import { Link, useNavigate } from 'react-router';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { decodeHtmlEntities, cleanAuthor, cleanExcerpt } from '@/utils/htmlDecode';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import type { NewsCategory } from '@/hooks/useNews';

type NewsArticle = Tables<'news_articles'> & {
  news_sources?: Tables<'news_sources'>;
};

const NewsCardFixture = () => (
  <Card>
    <CardHeader style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.125rem' }}>Sample News Headline</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Badge style={{ backgroundColor: '#1a73e8', color: '#fff' }}>Politics</Badge>
        <Badge variant="outline" style={{ fontSize: '0.75rem' }}>Source</Badge>
      </Box>
    </CardHeader>
    <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Typography variant="body2">A sample excerpt for the news article.</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Clock style={{ height: 14, width: 14 }} />
          <Typography variant="caption">2 hours ago</Typography>
        </Box>
      </Box>
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
  variant?: 'default' | 'headline' | 'featured';
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
}: NewsCardProps) => {
  const navigate = useNavigate();
  const [imgFailed, setImgFailed] = useState(false);

  if (loading || !article) {
    return (
      <Skeleton name="news-card" loading={true} fixture={<NewsCardFixture />} fallback={<PageLoadingState count={1} />}>
        <div />
      </Skeleton>
    );
  }

  // Resolve display name: publisher_name (for API sources) → source name (for RSS)
  const publisherName = (article as Record<string, unknown>).publisher_name as string | null;
  const sourceFallback = sourcesMap[article.source_id]?.name || 'Unknown';
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

  const authorName = cleanAuthor(article.author || '');
  const excerptText = cleanExcerpt(article.excerpt || '');
  const displayCategory = article.category !== 'general' ? article.category : null;
  const fallbackCategoryFromTag = !displayCategory && tags.length > 0 ? tags[0] : null;
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
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 2, py: 1.5, px: 2,
          cursor: 'pointer', transition: 'background 0.15s',
          '&:hover': { bgcolor: 'action.hover' },
          borderBottom: '1px solid', borderColor: 'divider',
        }}
        onClick={() => navigate(`/news/${article.slug}`)}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {decodeHtmlEntities(article.title)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {displayCategory && (
            <Badge
              style={{ backgroundColor: getCategoryColor(displayCategory), color: '#fff', fontSize: '0.65rem', padding: '1px 6px' }}
            >
              {getCategoryLabel(displayCategory)}
            </Badge>
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {displaySource}
          </Typography>
          {article.published_at && (
            <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
            </Typography>
          )}
        </Box>
      </Box>
    );
  }

  // Featured variant: large hero card
  if (variant === 'featured') {
    return (
      <Box
        sx={{
          display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3,
          cursor: 'pointer', transition: 'all 0.2s',
          '&:hover': { opacity: 0.9 },
        }}
        onClick={() => navigate(`/news/${article.slug}`)}
      >
        {hasImage && (
          <Box sx={{ flex: { md: '0 0 45%' }, borderRadius: 2, overflow: 'hidden' }}>
            <img
              loading="lazy"
              referrerPolicy="no-referrer"
              src={article.image_url!}
              alt={decodeHtmlEntities(article.title)}
              style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block' }}
              onError={() => setImgFailed(true)}
            />
          </Box>
        )}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {displayCategory && (
              <Badge style={{ backgroundColor: getCategoryColor(displayCategory), color: '#fff' }}>
                {getCategoryLabel(displayCategory)}
              </Badge>
            )}
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{displaySource}</Typography>
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {decodeHtmlEntities(article.title)}
          </Typography>
          {excerptText && (
            <Typography variant="body2" sx={{ color: 'text.secondary', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {excerptText}
            </Typography>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, color: 'text.secondary' }}>
            {authorName && <Typography variant="caption">By {authorName}</Typography>}
            {article.published_at && (
              <Typography variant="caption">
                {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  // Default card variant
  return (
    <Card
      style={{
        boxShadow: 'var(--shadow-card)',
        transition: 'all 0.3s',
        borderColor: 'rgba(var(--border-rgb, 0,0,0), 0.5)',
        cursor: 'pointer',
      }}
      onClick={() => navigate(`/news/${article.slug}`)}
    >
      <CardHeader style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Image — only render if article has one */}
        {hasImage && (
          <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2 }}>
            <img
              loading="lazy"
              referrerPolicy="no-referrer"
              role="presentation"
              src={article.image_url!}
              alt={decodeHtmlEntities(article.title)}
              style={{ width: '100%', height: 192, objectFit: 'cover', transition: 'transform 0.3s' }}
              onError={() => setImgFailed(true)}
            />
            {article.is_featured && (
              <Badge style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#333', color: '#fff' }}>
                Featured
              </Badge>
            )}
          </Box>
        )}

        {/* Featured badge when no image */}
        {!hasImage && article.is_featured && (
          <Badge style={{ backgroundColor: '#333', color: '#fff', alignSelf: 'flex-start' }}>
            Featured
          </Badge>
        )}

        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600, fontSize: '1.125rem',
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {decodeHtmlEntities(article.title)}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {displayCategory && (
            <Badge
              style={{
                backgroundColor: getCategoryColor(displayCategory),
                color: '#ffffff', textTransform: 'capitalize',
                cursor: onFilterByCategory ? 'pointer' : 'default',
              }}
              onClick={(e) => { e.stopPropagation(); onFilterByCategory?.(displayCategory); }}
            >
              {getCategoryLabel(displayCategory)}
            </Badge>
          )}
          {!displayCategory && fallbackCategoryFromTag && (
            <Badge
              style={{ backgroundColor: '#64748b', color: '#fff', cursor: onFilterByCategory ? 'pointer' : 'default' }}
              onClick={(e) => { e.stopPropagation(); onFilterByCategory?.(fallbackCategoryFromTag); }}
            >
              {fallbackCategoryFromTag}
            </Badge>
          )}
          {/* Source badge with external link */}
          <Badge
            variant="outline"
            role="button"
            tabIndex={0}
            style={{ fontSize: '0.75rem', cursor: onFilterBySource ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={(e) => {
              e.stopPropagation();
              const src = sourcesMap[article.source_id];
              if (onFilterBySource && src?.id) onFilterBySource(src.id, displaySource);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); e.stopPropagation();
                const src = sourcesMap[article.source_id];
                if (onFilterBySource && src?.id) onFilterBySource(src.id, displaySource);
              }
            }}
          >
            {displaySource}
          </Badge>
          {/* Subtle external link icon */}
          <Box
            component="a"
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onViewArticle?.(article.id);
            }}
            sx={{
              display: 'inline-flex', alignItems: 'center', color: 'text.secondary',
              opacity: 0.5, '&:hover': { opacity: 1 }, transition: 'opacity 0.2s',
            }}
            title="Open original article"
          >
            <ExternalLink style={{ height: 14, width: 14 }} />
          </Box>
        </Box>
      </CardHeader>

      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {excerptText && (
          <Typography
            variant="body2"
            sx={{
              color: 'var(--muted-foreground)',
              display: '-webkit-box', WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {excerptText}
          </Typography>
        )}

        {/* Meta row: date, views, author */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {article.published_at && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Clock style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
              </Typography>
            </Box>
          )}
          {article.views_count > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Eye style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                {article.views_count} view{article.views_count !== 1 ? 's' : ''}
              </Typography>
            </Box>
          )}
          {authorName && (
            <Typography
              variant="caption"
              sx={{
                color: 'var(--muted-foreground)',
                cursor: onFilterByAuthor ? 'pointer' : 'default',
                '&:hover': onFilterByAuthor ? { color: 'var(--primary)' } : {},
              }}
              onClick={(e) => { e.stopPropagation(); onFilterByAuthor?.(authorName); }}
            >
              By {authorName}
            </Typography>
          )}
        </Box>

        {showFullContent && article.content && (
          <Box sx={{ maxWidth: 'none', color: 'var(--foreground)' }} />
        )}

        {/* Tags */}
        {(() => {
          const displayTags = tags.filter((t) => t !== fallbackCategoryFromTag);
          if (displayTags.length === 0) return null;
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
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
            </Box>
          );
        })()}

        {/* Location */}
        {hasLocation && (
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <MapPin style={{ height: 14, width: 14, flexShrink: 0 }} />
            {linkedCities.map((city: { id: string; name: string | undefined; slug?: string }, i: number) => (
              <span key={city.id}>
                <Link to={`/city/${city.slug || city.id}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                  {city.name}
                </Link>
                {(i < linkedCities.length - 1 || linkedCountries.length > 0) && ', '}
              </span>
            ))}
            {linkedCountries.map((country: { id: string; name: string | undefined; slug?: string }, i: number) => (
              <span key={country.id}>
                <Link to={`/country/${country.slug || country.id}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                  {country.name}
                </Link>
                {i < linkedCountries.length - 1 && ', '}
              </span>
            ))}
          </Box>
        )}

        {/* Favorite button — no more "Read Full Article" button */}
        <Box sx={{ display: 'flex', alignItems: 'center', pt: 0.5 }} onClick={(e) => e.stopPropagation()}>
          <FavoriteButton itemId={article.id} type="news" />
        </Box>
      </CardContent>
    </Card>
  );
};
