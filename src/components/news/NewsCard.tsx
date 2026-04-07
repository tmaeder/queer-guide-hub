import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Eye, Clock, MapPin, Tag, Newspaper } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Tables } from '@/integrations/supabase/types';
import { Link, useNavigate } from 'react-router';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { decodeHtmlEntities, cleanAuthor, cleanExcerpt } from '@/utils/htmlDecode';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

type NewsArticle = Tables<'news_articles'> & {
  news_sources?: Tables<'news_sources'>;
};

const NewsCardFixture = () => (
  <Card>
    <CardHeader style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Box sx={{ width: '100%', height: 192, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: 2 }}>
        <Newspaper style={{ width: 32, height: 32 }} />
      </Box>
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}>
        <Box sx={{ width: 32, height: 32 }} />
        <Button size="sm">Read Full Article</Button>
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
  /** Pre-resolved city names for city_ids */
  cityNames?: Record<string, string>;
  /** Pre-resolved country names for country_ids */
  countryNames?: Record<string, string>;
  /** Pre-resolved sources map (source_id → {id, name, url}) */
  sourcesMap?: Record<string, { id: string; name: string; url?: string }>;
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
}: NewsCardProps) => {
  const navigate = useNavigate();
  const [tags, setTags] = useState<string[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);

  useEffect(() => {
    const fetchTags = async () => {
      if (!article?.id) return;

      setIsLoadingTags(true);
      try {
        const { data, error } = await supabase
          .from('unified_tag_assignments')
          .select('unified_tags!inner(name, color)')
          .eq('entity_type', 'news')
          .eq('entity_id', article.id);

        if (error) {
          console.warn('Failed to fetch tags for article:', error);
          return;
        }

        if (data) {
          const tagNames = data.map((item: any) => item.unified_tags.name);
          setTags(tagNames);
        }
      } catch (error) {
        console.warn('Error fetching tags:', error);
      } finally {
        setIsLoadingTags(false);
      }
    };

    fetchTags();
  }, [article?.id]);

  if (loading || !article) {
    return (
      <Skeleton name="news-card" loading={true} fixture={<NewsCardFixture />} fallback={<PageLoadingState count={1} />}>
        <div />
      </Skeleton>
    );
  }

  const handleViewClick = () => {
    onViewArticle?.(article.id);
    window.open(article.url, '_blank');
  };

  const getCategoryColor = (category: string) => {
    const map: Record<string, string> = {
      politics: '#1a73e8',
      'human-rights': '#e53935',
      entertainment: '#8e24aa',
      culture: '#6d4c41',
      health: '#43a047',
      sports: '#fb8c00',
      business: '#546e7a',
      technology: '#00897b',
      lifestyle: '#d81b60',
      education: '#5c6bc0',
      legislation: '#5c6bc0',
      transgender: '#7b1fa2',
      rights: '#c62828',
      advocacy: '#ff6f00',
      news: '#37474f',
    };
    return map[category?.toLowerCase()] || '#555555';
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      'human-rights': 'Human Rights',
      politics: 'Politics',
      legislation: 'Legislation',
      transgender: 'Transgender',
      culture: 'Culture',
      health: 'Health',
      sports: 'Sports',
      education: 'Education',
      lifestyle: 'Lifestyle',
      rights: 'Rights',
      advocacy: 'Advocacy',
      entertainment: 'Entertainment',
      business: 'Business',
      technology: 'Technology',
      news: 'News',
    };
    return labels[category?.toLowerCase()] || category?.replace(/-/g, ' ');
  };

  // Clean author name
  const authorName = cleanAuthor(article.author || '');

  // Clean excerpt
  const excerptText = cleanExcerpt(article.excerpt || '');

  // Don't show the category badge for "general" — use the first tag instead
  const displayCategory = article.category !== 'general' ? article.category : null;
  const fallbackCategoryFromTag = !displayCategory && tags.length > 0 ? tags[0] : null;

  // Resolve city/country names from IDs
  const linkedCities = (article.city_ids || [])
    .map((id: string) => ({ id, name: cityNames[id] }))
    .filter((c: any) => c.name);
  const linkedCountries = (article.country_ids || [])
    .map((id: string) => ({ id, name: countryNames[id] }))
    .filter((c: any) => c.name);
  const hasLocation = linkedCities.length > 0 || linkedCountries.length > 0;

  return (
    <Card
      style={{
        boxShadow: 'var(--shadow-card)',
        transition: 'all 0.3s',
        borderColor: 'rgba(var(--border-rgb, 0,0,0), 0.5)',
        cursor: 'pointer',
      }}
      onClick={() => navigate(`/news/${article.id}`)}
    >
      <CardHeader style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2 }}>
          {article.image_url ? (
            <img
              loading="lazy"
              src={article.image_url}
              alt={decodeHtmlEntities(article.title)}
              style={{
                width: '100%',
                height: 192,
                objectFit: 'cover',
                transition: 'transform 0.3s',
              }}
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent && !parent.querySelector('.news-img-fallback')) {
                  const fallback = document.createElement('div');
                  fallback.className = 'news-img-fallback';
                  fallback.style.cssText =
                    'width:100%;height:192px;display:flex;align-items:center;justify-content:center;background:#f3f4f6';
                  fallback.innerHTML =
                    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>';
                  parent.insertBefore(fallback, target);
                }
              }}
            />
          ) : (
            <Box
              sx={{
                width: '100%',
                height: 192,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'action.hover',
              }}
            >
              <Newspaper style={{ width: 32, height: 32, color: 'var(--muted-foreground)' }} />
            </Box>
          )}
          {article.is_featured && (
            <Badge
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                backgroundColor: '#333333',
                color: '#ffffff',
              }}
            >
              Featured
            </Badge>
          )}
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1.5,
          }}
        >
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: '1.125rem',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
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
                color: '#ffffff',
                textTransform: 'capitalize',
                cursor: onFilterByCategory ? 'pointer' : 'default',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onFilterByCategory?.(displayCategory);
              }}
            >
              {getCategoryLabel(displayCategory)}
            </Badge>
          )}
          {!displayCategory && fallbackCategoryFromTag && (
            <Badge
              style={{
                backgroundColor: '#555555',
                color: '#ffffff',
                cursor: onFilterByCategory ? 'pointer' : 'default',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onFilterByCategory?.(fallbackCategoryFromTag);
              }}
            >
              {fallbackCategoryFromTag}
            </Badge>
          )}
          {/* Clickable source badge */}
          <Badge
            variant="outline"
            style={{ fontSize: '0.75rem', cursor: onFilterBySource ? 'pointer' : 'default' }}
            onClick={(e) => {
              e.stopPropagation();
              const src = sourcesMap[article.source_id];
              if (onFilterBySource && src?.id) {
                onFilterBySource(src.id, src.name);
              }
            }}
          >
            {sourcesMap[article.source_id]?.name || 'Unknown'}
          </Badge>
        </Box>
      </CardHeader>

      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Clean excerpt */}
        {excerptText && (
          <Typography
            variant="body2"
            sx={{
              color: 'var(--muted-foreground)',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {excerptText}
          </Typography>
        )}

        {/* Published date & views */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
        </Box>

        {showFullContent && article.content && (
          <Box sx={{ maxWidth: 'none', color: 'var(--foreground)' }} />
        )}

        {/* Tags — clickable, skip the tag used as fallback category */}
        {(() => {
          const displayTags = tags.filter((t) => t !== fallbackCategoryFromTag);
          if (isLoadingTags)
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tag style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Box
                    sx={{
                      height: 16,
                      width: 64,
                      bgcolor: 'var(--muted)',
                      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                      borderRadius: '9999px',
                    }}
                  />
                </Box>
              </Box>
            );
          if (displayTags.length === 0) return null;
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Tag
                style={{ height: 14, width: 14, color: 'var(--muted-foreground)', flexShrink: 0 }}
              />
              {displayTags.slice(0, 4).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    cursor: onFilterByTag ? 'pointer' : 'default',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterByTag?.(tag);
                  }}
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

        {/* Location — show linked city/country names */}
        {hasLocation && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              flexWrap: 'wrap',
              fontSize: '0.8rem',
              color: 'var(--muted-foreground)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MapPin style={{ height: 14, width: 14, flexShrink: 0 }} />
            {linkedCities.map((city: any, i: number) => (
              <span key={city.id}>
                <Link
                  to={`/city/${city.id}`}
                  style={{ color: 'var(--primary)', textDecoration: 'none' }}
                >
                  {city.name}
                </Link>
                {(i < linkedCities.length - 1 || linkedCountries.length > 0) && ', '}
              </span>
            ))}
            {linkedCountries.map((country: any, i: number) => (
              <span key={country.id}>
                <Link
                  to={`/country/${country.id}`}
                  style={{ color: 'var(--primary)', textDecoration: 'none' }}
                >
                  {country.name}
                </Link>
                {i < linkedCountries.length - 1 && ', '}
              </span>
            ))}
          </Box>
        )}

        {/* Clickable author */}
        {authorName && (
          <Typography
            variant="body2"
            sx={{
              color: 'var(--muted-foreground)',
              cursor: onFilterByAuthor ? 'pointer' : 'default',
              '&:hover': onFilterByAuthor ? { color: 'var(--primary)' } : {},
            }}
            onClick={(e) => {
              e.stopPropagation();
              onFilterByAuthor?.(authorName);
            }}
          >
            By {authorName}
          </Typography>
        )}

        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FavoriteButton itemId={article.id} type="news" />
          </Box>
          <Button
            onClick={handleViewClick}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            size="sm"
          >
            Read Full Article
            <ExternalLink style={{ height: 16, width: 16 }} />
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};
