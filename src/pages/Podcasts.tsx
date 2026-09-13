import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Headphones } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { usePodcastShows, useLatestEpisodes } from '@/hooks/usePodcasts';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EpisodeRow } from '@/components/podcasts/EpisodeRow';
import { ShowArtwork } from '@/components/podcasts/ShowArtwork';

/**
 * /podcasts — the hub.
 *
 * 8,332 episodes existed for two and a half months with no route at all: the
 * only way to reach any of them was a "Podcasts only" switch buried in the
 * filter sheet on /news/all, on a page where that filter component is not
 * mounted. This is the entry point.
 *
 * Shows with zero episodes are excluded by the hook, not here — the same
 * predicate gates the crawler hub body and the sitemap, and they have to agree.
 */
export default function Podcasts() {
  const { t } = useTranslation();
  const { data: shows, isLoading } = usePodcastShows();
  const { data: latest } = useLatestEpisodes(8);

  const showCount = shows?.length ?? 0;
  const episodeTotal = (shows ?? []).reduce((n, s) => n + (s.episode_count ?? 0), 0);

  // source_id -> show, so the latest strip can attribute an episode without a
  // second query: the hub already holds every show.
  //
  // Without it the mini-bar and the OS lock screen said "Queer Guide" where the
  // show name belongs — measured on prod, mediaSession.metadata.artist read
  // "Queer Guide" for a TransLash episode. The show page never had this problem
  // because it passes its own name; only the cross-show strip did.
  const showsById = useMemo(() => new Map((shows ?? []).map((s) => [s.id, s])), [shows]);

  useMeta({
    title: t('podcasts.metaTitle', 'LGBTQ+ Podcasts'),
    description: t(
      'podcasts.metaDescription',
      'Queer podcasts from around the world. History, politics, culture and community, with new episodes as they publish.',
    ),
    canonicalPath: '/podcasts',
  });

  return (
    <PageContainer>
      <header className="mb-10">
        <p className="mb-2 flex items-center gap-2 text-2xs uppercase tracking-wider text-muted-foreground">
          <Headphones className="size-4" aria-hidden />
          {t('podcasts.eyebrow', 'Listen')}
        </p>
        <h1 className="font-display text-display">{t('podcasts.title', 'Podcasts')}</h1>
        {showCount > 0 && (
          <p className="mt-2 text-body-lg text-muted-foreground">
            {t('podcasts.subtitle', '{{shows}} shows, {{episodes}} episodes.', {
              shows: showCount,
              episodes: episodeTotal,
            })}
          </p>
        )}
      </header>

      {latest && latest.length > 0 && (
        <section className="mb-12" aria-labelledby="podcasts-latest">
          <h2 id="podcasts-latest" className="mb-4 text-title font-bold">
            {t('podcasts.latest', 'Latest episodes')}
          </h2>
          <ul className="flex flex-col gap-2">
            {latest.map((ep) => {
              const show = ep.source_id ? showsById.get(ep.source_id) : undefined;
              return (
                <EpisodeRow
                  key={ep.id}
                  episode={ep}
                  showName={show?.name ?? null}
                  artwork={show?.artwork_url ?? null}
                />
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="podcasts-shows">
        <h2 id="podcasts-shows" className="mb-4 text-title font-bold">
          {t('podcasts.allShows', 'All shows')}
        </h2>

        {isLoading && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-container" />
            ))}
          </div>
        )}

        {!isLoading && showCount === 0 && (
          <p className="text-muted-foreground">{t('podcasts.empty', 'No shows yet.')}</p>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {(shows ?? []).map((show) => (
            <LocalizedLink
              key={show.id}
              to={`/podcasts/${show.slug}`}
              className="group no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-container"
            >
              <Card className="h-full overflow-hidden">
                <ShowArtwork show={show} />
                <CardContent className="flex flex-col gap-1 p-4">
                  <h3 className="text-15 font-bold leading-tight">{show.name}</h3>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground">
                    {t('podcasts.episodeCount', '{{count}} episodes', {
                      count: show.episode_count,
                    })}
                  </p>
                </CardContent>
              </Card>
            </LocalizedLink>
          ))}
        </div>
      </section>
    </PageContainer>
  );
}
