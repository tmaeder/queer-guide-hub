import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { fetchStoryBySlug, type StoryDetail } from '@/hooks/useNewsStories';
import { useDetailMeta } from '@/hooks/useDetailMeta';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ArrowLeft, ArrowRight, Newspaper } from '@/components/icons';
import { format, isValid } from 'date-fns';
import { safeText } from '@/utils/safeDisplay';
import { decodeHtmlEntities } from '@/utils/htmlDecode';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageContainer } from '@/components/layout/PageContainer';

export default function NewsStoryDetail() {
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

  const title = story ? safeText(decodeHtmlEntities(story.title)) : 'Story';
  useDetailMeta({
    status: loading ? 'loading' : !story ? 'notFound' : 'ready',
    notFoundTitle: 'Story not found',
    title,
    description: story?.summary || `${story?.article_count ?? ''} articles covering ${title}`,
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
          title="Story not found"
          description="This story may have been removed."
          primaryAction={{ label: 'Back to News', onClick: () => window.history.back() }}
        />
      </PageContainer>
    );
  }

  const featured = story.articles.find((article) => article.id === story.hero_article_id)
    ?? story.articles[0];
  const otherArticles = story.articles.filter((article) => article.id !== featured?.id);
  const updatedAt = new Date(story.last_updated_at);

  return (
    <PageContainer size="reading">
      <LocalizedLink
        to="/news"
        className="mb-6 inline-flex items-center gap-2 text-13 text-muted-foreground no-underline hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Back to News
      </LocalizedLink>

      <header className="border-b border-border-hairline pb-6">
        <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">News · Story</p>
        <h1 className="mt-2 break-words font-display text-headline leading-tight md:text-display">
          {title}
        </h1>
        {story.summary && (
          <p className="mt-4 text-body-lg leading-relaxed">{story.summary}</p>
        )}
        <p className="mt-4 text-13 text-muted-foreground">
          {story.article_count} {story.article_count === 1 ? 'article' : 'articles'}
          {isValid(updatedAt) && (
            <> · Updated <time dateTime={story.last_updated_at}>{format(updatedAt, 'PP')}</time></>
          )}
        </p>
      </header>

      {featured ? (
        <section aria-labelledby="story-coverage" className="mt-6">
          <h2 id="story-coverage" className="font-sans text-title font-bold">Coverage</h2>
          <LocalizedLink
            to={`/news/${featured.slug}`}
            className="mt-4 flex items-center justify-between gap-4 rounded-container border border-border-hairline bg-card p-4 text-inherit no-underline hover:bg-muted sm:p-6"
          >
            <div className="min-w-0">
              <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">Start here</p>
              <h3 className="mt-2 break-words font-sans text-title font-bold leading-snug">
                {safeText(decodeHtmlEntities(featured.title))}
              </h3>
            </div>
            <ArrowRight size={18} className="shrink-0" aria-hidden="true" />
          </LocalizedLink>

          {otherArticles.length > 0 && (
            <ol className="m-0 mt-4 flex list-none flex-col divide-y divide-border-hairline p-0">
              {otherArticles.map((article) => {
                const publishedAt = article.published_at && new Date(article.published_at);
                return (
                  <li key={article.id}>
                    <LocalizedLink
                      to={`/news/${article.slug}`}
                      className="flex items-start gap-4 rounded-element py-4 text-inherit no-underline hover:bg-muted"
                    >
                      {article.image_url && (
                        <img
                          loading="lazy"
                          src={article.image_url}
                          alt=""
                          width={120}
                          height={80}
                          className="aspect-[3/2] h-auto w-16 shrink-0 rounded-element object-cover sm:w-[120px]"
                        />
                      )}
                      <div className="min-w-0">
                        <h3 className="break-words text-base font-semibold leading-snug">
                          {safeText(decodeHtmlEntities(article.title))}
                        </h3>
                        {publishedAt && isValid(publishedAt) && (
                          <time dateTime={article.published_at ?? undefined} className="mt-2 block text-13 text-muted-foreground">
                            {format(publishedAt, 'PP')}
                          </time>
                        )}
                      </div>
                    </LocalizedLink>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ) : (
        <p className="mt-6 text-muted-foreground">Coverage is currently unavailable.</p>
      )}
    </PageContainer>
  );
}
