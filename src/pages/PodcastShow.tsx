import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Rss, ExternalLink } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { usePodcastShow, usePodcastEpisodes } from '@/hooks/usePodcasts';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
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
  const { data: show, isLoading } = usePodcastShow(slug);
  const { data: episodes, isLoading: episodesLoading } = usePodcastEpisodes(show?.id);

  useMeta({
    title: show ? t('podcasts.showMetaTitle', '{{name}} Podcast', { name: show.name }) : undefined,
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

  return (
    <PageContainer>
      <nav className="mb-6 text-2xs uppercase tracking-wider text-muted-foreground">
        <LocalizedLink to="/podcasts" className="no-underline text-inherit hover:underline">
          {t('podcasts.title', 'Podcasts')}
        </LocalizedLink>
      </nav>

      <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="w-40 shrink-0 overflow-hidden rounded-container">
          <ShowArtwork show={show} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-headline">{show.name}</h1>
          <p className="mt-2 text-2xs uppercase tracking-wider text-muted-foreground">
            {t('podcasts.episodeCount', '{{count}} episodes', { count: show.episode_count })}
          </p>
          {show.description && (
            <p className="mt-4 max-w-prose text-body-lg text-muted-foreground">
              {show.description}
            </p>
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
        </div>
      </header>

      <section aria-labelledby="show-episodes">
        <h2 id="show-episodes" className="mb-4 text-title font-bold">
          {t('podcasts.episodes', 'Episodes')}
        </h2>
        {episodesLoading && <Skeleton className="h-64 w-full rounded-container" />}
        {!episodesLoading && (episodes?.length ?? 0) === 0 && (
          <p className="text-muted-foreground">{t('podcasts.noEpisodes', 'No episodes yet.')}</p>
        )}
        <ul className="flex flex-col gap-1">
          {(episodes ?? []).map((ep) => (
            <EpisodeRow key={ep.id} episode={ep} showName={show.name} artwork={show.artwork_url} />
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}
