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
  BookOpen,
  ArrowRight,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Image } from '@/components/ui/Image';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { DestinationSafetyCard } from '@/components/safety/DestinationSafetyCard';
import { estimateReadingTime } from '@/lib/readingTime';
import { useIsMobile } from '@/hooks/use-mobile';
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
import { Editable } from '@/components/admin/inline/Editable';
import { useUserNewsReads } from '@/hooks/useUserNewsReads';
import { ReadingProgressBar } from '@/components/news/editorial/ReadingProgressBar';
import { useAdminEditMode } from '@/hooks/useAdminEditMode';
import { EditorsPickToggle } from '@/components/admin/news/EditorsPickToggle';

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
  editorial_note?: string | null;
  is_editors_pick?: boolean | null;
  image_attribution?: string | null;
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
  const [story, setStory] = useState<{ slug: string; title: string; article_count: number } | null>(
    null,
  );
  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);
  const { markRead } = useUserNewsReads();
  const { isAdmin } = useAdminEditMode();
  const isMobile = useIsMobile();

  // Mark the article as read once we have its id (drives streak + challenge progress).
  useEffect(() => {
    if (article?.id) void markRead(article.id);
  }, [article?.id, markRead]);

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
          author: article.author
            ? { '@type': 'Person', name: cleanAuthor(article.author) }
            : undefined,
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
          fetchRelatedNewsArticles<RelatedArticle>(data.category, data.id).then(setRelatedArticles);
        }

        // Story membership
        fetchStoryForArticle(data.id)
          .then(setStory)
          .catch(() => setStory(null));
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
    const dbCat = dbCategories.find(
      (c) => c.slug === category || c.name.toLowerCase() === category.toLowerCase(),
    );
    if (dbCat) return dbCat.name;
    return category?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
            <ArrowLeft size={16} className="mr-2" />
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
      <ReadingProgressBar />
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        <LocalizedLink
          to="/news"
          style={{ alignItems: 'center', color: 'inherit' }}
          className="inline-flex no-underline"
        >
          <ArrowLeft size={14} className="mr-1" />
          <span className="text-sm text-muted-foreground hover:text-primary">News</span>
        </LocalizedLink>
        {article.category && article.category !== 'general' && (
          <>
            <ChevronRight size={14} className="text-muted-foreground" />
            <button
              type="button"
              className="text-sm text-muted-foreground capitalize hover:text-primary cursor-pointer bg-transparent border-0 p-0"
              onClick={() => navigate(`/news?category=${article.category}`)}
            >
              {getCategoryLabel(article.category)}
            </button>
          </>
        )}
        <ChevronRight size={14} className="text-muted-foreground" />
        <span className="text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-[300px]">
          {decodeHtmlEntities(article.title)}
        </span>
      </div>

      {/* Hero image */}
      <figure className="group mb-6">
        <Image
          src={heroSrc}
          alt={decodeHtmlEntities(article.title)}
          heightPx={isMobile ? 220 : 360}
          imageRole="hero"
          rounded="container"
          priority
          fallbackEntityType="news"
          fallbackKey={article.id}
        />
        {article.image_attribution && (
          <figcaption className="mt-2 text-2xs text-muted-foreground">
            {article.image_attribution}
          </figcaption>
        )}
      </figure>

      {/* Title Row */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          {story && (
            <LocalizedLink
              to={`/news/story/${story.slug}`}
              className="mb-4 inline-flex items-center gap-1.5 no-underline hover:text-foreground"
            >
              <Layers size={12} aria-hidden="true" />
              <Eyebrow>Part of story · {story.article_count} articles</Eyebrow>
            </LocalizedLink>
          )}
          {!story && article.category && article.category !== 'general' && (
            <Eyebrow as="div" className="mb-2">
              {getCategoryLabel(article.category)}
            </Eyebrow>
          )}
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <h1 className="text-display md:text-headline-lg font-bold leading-[1.05] tracking-tight m-0">
              <Editable
                contentType="news_articles"
                recordId={article.id}
                field="title"
                value={article.title}
                onSaved={(next) =>
                  setArticle((prev) => (prev ? { ...prev, title: String(next ?? '') } : prev))
                }
              >
                {decodeHtmlEntities(article.title)}
              </Editable>
            </h1>
            {article.is_featured && (
              <Badge
                style={{ backgroundColor: 'hsl(var(--foreground))' }}
                className="text-background"
              >
                Featured
              </Badge>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-4 text-muted-foreground flex-wrap text-13">
            {authorName && (
              <div className="flex items-center gap-1">
                <User size={14} />
                <span>By {authorName}</span>
              </div>
            )}
            {article.published_at && (
              <div className="flex items-center gap-1">
                <Calendar size={14} />
                <span>
                  {format(new Date(article.published_at), 'MMMM d, yyyy')}
                </span>
              </div>
            )}
            {article.published_at && (
              <div className="flex items-center gap-1">
                <Clock size={14} />
                <span>
                  {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
                </span>
              </div>
            )}
            {(contentText || excerptText) && (
              <div className="flex items-center gap-1">
                <BookOpen size={14} />
                <span>{estimateReadingTime(contentText || excerptText)} min read</span>
              </div>
            )}
            {article.views_count > 0 && (
              <div className="flex items-center gap-1">
                <Eye size={14} />
                <span>{article.views_count} views</span>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {isAdmin && (
            <EditorsPickToggle
              articleId={article.id}
              initialValue={!!article.is_editors_pick}
              onChange={(next) =>
                setArticle((prev) => (prev ? { ...prev, is_editors_pick: next } : prev))
              }
            />
          )}
          <FavoriteButton itemId={article.id} type="news" />
          <ReportButton contentType="news_article" contentId={article.id} />
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 size={16} className="mr-1.5" />
            Share
          </Button>
          <Button size="sm" onClick={() => window.open(article.url, '_blank')}>
            <ExternalLink size={16} className="mr-1.5" />
            Read Full Article
          </Button>
        </div>
      </div>

      {/* Category & Source badges */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {article.category && article.category !== 'general' && (
          <Badge variant="outline" className="capitalize">
            {getCategoryLabel(article.category)}
          </Badge>
        )}
        {sourceName && <Badge variant="outline">{sourceName}</Badge>}
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
        {/* Main Content */}
        <div className="flex flex-col gap-6">
          {/* Editorial note ("Why this matters") — admin-curated, monochrome blockquote.
              Shown to everyone when populated. Admins see a placeholder slot when empty so
              they can alt-click to author one. */}
          {(article.editorial_note || isAdmin) && (
            <aside
              aria-label="Why this matters"
              className="border-l-2 border-foreground pl-6 py-2"
            >
              <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground m-0">
                Why this matters
              </p>
              <Editable
                contentType="news_articles"
                recordId={article.id}
                field="editorial_note"
                value={article.editorial_note ?? ''}
                onSaved={(next) =>
                  setArticle((prev) =>
                    prev ? { ...prev, editorial_note: (next as string) || null } : prev,
                  )
                }
                as="div"
                className="mt-2"
              >
                {article.editorial_note ? (
                  <p className="m-0 text-base italic leading-relaxed">
                    {article.editorial_note}
                  </p>
                ) : (
                  <p className="m-0 text-base italic leading-relaxed text-muted-foreground">
                    Alt-click to add the stakes — 1–3 sentences on why this story matters.
                  </p>
                )}
              </Editable>
            </aside>
          )}

          {/* Article body — editorial prose, constrained measure, full-strength text */}
          <article className="max-w-[68ch]">
            <Editable
              contentType="news_articles"
              recordId={article.id}
              field={contentText || !excerptText ? 'content' : 'excerpt'}
              value={contentText || excerptText || ''}
              onSaved={(next) =>
                setArticle((prev) =>
                  prev
                    ? {
                        ...prev,
                        [contentText || !excerptText ? 'content' : 'excerpt']: String(next ?? ''),
                      }
                    : prev,
                )
              }
              fieldOverride={{ type: 'textarea' }}
              as="div"
            >
              {contentText ? (
                <p
                  className="whitespace-pre-line text-body-lg text-foreground"
                  style={{ lineHeight: 1.8 }}
                >
                  {contentText}
                </p>
              ) : excerptText ? (
                <p className="text-body-lg text-foreground" style={{ lineHeight: 1.8 }}>
                  {excerptText}
                </p>
              ) : (
                <p className="text-body-lg italic text-muted-foreground">
                  The full story lives on the original source.
                </p>
              )}
            </Editable>

            {/* Single source-attribution block — the one place to leave for the source */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
              <p className="text-sm text-muted-foreground">
                {sourceName
                  ? `Originally published by ${sourceName}.`
                  : 'Read the original report at the source.'}
              </p>
              <Button onClick={() => window.open(article.url, '_blank')}>
                Read full article
                <ExternalLink size={16} className="ml-2" />
              </Button>
            </div>
          </article>

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
                      <div
                        className="overflow-hidden"
                        style={{ height: 120, background: 'hsl(var(--muted))' }}
                      >
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
                      <div className="p-4">
                        <p
                          className="text-sm font-semibold mb-1 overflow-hidden text-foreground"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            textTransform: 'none',
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
          {/* Destination safety context — ties the story to where it happens */}
          <DestinationSafetyCard countryIds={article.country_ids ?? []} />

          {/* Tags Card */}
          {tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle style={{ alignItems: 'center', gap: '8px' }} className="flex">
                  <Tag size={16} />
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      style={{ padding: '4px 10px' }}
                      className="text-xs cursor-pointer"
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
                <CardTitle style={{ alignItems: 'center', gap: '8px' }} className="flex">
                  <MapPin size={16} />
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

          {/* Source Card */}
          {(sourceName || sourceUrl) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Newspaper size={16} />
                  Source
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sourceName && <p className="mb-1 font-medium">{sourceName}</p>}
                {article.published_at && (
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(article.published_at), 'MMMM d, yyyy')}
                    {authorName ? ` · ${authorName}` : ''}
                  </p>
                )}
                {sourceUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full justify-start"
                    onClick={() => window.open(sourceUrl, '_blank')}
                  >
                    <Globe size={16} className="mr-2" />
                    Visit {sourceName || 'source'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {story && (
        <LocalizedLink
          to={`/news/story/${story.slug}`}
          className="mt-10 flex items-center justify-between gap-4 rounded-container border border-border p-4 no-underline transition-colors hover:bg-muted"
        >
          <span className="flex items-center gap-2">
            <Layers size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              <Eyebrow as="span">Story · {story.article_count} articles</Eyebrow>
              <span className="block font-semibold">{decodeHtmlEntities(story.title)}</span>
            </span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        </LocalizedLink>
      )}

      <SimilarItems
        entity={{ type: 'news', id: article.id }}
        className="mt-10"
        title="Related news"
      />

      <MarketplaceRelated className="mt-12" title="Shop LGBTQ+ brands" />
    </TracingBeam>
  );
}
