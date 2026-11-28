import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { fetchStoryBySlug, type StoryDetail, type NewsStoryArticle } from '@/hooks/useNewsStories';
import { useDetailMeta } from '@/hooks/useDetailMeta';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ArrowLeft, ArrowRight, Newspaper } from '@/components/icons';
import { format, isValid } from 'date-fns';
import { safeText } from '@/utils/safeDisplay';
import { decodeHtmlEntities } from '@/utils/htmlDecode';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageContainer } from '@/components/layout/PageContainer';
import { StorySummaryEditor } from '@/components/news/StorySummaryEditor';
import {
  buildCoverage,
  countPublishers,
  coverageLabel,
  type CoverageItem,
} from '@/lib/newsCoverage';

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isValid(d) ? format(d, 'PP') : null;
};

/** Thumbnail that removes itself when the image fails, instead of a broken-image glyph. */
function CoverageThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <img
      loading="lazy"
      src={src}
      alt=""
      width={120}
      height={80}
      onError={() => setFailed(true)}
      className="aspect-[3/2] h-auto w-16 shrink-0 rounded-element object-cover sm:w-[120px]"
    />
  );
}

/** Publisher · date, plus the relationships the metadata supports. */
function CoverageMeta({ item }: { item: CoverageItem<NewsStoryArticle> }) {
  const { t } = useTranslation();
  const date = formatDate(item.article.published_at);
  return (
    <div className="mt-2 flex flex-col gap-0.5 text-13 text-muted-foreground">
      <p className="m-0">
        {item.publisher && <span className="font-semibold text-foreground">{item.publisher}</span>}
        {item.publisher && date && ' · '}
        {date && <time dateTime={item.article.published_at ?? undefined}>{date}</time>}
      </p>
      {item.sameHeadlineAs && (
        <p className="m-0">
          {t('newsStory.sameHeadlineAs', 'Same headline as the earlier {{publisher}} report', {
            publisher: item.sameHeadlineAs,
          })}
        </p>
      )}
      {item.alsoListedBy.length > 0 && (
        <p className="m-0">
          {t('newsStory.alsoListedBy', 'Also listed by {{feeds}}', {
            feeds: item.alsoListedBy.join(', '),
          })}
        </p>
      )}
    </div>
  );
}

function LeadCard({
  item,
  label,
  reason,
}: {
  item: CoverageItem<NewsStoryArticle>;
  label: string;
  reason: string;
}) {
  return (
    <LocalizedLink
      to={`/news/${item.article.slug}`}
      className="flex items-center justify-between gap-4 rounded-container border border-border-hairline bg-card p-4 text-inherit no-underline hover:bg-muted sm:p-6"
    >
      <div className="min-w-0">
        <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">{label}</p>
        <h3 className="mt-2 break-words font-sans text-title font-bold leading-snug">
          {safeText(decodeHtmlEntities(item.article.title))}
        </h3>
        <CoverageMeta item={item} />
        <p className="m-0 mt-2 text-13 text-muted-foreground">{reason}</p>
      </div>
      <ArrowRight size={18} className="shrink-0" aria-hidden="true" />
    </LocalizedLink>
  );
}

export default function NewsStoryDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setLoading(true);
    if (!slug) return;
    fetchStoryBySlug(slug).then((s) => {
      if (cancelled) return;
      setStory(s);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const coverage = useMemo(() => buildCoverage(story?.articles ?? []), [story]);

  const title = story ? safeText(decodeHtmlEntities(story.title)) : t('newsStory.story', 'Story');
  const label = coverageLabel(coverage.length, countPublishers(coverage));
  const labelText = t(label.key, label.defaultValue, {
    count: label.count,
    publishers: label.publishers,
  });
  useDetailMeta({
    status: loading ? 'loading' : !story ? 'notFound' : 'ready',
    notFoundTitle: t('newsStory.notFound', 'Story not found'),
    title,
    description: story?.summary || `${labelText}: ${title}`,
    canonicalPath: slug ? `/news/story/${slug}` : '/news',
    jsonLd: story
      ? {
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: title,
          datePublished: story.first_seen_at,
          dateModified: story.last_updated_at,
          url: `https://queer.guide/news/story/${slug}`,
        }
      : undefined,
  });

  if (loading)
    return (
      <PageContainer>
        <PageLoadingState count={1} />
      </PageContainer>
    );

  if (!story) {
    return (
      <PageContainer>
        <EmptyState
          icon={Newspaper}
          title={t('newsStory.notFound', 'Story not found')}
          description={t('newsStory.notFoundDesc', 'This story may have been removed.')}
          primaryAction={{
            label: t('newsDetail.backToNews', 'Back to News'),
            onClick: () => window.history.back(),
          }}
        />
      </PageContainer>
    );
  }

  // Chronological (oldest first). The first report is the reason to start
  // there; the newest is the latest development. Both reasons are facts the
  // reader can check, unlike an unexplained pick.
  const first = coverage[0];
  const latest = coverage.length > 1 ? coverage[coverage.length - 1] : null;
  const rest = coverage.slice(1, latest ? -1 : undefined);
  const firstDate = formatDate(first?.article.published_at);
  const latestDate = formatDate(latest?.article.published_at ?? story.last_updated_at);

  return (
    <PageContainer size="reading">
      <LocalizedLink
        to="/news"
        className="mb-6 inline-flex items-center gap-2 text-13 text-muted-foreground no-underline hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" /> {t('newsDetail.backToNews', 'Back to News')}
      </LocalizedLink>

      <header className="border-b border-border-hairline pb-6">
        <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
          {t('newsStory.eyebrow', 'News · Story')}
        </p>
        <h1 className="mt-2 break-words font-display text-headline leading-tight md:text-display">
          {title}
        </h1>
        {story.summary && <p className="mt-4 text-body-lg leading-relaxed">{story.summary}</p>}
        <StorySummaryEditor
          storyId={story.id}
          summary={story.summary}
          onSaved={(summary) => setStory({ ...story, summary })}
        />
        <p className="mt-4 text-13 text-muted-foreground">
          {labelText}
          {firstDate && (
            <>
              {' · '}
              {t('newsStory.firstReported', 'First reported {{date}}', { date: firstDate })}
            </>
          )}
          {latestDate && latestDate !== firstDate && (
            <>
              {' · '}
              {t('newsStory.latestUpdate', 'Latest {{date}}', { date: latestDate })}
            </>
          )}
        </p>
      </header>

      {first ? (
        <section aria-labelledby="story-coverage" className="mt-6">
          <h2 id="story-coverage" className="font-sans text-title font-bold">
            {t('newsStory.coverage', 'Coverage')}
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            <LeadCard
              item={first}
              label={t('newsStory.startHere', 'Start here')}
              reason={t('newsStory.startHereReason', 'The first report in this story.')}
            />
            {latest && (
              <LeadCard
                item={latest}
                label={t('newsStory.latestDevelopment', 'Latest development')}
                reason={t('newsStory.latestReason', 'The most recent report in this story.')}
              />
            )}
          </div>

          {rest.length > 0 && (
            <>
              <h3 className="mt-8 font-sans text-base font-bold">
                {t('newsStory.otherReports', 'Other reports, oldest first')}
              </h3>
              <ol className="m-0 mt-2 flex list-none flex-col divide-y divide-border-hairline p-0">
                {rest.map((item) => (
                  <li key={item.article.id}>
                    <LocalizedLink
                      to={`/news/${item.article.slug}`}
                      className="flex items-start gap-4 rounded-element py-4 text-inherit no-underline hover:bg-muted"
                    >
                      <CoverageThumb src={item.article.image_url} />
                      <div className="min-w-0">
                        <h4 className="break-words text-base font-semibold leading-snug">
                          {safeText(decodeHtmlEntities(item.article.title))}
                        </h4>
                        <CoverageMeta item={item} />
                      </div>
                    </LocalizedLink>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      ) : (
        <p className="mt-6 text-muted-foreground">
          {t('newsStory.unavailable', 'Coverage is currently unavailable.')}
        </p>
      )}
    </PageContainer>
  );
}
