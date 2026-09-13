import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isoDuration, podcastEpisodeJsonLd } from '../podcastJsonLd';

const ROOT = join(__dirname, '../../..');

describe('isoDuration', () => {
  it('emits schema.org ISO-8601, not a bare number', () => {
    expect(isoDuration(3750)).toBe('PT1H2M30S');
    expect(isoDuration(90)).toBe('PT1M30S');
    expect(isoDuration(45)).toBe('PT45S');
    expect(isoDuration(3600)).toBe('PT1H');
  });

  it('returns undefined rather than a zero duration', () => {
    // A missing duration must be ABSENT from the document. `PT0S` is a claim
    // that the episode is zero seconds long, which is worse than saying
    // nothing — 3,046 rows had no duration at all before the staging backfill.
    expect(isoDuration(null)).toBeUndefined();
    expect(isoDuration(undefined)).toBeUndefined();
    expect(isoDuration(0)).toBeUndefined();
    expect(isoDuration(-5)).toBeUndefined();
    expect(isoDuration(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('podcastEpisodeJsonLd', () => {
  const ep = {
    title: 'Ep 396: Reddit Rabbithole pt. 26',
    slug: 'ep-396-reddit-rabbithole',
    excerpt: 'Show notes.',
    imageUrl: 'https://cdn.example/art.jpg',
    publishedAt: '2026-09-01T00:00:00Z',
    audioUrl: 'https://cdn.example/396.mp3',
    durationSeconds: 3750,
    showName: 'Sounds Fake But Okay',
    showSlug: 'sounds-fake-but-okay',
  };

  it('is a PodcastEpisode carrying its audio, not a NewsArticle', () => {
    const ld = podcastEpisodeJsonLd(ep);
    expect(ld['@type']).toBe('PodcastEpisode');
    const media = ld.associatedMedia as Record<string, unknown>;
    expect(media['@type']).toBe('AudioObject');
    expect(media.contentUrl).toBe(ep.audioUrl);
    expect(media.duration).toBe('PT1H2M30S');
  });

  it('links the series so an episode is reachable from its show', () => {
    const series = podcastEpisodeJsonLd(ep).partOfSeries as Record<string, unknown>;
    expect(series['@type']).toBe('PodcastSeries');
    expect(series.name).toBe('Sounds Fake But Okay');
    expect(series.url).toBe('https://queer.guide/podcasts/sounds-fake-but-okay');
  });

  it('omits the series rather than inventing one when the show is unknown', () => {
    expect(podcastEpisodeJsonLd({ ...ep, showName: null }).partOfSeries).toBeUndefined();
  });

  it('keeps the episode on its /news/ URL', () => {
    // There is deliberately no /podcasts/:show/:episode space: 8,000+ episode
    // URLs are already indexed under /news, and a second one would fight them
    // for the canonical.
    expect(podcastEpisodeJsonLd(ep).url).toBe('https://queer.guide/news/ep-396-reddit-rabbithole');
  });
});

describe('the crawler path emits the same shape', () => {
  // functions/ cannot import from src/, so detail.ts carries its own copy.
  // These assert the copy exists and agrees on the parts that matter; the e2e
  // asserts the SERVED output, which is the only check that sees them diverge.
  const detail = readFileSync(join(ROOT, 'functions/_lib/detail.ts'), 'utf8');

  it('newsDetail branches on media_type and selects the audio column', () => {
    expect(detail).toMatch(
      /'title,slug,excerpt,author,image_url,published_at,url,publisher_name,updated_at,seo_indexable,media_type,audio_url,duration_seconds,source_id'/,
    );
    expect(detail).toMatch(/stringField\(row, 'media_type'\) === 'podcast'/);
  });

  it('emits PodcastEpisode + AudioObject, not NewsArticle, for an episode', () => {
    const branch = detail.slice(
      detail.indexOf("stringField(row, 'media_type') === 'podcast'"),
      detail.indexOf('// News detail pages are first-class again'),
    );
    expect(branch).toContain("'@type': 'PodcastEpisode'");
    expect(branch).toContain("'@type': 'AudioObject'");
    expect(branch).toContain('contentUrl: audioUrl');
    expect(branch).not.toContain("'@type': 'NewsArticle'");
  });

  it('registers /podcasts as a LITERAL route segment', () => {
    // `podcasts?` would silently mint a second /podcast/:slug URL space that
    // nothing links to and nothing canonicalises.
    expect(detail).toMatch(/venues\?\|events\?\|news\|podcasts\|/);
    expect(detail).not.toMatch(/\|podcasts\?\|/);
  });

  it('gates a show page on having episodes', () => {
    const show = detail.slice(detail.indexOf('async function podcastShowDetail'));
    expect(show).toMatch(/indexable: Number\(row\.episode_count \?\? 0\) > 0/);
  });
});

describe('the hub, the sitemap and the crawler body share one gate', () => {
  // Three surfaces decide which shows are public. If they disagree, one of
  // them advertises a URL another one 404s or deindexes.
  const GATE = 'feed_type=eq.podcast&is_active=eq.true&episode_count=gt.0';

  it('hubLinks and sitemap-podcasts use the identical filter literal', () => {
    const hub = readFileSync(join(ROOT, 'functions/_lib/hubLinks.ts'), 'utf8');
    const sitemap = readFileSync(join(ROOT, 'functions/sitemap-podcasts.xml.ts'), 'utf8');
    expect(hub).toContain(GATE);
    expect(sitemap).toContain(GATE);
  });

  it('the client hook applies the same three conditions', () => {
    const hook = readFileSync(join(ROOT, 'src/hooks/usePodcasts.ts'), 'utf8');
    expect(hook).toMatch(/\.eq\('feed_type', 'podcast'\)/);
    expect(hook).toMatch(/\.eq\('is_active', true\)/);
    expect(hook).toMatch(/\.gt\('episode_count', 0\)/);
  });
});
