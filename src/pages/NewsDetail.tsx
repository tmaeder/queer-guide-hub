import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  Eye,
  MapPin,
  Tag,
  Newspaper,
  Share2,
  Calendar,
  ChevronRight,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { supabase } from '@/integrations/supabase/client';
import { decodeHtmlEntities, cleanAuthor, cleanExcerpt, cleanContent } from '@/utils/htmlDecode';
import { formatDistanceToNow, format } from 'date-fns';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';import { useTranslation } from 'react-i18next';


interface NewsArticle {
  id: string;
  title: string;
  content: string | null;
  excerpt: string | null;
  url: string;
  image_url: string | null;
  author: string | null;
  published_at: string | null;
  source_id: string;
  views_count: number;
  is_featured: boolean;
  category: string | null;
  country_ids: string[] | null;
  city_ids: string[] | null;
  tags: string[] | null;
  publisher_name: string | null;
  created_at: string;
}

interface DbCategory {
  slug: string;
  name: string;
  color: string;
}

interface RelatedArticle {
  id: string;
  title: string;
  excerpt: string | null;
  image_url: string | null;
  published_at: string | null;
  category: string | null;
}

export default function NewsDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useLocalizedNavigate();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceName, setSourceName] = useState<string>('');
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [cityNames, setCityNames] = useState<Record<string, string>>({});
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});
  const [relatedArticles, setRelatedArticles] = useState<RelatedArticle[]>([]);
  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);

  useEffect(() => {
    if (!slug) {
      navigate('/news');
      return;
    }

    const fetchArticle = async () => {
      setLoading(true);

      // Fetch categories once
      supabase
        .from('news_categories')
        .select('slug, name, color')
        .eq('is_active', true)
        .then(({ data: cats }) => {
          if (cats) setDbCategories(cats as DbCategory[]);
        });

      try {
        let { data, error } = await supabase
          .from('news_articles')
          .select('*')
          .eq('slug', slug)
          .maybeSingle();

        // Fall back to ID lookup for backwards compatibility
        if (!data && !error) {
          const fallback = await supabase.from('news_articles').select('*').eq('id', slug).maybeSingle();
          data = fallback.data;
          error = fallback.error;
        }

        if (error || !data) {
          navigate('/news');
          return;
        }

        setArticle(data as NewsArticle);

        // Increment views
        supabase.rpc('increment_article_views', { article_id: data.id }).then(() => {});

        // Fetch source name — use publisher_name if available (for API-sourced articles)
        if (data.source_id) {
          supabase
            .from('news_sources')
            .select('name, url')
            .eq('id', data.source_id)
            .maybeSingle()
            .then(({ data: src }) => {
              if (src) {
                setSourceName(data.publisher_name || src.name || '');
                setSourceUrl(src.url || '');
              }
            });
        }

        // Fetch tags
        supabase
          .from('unified_tag_assignments')
          .select('unified_tags!inner(name)')
          .eq('entity_type', 'news')
          .eq('entity_id', data.id)
          .then(({ data: tagData }) => {
            if (tagData) {
              setTags(tagData.map((t: { unified_tags: { name: string } }) => t.unified_tags.name));
            }
          });

        // Resolve city names
        if (data.city_ids?.length) {
          supabase
            .from('cities')
            .select('id, name')
            .in('id', data.city_ids)
            .then(({ data: cities }) => {
              if (cities) {
                const map: Record<string, string> = {};
                cities.forEach((c: { id: string; name: string }) => {
                  map[c.id] = c.name;
                });
                setCityNames(map);
              }
            });
        }

        // Resolve country names
        if (data.country_ids?.length) {
          supabase
            .from('countries')
            .select('id, name')
            .in('id', data.country_ids)
            .then(({ data: countries }) => {
              if (countries) {
                const map: Record<string, string> = {};
                countries.forEach((c: { id: string; name: string }) => {
                  map[c.id] = c.name;
                });
                setCountryNames(map);
              }
            });
        }

        // Fetch related articles (same category, excluding current)
        if (data.category) {
          supabase
            .from('news_articles')
            .select('id, title, excerpt, image_url, published_at, category')
            .eq('category', data.category)
            .neq('id', data.id)
            .not('published_at', 'is', null)
            .order('published_at', { ascending: false })
            .limit(4)
            .then(({ data: related }) => {
              if (related) setRelatedArticles(related as RelatedArticle[]);
            });
        }
      } catch (err) {
        console.error('Error fetching article:', err);
        navigate('/news');
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [slug, navigate]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: article?.title, url });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  const getCategoryColor = (category: string) => {
    const dbCat = dbCategories.find(c => c.slug === category || c.name.toLowerCase() === category.toLowerCase());
    if (dbCat) return dbCat.color;
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
    const dbCat = dbCategories.find(c => c.slug === category || c.name.toLowerCase() === category.toLowerCase());
    if (dbCat) return dbCat.name;
    return category?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Loading skeleton matching 2-column grid pattern
  if (loading) {
    return (
      <Container sx={{ py: 4 }}>
        <Box
          sx={{
            '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        >
          <Box sx={{ height: 24, bgcolor: 'action.hover', borderRadius: 1, width: '40%', mb: 2 }} />
          <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 3, mb: 3 }} />
          <Box sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '60%', mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
            {[1, 2, 3].map((i) => (
              <Box
                key={i}
                sx={{ height: 28, width: 80, bgcolor: 'action.hover', borderRadius: 4 }}
              />
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ height: 256, bgcolor: 'action.hover', borderRadius: 2 }} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ height: 160, bgcolor: 'action.hover', borderRadius: 2 }} />
              <Box sx={{ height: 120, bgcolor: 'action.hover', borderRadius: 2 }} />
            </Box>
          </Box>
        </Box>
      </Container>
    );
  }

  if (!article) {
    return (
      <Container sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Article Not Found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          The article you're looking for doesn't exist.
        </Typography>
        <LocalizedLink to="/news">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to News
          </Button>
        </LocalizedLink>
      </Container>
    );
  }

  const authorName = cleanAuthor(article.author || '');
  const excerptText = cleanExcerpt(article.excerpt || '');
  const contentText = article.content ? cleanContent(article.content) : '';
  const linkedCities = (article.city_ids || [])
    .map((cid) => ({ id: cid, name: cityNames[cid] }))
    .filter((c) => c.name);
  const linkedCountries = (article.country_ids || [])
    .map((cid) => ({ id: cid, name: countryNames[cid] }))
    .filter((c) => c.name);
  const hasLocation = linkedCities.length > 0 || linkedCountries.length > 0;

  return (
    <Container sx={{ py: 4 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
        <LocalizedLink
          to="/news"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14, marginRight: 4 }} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ '&:hover': { color: 'primary.main' } }}
          >
            News
          </Typography>
        </LocalizedLink>
        {article.category && article.category !== 'general' && (
          <>
            <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                cursor: 'pointer',
                textTransform: 'capitalize',
                '&:hover': { color: 'primary.main' },
              }}
              onClick={() => navigate(`/news?category=${article.category}`)}
            >
              {getCategoryLabel(article.category)}
            </Typography>
          </>
        )}
        <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 300,
          }}
        >
          {decodeHtmlEntities(article.title)}
        </Typography>
      </Box>

      {/* Hero image */}
      {article.image_url && (
        <Box
          sx={{
            width: '100%',
            height: { xs: 160, md: 240 },
            borderRadius: 3,
            overflow: 'hidden',
            mb: 3,
          }}
        >
          <Box
            component="img"
            src={article.image_url}
            alt={decodeHtmlEntities(article.title)}
            referrerPolicy="no-referrer"
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </Box>
      )}

      {/* Title Row */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { md: 'flex-start' },
          justifyContent: { md: 'space-between' },
          gap: 2,
          mb: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, flexWrap: 'wrap' }}>
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {decodeHtmlEntities(article.title)}
            </Typography>
            {article.is_featured && (
              <Badge style={{ backgroundColor: '#333333', color: '#ffffff' }}>Featured</Badge>
            )}
          </Box>

          {/* Meta row */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              color: 'text.secondary',
              flexWrap: 'wrap',
            }}
          >
            {authorName && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <User style={{ width: 14, height: 14 }} />
                <Typography variant="body2">By {authorName}</Typography>
              </Box>
            )}
            {article.published_at && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Calendar style={{ width: 14, height: 14 }} />
                <Typography variant="body2">
                  {format(new Date(article.published_at), 'MMMM d, yyyy')}
                </Typography>
              </Box>
            )}
            {article.published_at && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Clock style={{ width: 14, height: 14 }} />
                <Typography variant="body2">
                  {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
                </Typography>
              </Box>
            )}
            {article.views_count > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Eye style={{ width: 14, height: 14 }} />
                <Typography variant="body2">{article.views_count} views</Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Action buttons */}
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}
        >
          <FavoriteButton itemId={article.id} type="news" />
          <ReportButton contentType="news_article" contentId={article.id} />
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 style={{ width: 16, height: 16, marginRight: 6 }} />
            Share
          </Button>
          <Button size="sm" onClick={() => window.open(article.url, '_blank')}>
            <ExternalLink style={{ width: 16, height: 16, marginRight: 6 }} />
            Read Full Article
          </Button>
        </Box>
      </Box>

      {/* Category & Source badges */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        {article.category && article.category !== 'general' && (
          <Badge
            style={{
              backgroundColor: getCategoryColor(article.category),
              color: '#fff',
              textTransform: 'capitalize',
            }}
          >
            {getCategoryLabel(article.category)}
          </Badge>
        )}
        {sourceName && <Badge variant="outline">{sourceName}</Badge>}
      </Box>

      {/* 2-Column Layout */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 4 }}>
        {/* Main Content */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Article Content Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.newsDetail.article', 'Article')}</CardTitle>
            </CardHeader>
            <CardContent>
              {contentText ? (
                <Typography color="text.secondary" sx={{ lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                  {contentText}
                </Typography>
              ) : excerptText ? (
                <Box>
                  <Typography color="text.secondary" sx={{ lineHeight: 1.8, mb: 2 }}>
                    {excerptText}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    To read the full article, click "Read Full Article" above.
                  </Typography>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  This article is available on the original source. Click "Read Full Article" to
                  read it.
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Read Full Article CTA Card */}
          <Card>
            <CardContent
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 3 }}
            >
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Read the full article
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {sourceName
                    ? `Originally published on ${sourceName}`
                    : 'View on the original source'}
                </Typography>
              </Box>
              <Button
                onClick={() => window.open(article.url, '_blank')}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                Open Article
                <ExternalLink style={{ width: 16, height: 16 }} />
              </Button>
            </CardContent>
          </Card>

          {/* Related Articles */}
          {relatedArticles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.newsDetail.relatedArticles', 'Related Articles')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2,
                  }}
                >
                  {relatedArticles.map((related) => (
                    <Box
                      key={related.id}
                      component={LocalizedLink}
                      to={`/news/${related.slug || related.id}`}
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 1,
                        overflow: 'hidden',
                        textDecoration: 'none',
                        color: 'inherit',
                        transition: 'all 0.2s',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      {related.image_url && (
                        <Box sx={{ overflow: 'hidden' }}>
                          <Box
                            component="img"
                            src={related.image_url}
                            alt={decodeHtmlEntities(related.title)}
                            sx={{ width: '100%', height: 120, objectFit: 'cover' }}
                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </Box>
                      )}
                      <Box sx={{ p: 1.5 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 600,
                            mb: 0.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {decodeHtmlEntities(related.title)}
                        </Typography>
                        {related.published_at && (
                          <Typography variant="caption" color="text.secondary">
                            {formatDistanceToNow(new Date(related.published_at), {
                              addSuffix: true,
                            })}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>

        {/* Sidebar */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Article Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.newsDetail.articleInfo', 'Article Info')}</CardTitle>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {article.published_at && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Calendar style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                  <div>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      Published
                    </Typography>
                    <Typography sx={{ fontWeight: 500 }}>
                      {format(new Date(article.published_at), 'MMMM d, yyyy')}
                    </Typography>
                  </div>
                </Box>
              )}
              {authorName && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <User style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                  <div>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      Author
                    </Typography>
                    <Typography sx={{ fontWeight: 500 }}>{authorName}</Typography>
                  </div>
                </Box>
              )}
              {sourceName && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Newspaper style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                  <div>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      Source
                    </Typography>
                    <Typography sx={{ fontWeight: 500 }}>{sourceName}</Typography>
                  </div>
                </Box>
              )}
              {article.views_count > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Eye style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                  <div>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      Views
                    </Typography>
                    <Typography sx={{ fontWeight: 500 }}>{article.views_count}</Typography>
                  </div>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Tags Card */}
          {tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Tag style={{ height: 16, width: 16 }} />
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      style={{ fontSize: '0.75rem', cursor: 'pointer', padding: '4px 10px' }}
                      onClick={() => navigate(`/resources/${encodeURIComponent(tag)}`)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Location Card */}
          {hasLocation && (
            <Card>
              <CardHeader>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MapPin style={{ height: 16, width: 16 }} />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {linkedCities.map((c) => (
                    <Typography
                      key={c.id}
                      component={LocalizedLink}
                      to={`/city/${c.slug || c.id}`}
                      sx={{
                        fontWeight: 500,
                        color: 'primary.main',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      {c.name}
                    </Typography>
                  ))}
                  {linkedCountries.map((c) => (
                    <Typography
                      key={c.id}
                      component={LocalizedLink}
                      to={`/country/${c.slug || c.id}`}
                      sx={{
                        fontWeight: 500,
                        color: 'primary.main',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      {c.name}
                    </Typography>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Source Link Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.newsDetail.links', 'Links')}</CardTitle>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                variant="outline"
                size="sm"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => window.open(article.url, '_blank')}
              >
                <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                Original Article
              </Button>
              {sourceUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                  onClick={() => window.open(sourceUrl, '_blank')}
                >
                  <Newspaper style={{ width: 16, height: 16, marginRight: 8 }} />
                  {sourceName || 'Source Website'}
                </Button>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
      <SimilarItems entity={{ type: 'news', id: article.id }} className="mt-8" title="Related news" />
    </Container>
  );
}
