import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { HomeSection } from './HomeSection';
import { Skeleton } from '@/components/ui/skeleton';
import { useLatestNews } from '@/hooks/useLatestNews';
import { useEditorsPick } from '@/hooks/useEditorsPick';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { getFallbackImage } from '@/utils/fallbackImages';
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';
import { resolvePublisherName } from '@/lib/publisherName';

type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  image_url?: string | null;
  published_at: string;
  publisher_name?: string | null;
};

function meta(a: Article, dateFmt: string): string {
  return [resolvePublisherName({ publisherName: a.publisher_name }), format(new Date(a.published_at), dateFmt)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Editorial magazine grid for the latest news: one large lead story beside a
 * 2×2 of smaller image cards. Asymmetric and image-forward — deliberately
 * different from the date-grouped Events agenda above it.
 */
const NewsMagazine = React.memo(() => {
  const { articles, loading, error } = useLatestNews(6);
  const editorsPick = useEditorsPick();
  const { t } = useTranslation();

  // Editors' pick takes the lead slot when one is flagged; latest fill the rest.
  const latest = useMemo<Article[]>(() => {
    const pick = editorsPick as Article | null;
    const rest = (articles as unknown as Article[]).filter((a) => a.id !== pick?.id);
    return [...(pick ? [pick] : []), ...rest].slice(0, 5);
  }, [articles, editorsPick]);
  const ids = useMemo(() => latest.map((a) => a.id), [latest]);
  const { assets } = useEntityImageAssets('news_article', ids);

  if (error || (!loading && latest.length === 0)) return null;

  if (loading && latest.length === 0) {
    return (
      <HomeSection
        title={t('home.news.title', 'Latest News')}
        seeAllHref="/news"
        seeAllLabel={t('common.allStories', 'All stories')}
      >
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.1fr_1fr]">
          <Skeleton className="aspect-[16/10] w-full rounded-container" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/2] w-full rounded-element" />
            ))}
          </div>
        </div>
      </HomeSection>
    );
  }

  const imgFor = (a: Article) =>
    resolveImageUrl({
      imageUrl: a.image_url,
      optimizedUrl: assets.get(a.id)?.optimized_url ?? null,
      thumbnailUrl: assets.get(a.id)?.thumbnail_url ?? null,
    }) || getFallbackImage('news', a.id);

  const [lead, ...rest] = latest;
  const secondary = rest.slice(0, 4);

  return (
    <HomeSection
      title={t('home.news.title', 'Latest News')}
      seeAllHref="/news"
      seeAllLabel={t('common.allStories', 'All stories')}
    >
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.1fr_1fr]">
        {/* Lead story */}
        <LocalizedLink to={`/news/${lead.slug}`} className="group block no-underline">
          <div className="mb-6 aspect-[16/10] overflow-hidden rounded-container bg-muted">
            <img
              src={imgFor(lead)}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const fb = getFallbackImage('news', lead.id);
                if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
              }}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
          </div>
          <Eyebrow as="div" className="mb-4">
            {editorsPick?.id === lead.id
              ? `${t('home.news.editorsPick', "Editors' pick")} · ${meta(lead, 'MMM d, yyyy')}`
              : meta(lead, 'MMM d, yyyy')}
          </Eyebrow>
          <h3 className="text-headline-lg md:text-display font-bold leading-[1.05] tracking-tight line-clamp-3 transition-opacity group-hover:opacity-80">
            {decodeHtmlEntities(lead.title)}
          </h3>
          {lead.excerpt && (
            <p className="mt-4 text-15 md:text-base text-muted-foreground leading-[1.5] line-clamp-3">
              {decodeHtmlEntities(lead.excerpt)}
            </p>
          )}
        </LocalizedLink>

        {/* Secondary stories — 2×2 image cards */}
        {secondary.length > 0 && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-8">
            {secondary.map((a) => (
              <LocalizedLink
                key={a.id}
                to={`/news/${a.slug}`}
                className="group block no-underline"
              >
                <div className="mb-4 aspect-[3/2] overflow-hidden rounded-element bg-muted">
                  <img
                    src={imgFor(a)}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const fb = getFallbackImage('news', a.id);
                      if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                    }}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="mb-2 truncate text-2xs font-semibold uppercase tracking-label text-muted-foreground">
                  {meta(a, 'MMM d')}
                </div>
                <h4 className="text-15 font-semibold leading-tight tracking-tight line-clamp-2 transition-opacity group-hover:opacity-70">
                  {decodeHtmlEntities(a.title)}
                </h4>
              </LocalizedLink>
            ))}
          </div>
        )}
      </div>
    </HomeSection>
  );
});
NewsMagazine.displayName = 'NewsMagazine';

export default NewsMagazine;
