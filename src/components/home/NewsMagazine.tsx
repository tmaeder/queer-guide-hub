import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Band } from './Band';
import { Skeleton } from '@/components/ui/skeleton';
import { useNewsFront, useForYouNews } from '@/hooks/useNewsFront';
import { useHomeRegionContext } from './homeRegionContext';
import { timeBucket, rotateWindow } from '@/lib/rotation';
import { useEditorsPick } from '@/hooks/useEditorsPick';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { ExternalImg } from '@/components/ui/ExternalImg';
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
  /** Present on the ranked feed; absent on the editors' pick row. */
  is_read?: boolean;
};

/** Four turns a day: a same-day return sees a different set, while a reload or
 *  a second tab within the window still agrees with itself. */
const NEWS_ROTATION_HOURS = 6;
const SHOWN = 5;
/** Ask for a superset so the window has somewhere to move. */
const POOL = 24;

function meta(a: Article, dateFmt: string): string {
  return [
    resolvePublisherName({ publisherName: a.publisher_name }),
    format(new Date(a.published_at), dateFmt),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Editorial magazine grid for the latest news: one large lead story beside a
 * 2×2 of smaller image cards. Asymmetric and image-forward — deliberately
 * different from the date-grouped Events agenda above it.
 *
 * The source is the RANKED feed, not `published_at desc`. Rotation is not
 * expressible over a recency-ordered list — a window over "newest first" is
 * just older news, which is worse content rather than different content.
 * `get_news_front` ranks by hotness (recency × quality × trending) and re-decays
 * on every refetch, and for signed-in readers the personalized variant adds
 * followed tags, profile interests and geo, and demotes what they have read.
 *
 * Two things make a return visit visibly different:
 *   - the 6-hour bucket moves the window over the pool
 *   - a story already read is pushed to the tail before the window is taken,
 *     so the piece you just opened is not still the lead
 *
 * Within one bucket, with nothing newly read, this renders IDENTICALLY — that
 * is the point. Do not "fix" it with Math.random(): it would break hydration
 * and make the rotation untestable (see src/lib/rotation.ts).
 */
const NewsMagazine = React.memo(() => {
  const { t } = useTranslation();
  const region = useHomeRegionContext();
  const countryIds = region.countryId ? [region.countryId] : null;

  // Signed-in readers get the personalized feed; it returns [] when signed out
  // or when a reader has no interests yet, and the global front is the floor.
  const forYou = useForYouNews(POOL, countryIds);
  const front = useNewsFront(POOL);
  const personalized = forYou.articles.length > 0;
  const articles = personalized ? forYou.articles : front.articles;
  const loading = personalized ? forYou.loading : front.loading && forYou.loading;
  const error = personalized ? forYou.error : front.error;

  const editorsPick = useEditorsPick();

  // Read ONCE on mount. Reading it per render would let useNewsFront's 5-minute
  // poll reorder the page under someone mid-read.
  const [bucket] = useState(() => timeBucket(Date.now(), NEWS_ROTATION_HOURS));

  const latest = useMemo<Article[]>(() => {
    const pick = editorsPick as Article | null;
    const rest = (articles as unknown as Article[]).filter((a) => a.id !== pick?.id);
    // Already-read stories sink before the window is taken, so rotation and
    // "you've seen this" pull in the same direction instead of fighting.
    const ranked = [...rest].sort(
      (a, b) => Number(a.is_read ?? false) - Number(b.is_read ?? false),
    );
    // The editors' pick is pinned: rotating a flagged lead out of the lead slot
    // would defeat the flag.
    return rotateWindow([...(pick ? [pick] : []), ...ranked], SHOWN, bucket, pick ? 1 : 0);
  }, [articles, editorsPick, bucket]);
  const ids = useMemo(() => latest.map((a) => a.id), [latest]);
  const { assets } = useEntityImageAssets('news_article', ids);

  if (error || (!loading && latest.length === 0)) return null;

  if (loading && latest.length === 0) {
    return (
      <Band
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
      </Band>
    );
  }

  const imgFor = (a: Article) =>
    resolveImageUrl({
      imageUrl: a.image_url,
      optimizedUrl: assets.get(a.id)?.optimized_url ?? null,
      thumbnailUrl: assets.get(a.id)?.thumbnail_url ?? null,
    }) || null;

  const [lead, ...rest] = latest;
  const secondary = rest.slice(0, 4);

  return (
    <Band
      title={t('home.news.title', 'Latest News')}
      seeAllHref="/news"
      seeAllLabel={t('common.allStories', 'All stories')}
    >
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.1fr_1fr]">
        {/* Lead story */}
        <LocalizedLink to={`/news/${lead.slug}`} className="group block no-underline">
          <div className="mb-6 aspect-[16/10] overflow-hidden rounded-container bg-muted">
            <ExternalImg
              src={imgFor(lead)}
              cfWidth={1000}
              fallbackSrc={getFallbackImage('news', lead.id)}
              alt=""
              aria-hidden
              className="h-full w-full object-cover transition-transform duration-slow group-hover:scale-[1.02]"
            />
          </div>
          <Eyebrow as="div" className="mb-4">
            {editorsPick?.id === lead.id
              ? `${t('home.news.editorsPick', "Editors' pick")} · ${meta(lead, 'MMM d, yyyy')}`
              : meta(lead, 'MMM d, yyyy')}
          </Eyebrow>
          {/* A card headline must never match the section heading above it.
              This was `md:text-display` — 44px, exactly the size of the
              homepage masthead h2 — so a grid of story titles visually
              outweighed the section that contained them. */}
          <h3 className="text-headline font-bold leading-[1.05] tracking-tight line-clamp-3 transition-opacity group-hover:opacity-80">
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
              <LocalizedLink key={a.id} to={`/news/${a.slug}`} className="group block no-underline">
                <div className="mb-4 aspect-[3/2] overflow-hidden rounded-element bg-muted">
                  <ExternalImg
                    src={imgFor(a)}
                    cfWidth={500}
                    fallbackSrc={getFallbackImage('news', a.id)}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-cover transition-transform duration-slow group-hover:scale-[1.03]"
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
    </Band>
  );
});
NewsMagazine.displayName = 'NewsMagazine';

export default NewsMagazine;
