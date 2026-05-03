import { AlertTriangle, ExternalLink, Newspaper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useTripNews } from '@/hooks/useTripNews';

interface Props {
  countryIds: string[];
}

/**
 * News stream for a trip's destination countries — last 30 days, ranked
 * recency-first. Articles whose title/excerpt match safety + LGBTQ+
 * keywords get an amber alert glyph. Renders nothing when no countries
 * resolve (e.g. trip with only custom-address places).
 */
export function TripNewsSection({ countryIds }: Props) {
  const { t, i18n } = useTranslation();
  const { data: articles, isLoading } = useTripNews(countryIds);

  if (countryIds.length === 0) return null;

  if (isLoading) {
    return (
      <div className="mt-8">
        <SectionHeading />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[68px] w-full" />
          <Skeleton className="h-[68px] w-full" />
          <Skeleton className="h-[68px] w-full" />
        </div>
      </div>
    );
  }

  if (!articles || articles.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeading />
        <p className="text-sm text-muted-foreground py-4">
          {t('trips.news.empty', 'No recent news for these destinations.')}
        </p>
      </div>
    );
  }

  const flaggedCount = articles.filter((a) => a.isSafetyFlagged).length;

  return (
    <div className="mt-8">
      <SectionHeading flaggedCount={flaggedCount} />
      <div className="flex flex-col gap-1">
        {articles.map((article) => (
          <a
            key={article.id}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-3 no-underline text-inherit border-t border-border first-of-type:border-t-0 transition-colors hover:bg-muted"
          >
            {article.isSafetyFlagged ? (
              <AlertTriangle
                style={{
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  marginTop: 3,
                  color: '#b45309',
                }}
                aria-label={t('trips.news.safetyFlag', 'Safety-relevant')}
              />
            ) : (
              <Newspaper
                style={{ width: 16, height: 16, flexShrink: 0, marginTop: 3, opacity: 0.4 }}
                aria-hidden
              />
            )}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm leading-tight overflow-hidden ${article.isSafetyFlagged ? 'font-bold' : 'font-medium'}`}
                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
              >
                {article.title}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground" style={{ fontSize: 11 }}>
                {article.publisher_name && <span>{article.publisher_name}</span>}
                {article.publisher_name && <span>·</span>}
                <span>
                  {formatDistanceToNow(new Date(article.published_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>
            <ExternalLink
              style={{ width: 12, height: 12, flexShrink: 0, marginTop: 5, opacity: 0.4 }}
              aria-hidden
            />
          </a>
        ))}
      </div>
      <p className="block mt-3 text-muted-foreground" style={{ fontSize: 11 }}>
        {t('trips.news.disclaimer', {
          defaultValue:
            'News from {{lang}} sources, last 30 days. Safety flags are heuristic — verify with official advisories.',
          lang: i18n.language.toUpperCase(),
        })}
      </p>
    </div>
  );
}

function SectionHeading({ flaggedCount = 0 }: { flaggedCount?: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="font-bold uppercase text-muted-foreground" style={{ letterSpacing: '0.04em', fontSize: '0.7rem' }}>
        {t('trips.news.heading', 'Recent news from your destinations')}
      </p>
      {flaggedCount > 0 && (
        <div
          className="inline-flex items-center gap-1 px-2 py-0.5 font-bold"
          style={{
            backgroundColor: 'rgba(244,67,54,0.1)',
            color: 'var(--destructive)',
            fontSize: 11,
          }}
        >
          <AlertTriangle style={{ width: 11, height: 11 }} />
          {t('trips.news.flaggedBadge', '{{count}} safety alerts', { count: flaggedCount })}
        </div>
      )}
    </div>
  );
}
