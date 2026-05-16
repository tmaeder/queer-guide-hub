import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { MarketplaceRelated } from '@/components/marketplace/MarketplaceRelated';
import { useEffect, useMemo, useState } from 'react';
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
import {
  fetchNewsCategories,
  fetchNewsArticleBySlugOrId,
  fetchNewsSourceById,
  fetchNewsTagsForEntity,
  fetchRelatedNewsArticles,
  fetchNamesByIds,
} from '@/hooks/usePageFetchers';
import { decodeHtmlEntities, cleanAuthor, cleanExcerpt, cleanContent } from '@/utils/htmlDecode';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { formatDistanceToNow, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { fetchStoryForArticle } from '@/hooks/useNewsStories';
import { Layers } from 'lucide-react';
import { TracingBeam } from '@/components/effects/TracingBeam';

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
  slug?: string | null;
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
  const [story, setStory] = useState<{ slug: string; title: string; article_count: number } | null>(null);
  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);

  const articleIds = useMemo(() => (article ? [article.id] : []), [article]);
  const { assets: articleAssets } = useEntityImageAssets('news_article', articleIds);
  const heroSrc = article
    ? resolveImageUrl({
        imageUrl: article.image_url,
        optimizedUrl: articleAssets.get(article.id)?.optimized_url ?? null,
        thumbnailUrl: articleAssets.get(article.id)?.thumbnail_url ?? null,
      })
    : null;

  // Per-article SEO tags (client-side; edge-rendered tags are tracked separately for crawlers).
  const articleTitle = article ? decodeHtmlEntities(article.title) : undefined;
  const articleExcerpt = article?.excerpt ? cleanExcerpt(article.excerpt).slice(0, 200) : undefined;
  useMeta({
    title: articleTitle,
    description: articleExcerpt,
    ogImage: article?.image_url || undefined,
    ogType: 'article',
    canonicalPath: slug ? `/news/${slug}` : undefined,
    jsonLd: article
      ? {
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: articleTitle,
          image: article.image_url ? [article.image_url] : undefined,
          datePublished: article.published_at || undefined,
          author: article.author ? { '@type': 'Person', name: cleanAuthor(article.author) } : undefined,
          publisher: {
            '@type': 'Organization',
            name: 'Queer Guide',
            logo: { '@type': 'ImageObject', url: 'https://queer.guide/icons/icon-192.png' },
          },
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `https://queer.guide/news/${slug}`,
          },
        }
      : undefined,
  });

  useEffect(() => {
    if (!slug) {
      navigate('/news');
      return;
    }

    const fetchArticle = async () => {
      setLoading(true);
      setArticle(null);

      // Fetch categories once (DUP-4)
      fetchNewsCategories<DbCategory>().then((cats) => setDbCategories(cats));

      try {
        const data = await fetchNewsArticleBySlugOrId<NewsArticle>(slug);
        if (!data) {
          // Show in-app 404 instead of silently bouncing back to /news.
          // (A real HTTP 404 needs an edge handler — tracked separately.)
          setArticle(null);
          return;
        }

        setArticle(data);

        // Increment views (RPC, not subject to the rule)
        supabase.rpc('increment_article_views', { article_id: data.id }).then(() => {});

        // Source name + url
        if (data.source_id) {
          fetchNewsSourceById(data.source_id).then((src) => {
            if (src) {
              setSourceName(data.publisher_name || src.name || '');
              setSourceUrl(src.url || '');
            }
          });
        }

        // Tags
        fetchNewsTagsForEntity(data.id).then(setTags);

        // City + country names
        if (data.city_ids?.length) {
          fetchNamesByIds('cities', data.city_ids).then((map) => {
            if (Object.keys(map).length) setCityNames(map);
          });
        }
        if (data.country_ids?.length) {
          fetchNamesByIds('countries', data.country_ids).then((map) => {
            if (Object.keys(map).length) setCountryNames(map);
          });
        }

        // Related
        if (data.category) {
          fetchRelatedNewsArticles<RelatedArticle>(data.category, data.id).then(
            setRelatedArticles,
          );
        }

        // Story membership
        fetchStoryForArticle(data.id).then(setStory).catch(() => setStory(null));
      } catch (err) {
        console.error('Error fetching article:', err);
        setArticle(null);
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

  const getCategoryLabel = (category: string) => {
    const dbCat = dbCategories.find(c => c.slug === category || c.name.toLowerCase() === category.toLowerCase());
    if (dbCat) return dbCat.name;
    return category?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Loading skeleton matching 2-column grid pattern
  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-2/5 mb-4" />
          <div className="h-48 bg-muted rounded-container mb-6" />
          <div className="h-8 bg-muted rounded w-3/5 mb-4" />
          <div className="flex gap-2 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-7 w-20 bg-muted rounded-badge" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
            <div className="flex flex-col gap-6">
              <div className="h-64 bg-muted rounded-element" />
            </div>
            <div className="flex flex-col gap-6">
              <div className="h-40 bg-muted rounded-element" />
              <div className="h-32 bg-muted rounded-element" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-xl font-bold mb-4">Article Not Found</h1>
        <p className="text-muted-foreground mb-6">
          The article you're looking for doesn't exist or may have been removed.
        </p>
        <LocalizedLink to="/news">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to News
          </Button>
        </LocalizedLink>
      </div>
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
    <TracingBeam className="container mx-auto py-8 px-4 pb-24">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
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
          <span className="text-sm text-muted-foreground hover:text-primary">News</span>
        </LocalizedLink>
        {article.category && article.category !== 'general' && (
          <>
            <ChevronRight style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
            <button
              type="button"
              className="text-sm text-muted-foreground capitalize hover:text-primary cursor-pointer bg-transparent border-0 p-0"
              onClick={() => navigate(`/news?category=${article.category}`)}
            >
              {getCategoryLabel(article.category)}
            </button>
          </>
        )}
        <ChevronRight style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
        <span className="text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-[300px]">
          {decodeHtmlEntities(article.title)}
        </span>
      </div>

      {/* Hero image */}
      {heroSrc && (
        <div className="w-full h-40 md:h-60 rounded-container overflow-hidden mb-6">
          <img
            src={heroSrc}
            alt={decodeHtmlEntities(article.title)}
            role="presentation"
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Title Row */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          {story && (
            <LocalizedLink
              to={`/news/story/${story.slug}`}
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground mb-3 no-underline"
            >
              <Layers style={{ width: 12, height: 12 }} aria-hidden="true" />
              Part of story · {story.article_count} articles
            </LocalizedLink>
          )}
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-2xl font-bold leading-tight m-0">
              {decodeHtmlEntities(article.title)}
            </h1>
            {article.is_featured && (
              <Badge style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}>Featured</Badge>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-4 text-muted-foreground flex-wrap">
            {authorName && (
              <div className="flex items-center gap-1">
                <User style={{ width: 14, height: 14 }} />
                <span className="text-sm">By {authorName}</span>
              </div>
            )}
            {article.published_at && (
              <div className="flex items-center gap-1">
                <Calendar style={{ width: 14, height: 14 }} />
                <span className="text-sm">
                  {format(new Date(article.published_at), 'MMMM d, yyyy')}
                </span>
              </div>
            )}
            {article.published_at && (
              <div className="flex items-center gap-1">
                <Clock style={{ width: 14, height: 14 }} />
                <span className="text-sm">
                  {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
                </span>
              </div>
            )}
            {article.views_count > 0 && (
              <div className="flex items-center gap-1">
                <Eye style={{ width: 14, height: 14 }} />
                <span className="text-sm">{article.views_count} views</span>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
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
        </div>
      </div>

      {/* Category & Source badges */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {article.category && article.category !== 'general' && (
          <Badge
            variant="outline"
            style={{ textTransform: 'capitalize' }}
          >
            {getCategoryLabel(article.category)}
          </Badge>
        )}
        {sourceName && <Badge variant="outline">{sourceName}</Badge>}
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
        {/* Main Content */}
        <div className="flex flex-col gap-6">
          {/* Article Content Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.newsDetail.article', 'Article')}</CardTitle>
            </CardHeader>
            <CardContent>
              {contentText ? (
                <p className="text-muted-foreground whitespace-pre-line" style={{ lineHeight: 1.8 }}>
                  {contentText}
                </p>
              ) : excerptText ? (
                <div>
                  <p className="text-muted-foreground mb-4" style={{ lineHeight: 1.8 }}>
                    {excerptText}
                  </p>
                  <p className="text-sm text-muted-foreground italic">
                    To read the full article, click "Read Full Article" above.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  This article is available on the original source. Click "Read Full Article" to
                  read it.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Read Full Article CTA Card */}
          <Card>
            <CardContent>
              <div>
                <p className="text-base font-semibold">Read the full article</p>
                <p className="text-sm text-muted-foreground">
                  {sourceName
                    ? `Originally published on ${sourceName}`
                    : 'View on the original source'}
                </p>
              </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {relatedArticles.map((related) => (
                    <LocalizedLink
                      key={related.id}
                      to={`/news/${related.slug || related.id}`}
                      className="flex flex-col rounded overflow-hidden no-underline text-inherit transition-all duration-200 hover:bg-muted border border-border"
                    >
                      <div className="overflow-hidden" style={{ height: 120, background: 'hsl(var(--muted))' }}>
                        {related.image_url ? (
                          <img
                            src={related.image_url}
                            alt=""
                            role="presentation"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            width={400}
                            height={120}
                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                      </div>
                      <div className="p-3">
                        <p
                          className="text-sm font-semibold mb-1 overflow-hidden"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            textTransform: 'none',
                            color: 'hsl(var(--foreground))',
                          }}
                        >
                          {decodeHtmlEntities(related.title)}
                        </p>
                        {related.published_at && (
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(related.published_at), {
                              addSuffix: true,
                            })}
                          </span>
                        )}
                      </div>
                    </LocalizedLink>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          {/* Article Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.newsDetail.articleInfo', 'Article Info')}</CardTitle>
            </CardHeader>
            <CardContent>
              {article.published_at && (
                <div className="flex items-center gap-3">
                  <Calendar style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                  <div>
                    <p className="text-sm text-muted-foreground">Published</p>
                    <p className="font-medium">
                      {format(new Date(article.published_at), 'MMMM d, yyyy')}
                    </p>
                  </div>
                </div>
              )}
              {authorName && (
                <div className="flex items-center gap-3">
                  <User style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                  <div>
                    <p className="text-sm text-muted-foreground">Author</p>
                    <p className="font-medium">{authorName}</p>
                  </div>
                </div>
              )}
              {sourceName && (
                <div className="flex items-center gap-3">
                  <Newspaper style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                  <div>
                    <p className="text-sm text-muted-foreground">Source</p>
                    <p className="font-medium">{sourceName}</p>
                  </div>
                </div>
              )}
              {article.views_count > 0 && (
                <div className="flex items-center gap-3">
                  <Eye style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                  <div>
                    <p className="text-sm text-muted-foreground">Views</p>
                    <p className="font-medium">{article.views_count}</p>
                  </div>
                </div>
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
                <div className="flex flex-wrap gap-2">
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
                </div>
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
                <div className="flex flex-col gap-2">
                  {linkedCities.map((c) => (
                    <LocalizedLink
                      key={c.id}
                      to={`/city/${c.slug || c.id}`}
                      className="font-medium text-primary no-underline hover:underline"
                    >
                      {c.name}
                    </LocalizedLink>
                  ))}
                  {linkedCountries.map((c) => (
                    <LocalizedLink
                      key={c.id}
                      to={`/country/${c.slug || c.id}`}
                      className="font-medium text-primary no-underline hover:underline"
                    >
                      {c.name}
                    </LocalizedLink>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Source Link Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.newsDetail.links', 'Links')}</CardTitle>
            </CardHeader>
            <CardContent>
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
        </div>
      </div>
      <SimilarItems entity={{ type: 'news', id: article.id }} className="mt-8" title="Related news" />
      <MarketplaceRelated className="mt-10" />
    </TracingBeam>
  );
}
