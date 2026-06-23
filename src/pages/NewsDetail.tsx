import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { useParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { PodcastPlayer } from '@/components/news/PodcastPlayer';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  Eye,
  Share2,
  Calendar,
  User,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Image } from '@/components/ui/Image';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { DestinationSafetyCard } from '@/components/safety/DestinationSafetyCard';
import { estimateReadingTime } from '@/lib/share';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { fetchNewsCategories } from '@/hooks/usePageFetchers';
import { cleanTitle, cleanAuthor, cleanExcerpt, cleanContent } from '@/utils/htmlDecode';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { formatDistanceToNow, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { Editable } from '@/components/admin/inline/Editable';
import { useUserNewsReads } from '@/hooks/useUserNewsReads';
import { localizedNewsTitle } from '@/lib/newsTitle';
import { ContentLangBadge } from '@/components/i18n/ContentLangBadge';
import { ReadingProgressBar } from '@/components/news/editorial/ReadingProgressBar';
import { useAdminEditMode } from '@/hooks/useAdminEditMode';
import { EditorsPickToggle } from '@/components/admin/news/EditorsPickToggle';

import {
  loadNewsDetail,
  extractDek,
  isFreshArticle,
  IntegrityNotice,
  PersonalizationRibbon,
  StoryClusterPanel,
  TagsCard,
  LocationCard,
  SourceCard,
  RelatedNewsRail,
  type NewsDetailData,
  type NewsArticleFull,
} from './NewsDetail.parts';

interface DbCategory {
  slug: string;
  name: string;
  color: string;
}

export default function NewsDetail() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useLocalizedNavigate();
  const [data, setData] = useState<NewsDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);
  const { markRead } = useUserNewsReads();
  const { isAdmin } = useAdminEditMode();
  const isMobile = useIsMobile();

  const article = data?.article ?? null;

  // Patch a single article field in place after an inline admin edit.
  const patchArticle = (patch: Partial<NewsArticleFull>) =>
    setData((prev) => (prev ? { ...prev, article: { ...prev.article, ...patch } } : prev));

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
  const articleTitle = article ? cleanTitle(article.title) : undefined;
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

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external data (slug-driven fetch); documented exemption from the eslint.config.js staged-ratchet plan.
    setLoading(true);
    setData(null);

    fetchNewsCategories<DbCategory>().then((cats) => {
      if (!cancelled) setDbCategories(cats);
    });

    loadNewsDetail(slug)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        if (result) {
          // Increment views (RPC, fire-and-forget).
          supabase.rpc('increment_article_views', { article_id: result.article.id }).then(() => {});
        }
      })
      .catch((err) => {
        console.error('Error fetching article:', err);
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, navigate]);

  const handleShare = async () => {
    const url = window.location.href;
    if (typeof navigator !== 'undefined' && navigator.share) {
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

  // Publish the breadcrumb trail to the global bar (News / [Category] / Title).
  useBreadcrumbs(
    article
      ? [
          { label: t('breadcrumb.news', 'News'), href: '/news' },
          ...(article.category && article.category !== 'general'
            ? [
                {
                  label: getCategoryLabel(article.category),
                  href: `/news?category=${article.category}`,
                },
              ]
            : []),
          { label: cleanTitle(article.title) },
        ]
      : null,
  );

  // Loading skeleton matching the 2-column grid pattern.
  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="animate-pulse">
          <div className="mb-6 h-48 rounded-container bg-muted" />
          <div className="mb-4 h-6 w-2/5 rounded bg-muted" />
          <div className="mb-4 h-8 w-3/5 rounded bg-muted" />
          <div className="mb-6 flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-7 w-20 rounded-badge bg-muted" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-6">
              <div className="h-64 rounded-element bg-muted" />
            </div>
            <div className="flex flex-col gap-6">
              <div className="h-40 rounded-element bg-muted" />
              <div className="h-32 rounded-element bg-muted" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="mb-4 text-xl font-bold">
          {t('newsDetail.notFound', 'Article Not Found')}
        </h1>
        <p className="mb-6 text-muted-foreground">
          {t('newsDetail.notFoundDesc', "The article you're looking for doesn't exist.")}
        </p>
        <LocalizedLink to="/news">
          <Button>
            <ArrowLeft size={16} className="mr-2" />
            {t('newsDetail.backToNews', 'Back to News')}
          </Button>
        </LocalizedLink>
      </div>
    );
  }

  const { sourceName, sourceUrl, tags, cityNames, countryNames } = data!;
  const authorName = cleanAuthor(article.author || '');
  const excerptText = cleanExcerpt(article.excerpt || '');
  const contentText = article.content ? cleanContent(article.content) : '';
  const dek = excerptText ? extractDek(excerptText) : '';
  const readMins = estimateReadingTime(article.content, article.excerpt);
  const fresh = isFreshArticle(article.published_at);
  const corroboration = article.corroboration_count ?? 0;
  const categoryLabel =
    article.category && article.category !== 'general' ? getCategoryLabel(article.category) : null;

  return (
    <div className="container mx-auto px-4 py-8 pb-24">
      <ReadingProgressBar />

      {/* Hero image */}
      <figure className="group mb-6">
        <Image
          src={heroSrc}
          alt={cleanTitle(article.title)}
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

      {/* Editorial header */}
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          {/* Eyebrow: category · source · fresh · credibility */}
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
            {categoryLabel && <Eyebrow>{categoryLabel}</Eyebrow>}
            {sourceName && (
              <>
                {categoryLabel && <span className="text-2xs text-muted-foreground">·</span>}
                <Eyebrow>{sourceName}</Eyebrow>
              </>
            )}
            {fresh && (
              <span className="ml-1 inline-flex items-center gap-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-foreground animate-pulse"
                  aria-hidden="true"
                />
                <Eyebrow>New</Eyebrow>
              </span>
            )}
            {corroboration > 1 && (
              <Badge variant="soft" className="ml-1 px-2 py-0.5 text-2xs font-semibold">
                Reported by {corroboration} outlets
              </Badge>
            )}
          </div>

          {/* Title */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-display font-bold leading-[1.05] tracking-tight md:text-headline-lg">
              <Editable
                contentType="news_articles"
                recordId={article.id}
                field="title"
                value={article.title}
                onSaved={(next) => patchArticle({ title: String(next ?? '') })}
              >
                {cleanTitle(localizedNewsTitle(article, i18n.language))}
              </Editable>
            </h1>
            <ContentLangBadge language={article.content_language} text={article.title} />
            {article.is_featured && (
              <Badge variant="default" className="text-2xs">
                Featured
              </Badge>
            )}
          </div>

          {/* Dek */}
          {dek && dek !== cleanTitle(article.title) && (
            <p className="mb-4 max-w-[60ch] text-body-lg italic leading-relaxed text-muted-foreground">
              {dek}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-13 text-muted-foreground">
            {authorName && (
              <span className="flex items-center gap-1">
                <User size={14} />
                By {authorName}
              </span>
            )}
            {article.published_at && (
              <span className="flex items-center gap-1">
                <Calendar size={14} />
                {format(new Date(article.published_at), 'MMMM d, yyyy')}
              </span>
            )}
            {article.published_at && (
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}
              </span>
            )}
            {readMins && (
              <span className="flex items-center gap-1">
                <BookOpen size={14} />
                {readMins} min read
              </span>
            )}
            {article.views_count > 0 && (
              <span className="flex items-center gap-1">
                <Eye size={14} />
                {article.views_count} views
              </span>
            )}
          </div>
        </div>

        {/* Action row — one accent CTA, the rest monochrome */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {isAdmin && (
            <EditorsPickToggle
              articleId={article.id}
              initialValue={!!article.is_editors_pick}
              onChange={(next) => patchArticle({ is_editors_pick: next })}
            />
          )}
          <FavoriteButton itemId={article.id} type="news" />
          <ReportButton contentType="news_article" contentId={article.id} />
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 size={16} className="mr-1.5" />
            {t('newsDetail.share', 'Share')}
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={() => window.open(article.url, '_blank', 'noopener')}
          >
            <ExternalLink size={16} className="mr-1.5" />
            Read at source
          </Button>
        </div>
      </header>

      <IntegrityNotice flags={article.integrity_flags} />

      <div className="mt-6">
        <PersonalizationRibbon
          countryIds={article.country_ids}
          cityIds={article.city_ids}
          countryNames={countryNames}
          cityNames={cityNames}
        />
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
        {/* Main */}
        <div className="flex flex-col gap-6">
          {/* Podcast episode */}
          {article.media_type === 'podcast' && article.audio_url && (
            <div className="max-w-[68ch]">
              <PodcastPlayer
                audioUrl={article.audio_url}
                title={cleanTitle(article.title)}
                durationSeconds={article.duration_seconds}
              />
            </div>
          )}

          {/* Body */}
          <article className="max-w-[68ch]">
            <Editable
              contentType="news_articles"
              recordId={article.id}
              field={contentText || !excerptText ? 'content' : 'excerpt'}
              value={contentText || excerptText || ''}
              onSaved={(next) =>
                patchArticle({
                  [contentText || !excerptText ? 'content' : 'excerpt']: String(next ?? ''),
                } as Partial<NewsArticleFull>)
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

            {/* Quiet source attribution — one outbound link, no second button. */}
            <p className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
              {sourceName ? `Originally published by ${sourceName}. ` : ''}
              <a href={article.url} target="_blank" rel="noopener noreferrer">
                View the original report
              </a>
              .
            </p>
          </article>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <DestinationSafetyCard countryIds={article.country_ids ?? []} />
          <StoryClusterPanel articleId={article.id} />
          <TagsCard tags={tags} />
          <LocationCard
            cityIds={article.city_ids}
            countryIds={article.country_ids}
            cityNames={cityNames}
            countryNames={countryNames}
          />
          <SourceCard
            sourceName={sourceName}
            sourceUrl={sourceUrl}
            corroborationCount={article.corroboration_count}
            lastVerifiedAt={article.last_verified_at}
          />
        </div>
      </div>

      <RelatedNewsRail articleId={article.id} className="mt-12" />
    </div>
  );
}
