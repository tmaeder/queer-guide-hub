import React, { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useNews } from '@/hooks/useNews';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { getRandomFallbackImage } from '@/utils/fallbackImages';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';

type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  image_url?: string | null;
  published_at: string;
  publisher_name?: string | null;
};

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
const decodeHtmlEntities = (text: string): string =>
  text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    }
    return ENTITY_MAP[body.toLowerCase()] ?? _;
  });

const Hairline = () => <div className="h-px bg-current opacity-10" />;

const DISPLAY_FONT = "'Inter', sans-serif";

const LatestNewsSlider = React.memo(() => {
  const { articles, loading, error } = useNews();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const latest = useMemo<Article[]>(() => {
    return articles.slice(0, 6) as unknown as Article[];
  }, [articles]);

  const { assets } = useEntityImageAssets('news_article', useMemo(() => latest.map((a) => a.id), [latest]));

  if (loading && latest.length === 0) {
    return (
      <section className="w-full px-4 py-8 sm:px-6 md:px-8 md:py-16">
        <div className="mb-4 h-8 w-40 animate-pulse bg-muted md:w-60" />
        <Hairline />
        <div className="mt-6 grid grid-cols-1 gap-y-6 md:mt-8 md:grid-cols-[11fr_9fr] md:gap-x-8 md:gap-y-0">
          <div className="aspect-[3/2] w-full animate-pulse bg-muted" />
          <div className="flex flex-col gap-4">
            {Array.from({ length: isMobile ? 3 : 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse bg-muted" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || latest.length === 0) return null;

  const [feature, ...rest] = latest;
  const list = rest.slice(0, 5);

  return (
    <section className="w-full px-4 py-8 sm:px-6 md:px-8 md:py-16">
      {/* Header */}
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2
          className="m-0 text-[1.75rem] font-extrabold leading-[1.1] tracking-tight md:text-[2.25rem]"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {t('home.news.title', 'Latest News')}
        </h2>
        <LocalizedLink
          to="/news"
          className="whitespace-nowrap text-[0.8125rem] text-foreground no-underline transition-opacity hover:opacity-70 md:text-sm"
        >
          {t('common.allStories', 'All stories')} →
        </LocalizedLink>
      </div>
      <Hairline />

      {/* Feature + list */}
      <div className="mt-6 grid grid-cols-1 gap-y-6 md:mt-8 md:grid-cols-[11fr_9fr] md:gap-x-8 md:gap-y-0">
        {/* Feature story */}
        <LocalizedLink
          to={`/news/${feature.slug}`}
          className="block text-foreground no-underline transition-opacity hover:opacity-85"
        >
          <div className="mb-4 aspect-[3/2] w-full overflow-hidden bg-muted">
              <img
                src={
                  resolveImageUrl({
                    imageUrl: feature.image_url,
                    optimizedUrl: assets.get(feature.id)?.optimized_url ?? null,
                    thumbnailUrl: assets.get(feature.id)?.thumbnail_url ?? null,
                  }) || getRandomFallbackImage()
                }
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="block h-full w-full object-cover"
              />
            </div>
          <div
            className="mb-3 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground"
            style={{ letterSpacing: '0.06em' }}
          >
            {feature.publisher_name && (
              <>
                <span>{feature.publisher_name}</span>
                <span className="opacity-40">·</span>
              </>
            )}
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {format(new Date(feature.published_at), 'MMM d, yyyy')}
            </span>
          </div>
          <h3
            className="m-0 mb-3 overflow-hidden font-extrabold leading-[1.1]"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: 'clamp(1.75rem, 4vw, 3rem)',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {decodeHtmlEntities(feature.title)}
          </h3>
          {feature.excerpt && (
            <div
              className="overflow-hidden text-[0.9375rem] leading-normal text-muted-foreground md:text-base"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {decodeHtmlEntities(feature.excerpt)}
            </div>
          )}
        </LocalizedLink>

        {/* List */}
        <div>
          {list.map((a, idx) => (
            <React.Fragment key={a.id}>
              {idx > 0 && <Hairline />}
              <LocalizedLink
                to={`/news/${a.slug}`}
                className="group grid grid-cols-[auto_1fr] items-baseline gap-x-4 py-3 text-foreground no-underline md:py-4"
              >
                <div
                  className="text-sm font-normal text-muted-foreground"
                  style={{ fontFamily: DISPLAY_FONT, fontVariantNumeric: 'tabular-nums' }}
                >
                  {String(idx + 2).padStart(2, '0')}
                </div>
                <div className="min-w-0">
                  <div
                    className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-medium uppercase text-muted-foreground"
                    style={{ letterSpacing: '0.06em' }}
                  >
                    {a.publisher_name && (
                      <>
                        <span>{a.publisher_name}</span>
                        <span className="opacity-40">·</span>
                      </>
                    )}
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {format(new Date(a.published_at), 'MMM d')}
                    </span>
                  </div>
                  <div
                    className="overflow-hidden text-[0.9375rem] font-semibold leading-[1.3] transition-colors group-hover:text-[hsl(var(--foreground))] md:text-base"
                    style={{
                      fontFamily: DISPLAY_FONT,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {decodeHtmlEntities(a.title)}
                  </div>
                </div>
              </LocalizedLink>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
});
LatestNewsSlider.displayName = 'LatestNewsSlider';

export default LatestNewsSlider;
