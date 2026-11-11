import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Rss, ExternalLink } from '@/components/icons';
import { useMeta } from '@/hooks/useMeta';
import { usePodcastShow, usePodcastEpisodes } from '@/hooks/usePodcasts';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { boundArticleBody } from '@/utils/htmlDecode';
import { Skeleton } from '@/components/ui/skeleton';
import { EpisodeRow } from '@/components/podcasts/EpisodeRow';
import { ShowArtwork } from '@/components/podcasts/ShowArtwork';

/**
 * /podcasts/:slug — one show and its episodes.
 *
 * Episodes link to their existing /news/:slug pages. There is deliberately no
 * /podcasts/:show/:episode URL: 8,000+ episode URLs are already indexed under
 * /news, and a second space would be a canonical fight with them for nothing.
 */
export default function PodcastShow() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data: show, isLoading, isError: showError, refetch: retryShow } = usePodcastShow(slug);
  const {
    data: episodes,
    isLoading: episodesLoading,
    isError: episodesError,
    refetch: retryEpisodes,
  } = usePodcastEpisodes(show?.id);

  // Many show names already carry the word ("TransLash Podcast", "Lez Hang Out
  // | A Lesbian Podcast"), and suffixing unconditionally published
  // "TransLash Podcast Podcast | Queer Guide" — measured on prod. Add it only
  // when the name does not already say it.
  const showTitle = show
    ? /podcast/i.test(show.name)
      ? show.name
      : t('podcasts.showMetaTitle', '{{name}} Podcast', { name: show.name })
    : undefined;

  useMeta({
    title: showTitle,
    description: show?.description ?? undefined,
    ogImage: show?.artwork_url ?? undefined,
    canonicalPath: slug ? `/podcasts/${slug}` : undefined,
    jsonLd: show
      ? {
          '@context': 'https://schema.org',
          '@type': 'PodcastSeries',
          name: show.name,
          description: show.description ?? undefined,
          url: `https://queer.guide/podcasts/${show.slug}`,
          image: show.artwork_url ?? undefined,
          webFeed: show.url ?? undefined,
          sameAs: show.website_url ?? undefined,
        }
      : undefined,
  });

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="mb-6 h-40 w-full rounded-container" />
        <Skeleton className="h-64 w-full rounded-container" />
      </PageContainer>
    );
  }

  if (showError && !show) {
    return (
      <PageContainer size="reading">
        <h1 className="font-display text-headline">
          {t('podcasts.loadFailed', 'This show could not load')}
        </h1>
        <Button className="mt-4" onClick={() => void retryShow()}>
          {t('common.retry', 'Try again')}
        </Button>
      </PageContainer>
    );
  }

  if (!show) {
    return (
      <PageContainer size="reading">
        <h1 className="mb-4 font-display text-headline">
          {t('podcasts.notFound', 'Show not found')}
        </h1>
        <p className="text-muted-foreground">
          {t('podcasts.notFoundDesc', "This podcast doesn't exist, or it is no longer active.")}
        </p>
        <LocalizedLink to="/podcasts" className="mt-6 inline-block">
          {t('podcasts.backToHub', 'All podcasts')}
        </LocalizedLink>
      </PageContainer>
    );
  }

  const description = show.description?.trim() ?? '';
  const opening = boundArticleBody(description, 280);
  const latestEpisode = episodes?.[0];
  const earlierEpisodes = episodes?.slice(1) ?? [];

  return (
    <PageContainer>
      <nav className="mb-6 text-2xs uppercase tracking-wider text-muted-foreground">
        <LocalizedLink to="/podcasts" className="no-underline text-inherit hover:underline">
          {t('podcasts.title', 'Podcasts')}
        </LocalizedLink>
      </nav>

      <header className="mb-6 border-b border-border-hairline pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-words font-display text-headline leading-tight md:text-display">
              {show.name}
            </h1>
            <p className="mt-2 text-13 text-muted-foreground">
              {t('podcasts.episodeCount', '{{count}} episodes', { count: show.episode_count })}
            </p>
          </div>
          <div className="w-20 shrink-0 overflow-hidden rounded-container sm:w-32">
            <ShowArtwork show={show} />
          </div>
        </div>
        {description && <p className="mt-4 max-w-reading text-body-lg leading-relaxed">{opening.text}</p>}
        {opening.truncated && (
          <details className="mt-4 max-w-reading text-15">
            <summary className="cursor-pointer py-2 font-semibold underline underline-offset-4">
              {t('podcasts.aboutShow', 'About the show')}
            </summary>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-muted-foreground">{description}</p>
          </details>
        )}
        <div className="mt-6 flex flex-wrap gap-4 text-13">
          {show.website_url && (
            <a
              href={show.website_url}
              rel="nofollow noopener"
              target="_blank"
              className="inline-flex items-center gap-1.5"
            >
              <ExternalLink className="size-4" aria-hidden />
              {t('podcasts.website', 'Website')}
            </a>
          )}
          {show.url && (
            <a
              href={show.url}
              rel="nofollow noopener"
              target="_blank"
              className="inline-flex items-center gap-1.5"
            >
              <Rss className="size-4" aria-hidden />
              {t('podcasts.rssFeed', 'RSS feed')}
            </a>
          )}
        </div>
      </header>

      {episodesLoading ? (
        <Skeleton className="h-64 w-full rounded-container" />
      ) : episodesError && !episodes?.length ? (
        <div className="flex flex-col items-start gap-4">
          <p>{t('podcasts.episodesLoadFailed', 'Episodes could not load.')}</p>
          <Button variant="outline" onClick={() => void retryEpisodes()}>
            {t('common.retry', 'Try again')}
          </Button>
        </div>
      ) : latestEpisode ? (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="latest-episode">
            <h2 id="latest-episode" className="mb-4 font-sans text-title font-bold">
              {t('podcasts.latestEpisode', 'Latest episode')}
            </h2>
            <ul>
              <EpisodeRow episode={latestEpisode} showName={show.name} artwork={show.artwork_url} featured />
            </ul>
          </section>
          {earlierEpisodes.length > 0 && (
            <section aria-labelledby="show-episodes">
              <h2 id="show-episodes" className="mb-4 font-sans text-title font-bold">
                {t('podcasts.moreEpisodes', 'More episodes')}
              </h2>
              <ul className="flex flex-col gap-1">
                {earlierEpisodes.map((episode) => (
                  <EpisodeRow key={episode.id} episode={episode} showName={show.name} artwork={show.artwork_url} />
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground">{t('podcasts.noEpisodes', 'No episodes yet.')}</p>
      )}
    </PageContainer>
  );
}
