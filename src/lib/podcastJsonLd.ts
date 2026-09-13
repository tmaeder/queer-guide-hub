/**
 * Structured data for a podcast episode.
 *
 * An episode was being described to crawlers as a `NewsArticle` with no audio
 * in it — the type is wrong, and the one property that matters (where the audio
 * is) was absent, so nothing could ever surface these as listenable results.
 *
 * The same shape is emitted by the bot-UA renderer in functions/_lib/detail.ts.
 * That file cannot import from src/, so the two are deliberate copies; the e2e
 * asserts the served OUTPUT rather than either implementation, which is the
 * only check that can notice them diverging.
 */

/** Seconds → ISO-8601 duration. schema.org wants `PT1H2M30S`, not `3750`. */
export function isoDuration(seconds: number | null | undefined): string | undefined {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s || (!h && !m) ? `${s}S` : ''}`;
}

export interface EpisodeLdInput {
  title: string;
  slug: string;
  excerpt?: string | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  audioUrl: string;
  durationSeconds?: number | null;
  showName?: string | null;
  showSlug?: string | null;
}

export function podcastEpisodeJsonLd(ep: EpisodeLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    name: ep.title,
    description: ep.excerpt || undefined,
    datePublished: ep.publishedAt || undefined,
    image: ep.imageUrl || undefined,
    url: `https://queer.guide/news/${ep.slug}`,
    associatedMedia: {
      '@type': 'AudioObject',
      contentUrl: ep.audioUrl,
      // The overwhelming majority of this corpus is mpeg; the feeds do declare
      // a type, but we do not store it, and guessing per-extension would be a
      // claim we cannot back. One honest default beats a wrong specific one.
      encodingFormat: 'audio/mpeg',
      duration: isoDuration(ep.durationSeconds),
    },
    timeRequired: isoDuration(ep.durationSeconds),
    partOfSeries: ep.showName
      ? {
          '@type': 'PodcastSeries',
          name: ep.showName,
          url: ep.showSlug ? `https://queer.guide/podcasts/${ep.showSlug}` : undefined,
        }
      : undefined,
  };
}
