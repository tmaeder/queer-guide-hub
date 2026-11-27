import { useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Rss, ExternalLink, Play, Pause } from '@/components/icons';
import { useMeta } from '@/hooks/useMeta';
import { usePodcastShow, usePodcastEpisodes } from '@/hooks/usePodcasts';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { boundArticleBody } from '@/utils/htmlDecode';
import { Skeleton } from '@/components/ui/skeleton';
import { EpisodeRow } from '@/components/podcasts/EpisodeRow';
import { ShowArtwork } from '@/components/podcasts/ShowArtwork';
import { Input } from '@/components/ui/input';
import { useAudioPlayer } from '@/hooks/audioPlayerContext';
import { cleanTitle } from '@/utils/htmlDecode';

/** Archive page size. "Show more" grows the query limit by this much. */
const PAGE_SIZE = 30;

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
  const { play, playing, isCurrent } = useAudioPlayer();
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [limit, setLimit] = useState(PAGE_SIZE);
  // The newest episode, independent of the archive's search and order.
  const { data: latestList, isLoading: latestLoading } = usePodcastEpisodes(show?.id, {
    limit: 1,
  });
  const {
    data: episodes,
    isLoading: episodesLoading,
    isFetching: episodesFetching,
    isError: episodesError,
    refetch: retryEpisodes,
  } = usePodcastEpisodes(show?.id, { limit, search, order });

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
  const latestEpisode = latestList?.[0];
  const searching = search.trim().length >= 2;
  // The latest episode already has its own block; list it in the archive only
  // when the reader is searching or reading oldest-first.
  const archive =
    episodes?.filter((e) => searching || order === 'oldest' || e.id !== latestEpisode?.id) ?? [];
  const canLoadMore = (episodes?.length ?? 0) >= limit;
  const latestTitle = latestEpisode ? cleanTitle(latestEpisode.title) : '';
  const latestActive = latestEpisode ? isCurrent(latestEpisode.id) && playing : false;

  return (
    <PageContainer>
      <nav className="mb-6 text-2xs uppercase tracking-wider text-muted-foreground">
        <LocalizedLink to="/podcasts" className="no-underline text-inherit hover:underline">
          {t('podcasts.title', 'Podcasts')}
        </LocalizedLink>
      </nav>

      {/* Identity, listening and following in one block. Only links present in
          the data are shown: the show's site and its RSS feed. */}
      <header className="mb-8 border-b border-border-hairline pb-6">
        <div className="flex items-start gap-4 sm:gap-6">
          <div className="w-20 shrink-0 overflow-hidden rounded-container sm:w-32">
            <ShowArtwork show={show} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="break-words font-display text-headline leading-tight md:text-display">
              {show.name}
            </h1>
            <p className="mt-2 text-13 text-muted-foreground">
              {t('podcasts.episodeCount', '{{count}} episodes', { count: show.episode_count })}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {latestEpisode?.audio_url && (
                <Button
                  onClick={() =>
                    play({
                      id: latestEpisode.id,
                      title: latestTitle,
                      audioUrl: latestEpisode.audio_url!,
                      durationSeconds: latestEpisode.duration_seconds,
                      showName: show.name,
                      artwork: show.artwork_url ?? latestEpisode.image_url ?? null,
                      href: `/news/${latestEpisode.slug}`,
                    })
                  }
                  aria-label={
                    latestActive
                      ? t('audio.pauseEpisode', 'Pause {{title}}', { title: latestTitle })
                      : t('podcasts.playLatestNamed', 'Play latest episode: {{title}}', {
                          title: latestTitle,
                        })
                  }
                >
                  {latestActive ? (
                    <Pause className="size-4" aria-hidden />
                  ) : (
                    <Play className="size-4" aria-hidden />
                  )}
                  {latestActive
                    ? t('podcasts.pause', 'Pause')
                    : t('podcasts.playLatest', 'Play latest episode')}
                </Button>
              )}
              {show.url && (
                <Button asChild variant="outline">
                  <a href={show.url} rel="nofollow noopener" target="_blank">
                    <Rss className="size-4" aria-hidden />
                    {t('podcasts.followRss', 'Follow by RSS')}
                  </a>
                </Button>
              )}
              {show.website_url && (
                <a
                  href={show.website_url}
                  rel="nofollow noopener"
                  target="_blank"
                  className="inline-flex min-h-11 items-center gap-1.5 px-2 text-13"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  {t('podcasts.website', 'Website')}
                </a>
              )}
            </div>
          </div>
        </div>
        {description && (
          <p className="mt-6 max-w-reading text-body-lg leading-relaxed">{opening.text}</p>
        )}
        {opening.truncated && (
          <details className="mt-4 max-w-reading text-15">
            <summary className="cursor-pointer py-2 font-semibold underline underline-offset-4">
              {t('podcasts.aboutShow', 'About the show')}
            </summary>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-muted-foreground">
              {description}
            </p>
          </details>
        )}
      </header>

      {latestLoading ? (
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
              <EpisodeRow
                episode={latestEpisode}
                showName={show.name}
                artwork={show.artwork_url}
                featured
              />
            </ul>
          </section>
          {show.episode_count > 1 && (
            <section aria-labelledby="show-episodes">
              <h2 id="show-episodes" className="mb-4 font-sans text-title font-bold">
                {t('podcasts.allEpisodes', 'All episodes')}
              </h2>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-13">
                  <span className="font-semibold">
                    {t('podcasts.searchEpisodes', 'Search episode titles')}
                  </span>
                  <Input
                    type="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setLimit(PAGE_SIZE);
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-13">
                  <span className="font-semibold">{t('podcasts.sortEpisodes', 'Order')}</span>
                  <select
                    value={order}
                    onChange={(e) => {
                      setOrder(e.target.value as 'newest' | 'oldest');
                      setLimit(PAGE_SIZE);
                    }}
                    className="h-11 rounded-element border border-input bg-background px-2 text-15"
                  >
                    <option value="newest">{t('podcasts.newestFirst', 'Newest first')}</option>
                    <option value="oldest">{t('podcasts.oldestFirst', 'Oldest first')}</option>
                  </select>
                </label>
              </div>
              {episodesLoading ? (
                <Skeleton className="h-64 w-full rounded-container" />
              ) : archive.length > 0 ? (
                <ul className="flex flex-col gap-1" aria-busy={episodesFetching}>
                  {archive.map((episode) => (
                    <EpisodeRow
                      key={episode.id}
                      episode={episode}
                      showName={show.name}
                      artwork={show.artwork_url}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground" role="status">
                  {searching
                    ? t('podcasts.noMatches', 'No episode titles match that search.')
                    : t('podcasts.noEpisodes', 'No episodes yet.')}
                </p>
              )}
              {canLoadMore && (
                <Button
                  variant="outline"
                  className="mt-4"
                  disabled={episodesFetching}
                  onClick={() => setLimit((l) => l + PAGE_SIZE)}
                >
                  {t('podcasts.showMore', 'Show more episodes')}
                </Button>
              )}
            </section>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground">{t('podcasts.noEpisodes', 'No episodes yet.')}</p>
      )}
    </PageContainer>
  );
}
