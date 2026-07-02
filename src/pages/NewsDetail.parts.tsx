/**
 * Building blocks for the single news article page (`/news/:slug`).
 *
 * The page component (NewsDetail.tsx) stays a lean composer; the data loader,
 * pure helpers, and self-contained sidebar / below-the-fold sections live here
 * — mirroring the EventDetail.parts.tsx pattern. Anything tightly coupled to the
 * inline admin `Editable` controls (header, "why this matters", body) stays in
 * the page so the setState wiring is local.
 */

import { useEffect, useState } from 'react';
import {
  MapPin,
  Newspaper,
  Globe,
  Layers,
  Megaphone,
  Smile,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { detailHref } from '@/lib/searchRoutes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/Image';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { cleanTitle } from '@/utils/htmlDecode';
import { formatNewsTag } from '@/lib/newsTags';
import { resolvePublisherName } from '@/lib/publisherName';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import {
  fetchNewsArticleBySlugOrId,
  fetchNewsSourceById,
  fetchNewsTagsForEntity,
  fetchNamesByIds,
} from '@/hooks/usePageFetchers';
import { fetchStoryClusterForArticle } from '@/hooks/useNewsStories';
import type { StoryDetail } from '@/hooks/useNewsStories';
import { useUserTravelPreferences } from '@/hooks/useUserTravelPreferences';
import { useAuth } from '@/hooks/useAuth';
import { fetchRecommendations, type SearchHit } from '@/lib/searchClient';
import { useTrackClick } from '@/hooks/useSearchActions';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * The full article record. `fetchNewsArticleBySlugOrId` does `select('*')`, so
 * the trust-loop columns (corroboration_count, integrity_flags, last_verified_at)
 * arrive on every load even though the generated types don't expose them yet.
 */
export interface NewsArticleFull {
  id: string;
  title: string;
  title_i18n?: Record<string, string> | null;
  content_language?: string | null;
  content: string | null;
  excerpt: string | null;
  url: string;
  image_url: string | null;
  author: string | null;
  published_at: string | null;
  source_id: string;
  views_count: number;
  is_featured: boolean;
  category: string | null;
  country_ids: string[] | null;
  city_ids: string[] | null;
  tags: string[] | null;
  publisher_name: string | null;
  created_at: string;
  editorial_note?: string | null;
  is_editors_pick?: boolean | null;
  image_attribution?: string | null;
  media_type?: string | null;
  audio_url?: string | null;
  duration_seconds?: number | null;
  // Trust-loop signals (truth loop, 2026-06-07) — optional, populated by select('*').
  corroboration_count?: number | null;
  integrity_flags?: string[] | null;
  trust_score?: number | null;
  last_verified_at?: string | null;
}

export interface NewsDetailData {
  article: NewsArticleFull;
  sourceName: string;
  sourceUrl: string;
  tags: string[];
  cityNames: Record<string, string>;
  countryNames: Record<string, string>;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** First sentence of an excerpt, capped at 180 chars — the magazine "dek". */
export function extractDek(excerpt: string): string {
  if (!excerpt) return '';
  const trimmed = excerpt.trim();
  const match = trimmed.match(/^(.+?[.!?])(\s|$)/);
  if (match && match[1].length <= 180) return match[1];
  return trimmed.length > 180 ? trimmed.slice(0, 180).trimEnd() + '…' : trimmed;
}

const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
/** True when published within the last 24h — drives the eyebrow pulse dot. */
export function isFreshArticle(publishedAt: string | null | undefined): boolean {
  if (!publishedAt) return false;
  return Date.now() - new Date(publishedAt).getTime() < FRESH_WINDOW_MS;
}

// Known-noise / advertorial integrity flags we surface honestly to readers.
// Labels are resolved via i18n at render (see IntegrityNotice).
const INTEGRITY_FLAGS: Record<string, { key: string; fallback: string; icon: typeof Megaphone }> = {
  satire: {
    key: 'newsDetail.integritySatire',
    fallback: 'Flagged as satire — not a literal report.',
    icon: Smile,
  },
  advertorial: {
    key: 'newsDetail.integrityAdvertorial',
    fallback: 'Sponsored / advertorial content.',
    icon: Megaphone,
  },
  sentiment_conflict: {
    key: 'newsDetail.integritySentimentConflict',
    fallback: 'Sources disagree on tone — read with care.',
    icon: Megaphone,
  },
};

// ── Data loader ──────────────────────────────────────────────────────────────

/** Loads the article plus its source, tags, and geo names in one pass. */
export async function loadNewsDetail(slug: string): Promise<NewsDetailData | null> {
  const article = await fetchNewsArticleBySlugOrId<NewsArticleFull>(slug);
  if (!article) return null;

  const [src, tags, cityNames, countryNames] = await Promise.all([
    article.source_id ? fetchNewsSourceById(article.source_id) : Promise.resolve(null),
    fetchNewsTagsForEntity(article.id),
    article.city_ids?.length
      ? fetchNamesByIds('cities', article.city_ids)
      : Promise.resolve({} as Record<string, string>),
    article.country_ids?.length
      ? fetchNamesByIds('countries', article.country_ids)
      : Promise.resolve({} as Record<string, string>),
  ]);

  const sourceName = resolvePublisherName({
    publisherName: article.publisher_name,
    url: article.url,
    sourceName: src?.name ?? '',
  });

  return {
    article,
    sourceName,
    sourceUrl: src?.url || '',
    tags: tags ?? [],
    cityNames: cityNames ?? {},
    countryNames: countryNames ?? {},
  };
}

// ── Integrity notice ─────────────────────────────────────────────────────────

/** Honest banner for satire / advertorial articles. Monochrome, factual. */
export function IntegrityNotice({ flags }: { flags?: string[] | null }) {
  const { t } = useTranslation();
  const shown = (flags ?? []).filter((f) => f in INTEGRITY_FLAGS);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-element border border-foreground/30 bg-muted px-4 py-2">
      {shown.map((flag) => {
        const { key, fallback, icon: Icon } = INTEGRITY_FLAGS[flag];
        return (
          <p key={flag} className="m-0 flex items-center gap-2 text-13 text-foreground">
            <Icon size={15} className="shrink-0" aria-hidden="true" />
            {t(key, fallback)}
          </p>
        );
      })}
    </div>
  );
}

// ── Personalization ribbon ───────────────────────────────────────────────────

/** Quiet "near your home base" line when the article's geo matches the user's. */
export function PersonalizationRibbon({
  countryIds,
  cityIds,
  countryNames,
  cityNames,
}: {
  countryIds: string[] | null;
  cityIds: string[] | null;
  countryNames: Record<string, string>;
  cityNames: Record<string, string>;
}) {
  const { t } = useTranslation();
  const { data: prefs } = useUserTravelPreferences();
  if (!prefs) return null;

  const homeCity =
    prefs.home_city_id && cityIds?.includes(prefs.home_city_id)
      ? cityNames[prefs.home_city_id]
      : null;
  const homeCountry =
    prefs.home_country_id && countryIds?.includes(prefs.home_country_id)
      ? countryNames[prefs.home_country_id]
      : null;
  const place = homeCity || homeCountry;
  if (!place) return null;

  return (
    <div className="mb-6 flex items-center gap-2 rounded-element border border-border bg-muted/60 px-4 py-2 text-13 text-muted-foreground">
      <MapPin size={14} className="shrink-0" aria-hidden="true" />
      <span>
        {t('newsDetail.closeToHome', 'Close to your home base')} ·{' '}
        <span className="font-medium text-foreground">{place}</span>
      </span>
    </div>
  );
}

// ── Story cluster panel ──────────────────────────────────────────────────────

/** "Reported by N outlets" — the other articles covering the same event. */
export function StoryClusterPanel({
  articleId,
  className,
}: {
  articleId: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [cluster, setCluster] = useState<StoryDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external data; documented exemption from the eslint.config.js staged-ratchet plan.
    setCluster(null);
    fetchStoryClusterForArticle(articleId)
      .then((c) => {
        if (!cancelled) setCluster(c);
      })
      .catch(() => {
        if (!cancelled) setCluster(null);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (!cluster) return null;
  const others = cluster.articles.filter((a) => a.id !== articleId).slice(0, 5);
  if (others.length === 0) return null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers size={16} aria-hidden="true" />
          {t('newsDetail.reportedByOutlets', 'Reported by {{count}} outlets', {
            count: cluster.article_count,
          })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {others.map((a) => (
            <li key={a.id}>
              <LocalizedLink
                to={`/news/${a.slug || a.id}`}
                className="block no-underline text-inherit"
              >
                <span className="line-clamp-2 text-sm font-medium text-foreground hover:underline">
                  {cleanTitle(a.title)}
                </span>
                {a.published_at && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(a.published_at), { addSuffix: true })}
                  </span>
                )}
              </LocalizedLink>
            </li>
          ))}
        </ul>
        <LocalizedLink
          to={`/news/story/${cluster.slug}`}
          className="mt-4 inline-flex items-center gap-1 text-13 font-medium text-foreground"
        >
          {t('newsDetail.seeFullStory', 'See the full story')}
          <ArrowUpRight size={14} aria-hidden="true" />
        </LocalizedLink>
      </CardContent>
    </Card>
  );
}

// ── Tags card ────────────────────────────────────────────────────────────────

export function TagsCard({ tags }: { tags: string[] }) {
  const { t } = useTranslation();
  if (tags.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('newsDetail.topics', 'Topics')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <LocalizedLink key={tag} to={`/resources/${encodeURIComponent(tag)}`} className="no-underline">
              <Badge variant="outline" className="cursor-pointer px-2.5 py-0.5 text-xs">
                {formatNewsTag(tag)}
              </Badge>
            </LocalizedLink>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Location card ────────────────────────────────────────────────────────────

export function LocationCard({
  cityIds,
  countryIds,
  cityNames,
  countryNames,
}: {
  cityIds: string[] | null;
  countryIds: string[] | null;
  cityNames: Record<string, string>;
  countryNames: Record<string, string>;
}) {
  const { t } = useTranslation();
  const { data: prefs } = useUserTravelPreferences();
  const cities = (cityIds || []).map((id) => ({ id, name: cityNames[id] })).filter((c) => c.name);
  const countries = (countryIds || [])
    .map((id) => ({ id, name: countryNames[id] }))
    .filter((c) => c.name);
  if (cities.length === 0 && countries.length === 0) return null;

  const isHome = (id: string) =>
    !!prefs && (prefs.home_city_id === id || prefs.home_country_id === id);

  const row = (id: string, name: string, base: 'city' | 'country') => (
    <LocalizedLink
      key={id}
      to={`/${base}/${id}`}
      className="flex items-center justify-between gap-2 font-medium text-primary no-underline hover:underline"
    >
      <span>{name}</span>
      {isHome(id) && (
        <Badge variant="soft" className="px-2 py-0.5 text-2xs font-semibold">
          {t('newsDetail.home', 'Home')}
        </Badge>
      )}
    </LocalizedLink>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin size={16} aria-hidden="true" />
          {t('newsDetail.whereThisHappens', 'Where this happens')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {cities.map((c) => row(c.id, c.name, 'city'))}
          {countries.map((c) => row(c.id, c.name, 'country'))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Source / credibility card ────────────────────────────────────────────────

export function SourceCard({
  sourceName,
  sourceUrl,
  corroborationCount,
  lastVerifiedAt,
}: {
  sourceName: string;
  sourceUrl: string;
  corroborationCount?: number | null;
  lastVerifiedAt?: string | null;
}) {
  const { t } = useTranslation();
  if (!sourceName && !sourceUrl) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Newspaper size={16} aria-hidden="true" />
          {t('newsDetail.aboutSource', 'About the source')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {sourceName && <p className="m-0 font-medium">{sourceName}</p>}
        {!!corroborationCount && corroborationCount > 1 && (
          <p className="m-0 flex items-center gap-1.5 text-13 text-muted-foreground">
            <ShieldCheck size={14} aria-hidden="true" />
            {t('newsDetail.corroboratedAcross', 'Corroborated across {{count}} outlets', {
              count: corroborationCount,
            })}
          </p>
        )}
        {lastVerifiedAt && (
          <p className="m-0 text-xs text-muted-foreground">
            {t('newsDetail.lastVerified', 'Last verified {{time}}', {
              time: formatDistanceToNow(new Date(lastVerifiedAt), { addSuffix: true }),
            })}
          </p>
        )}
        {sourceUrl && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full justify-start"
            onClick={() => window.open(sourceUrl, '_blank', 'noopener')}
          >
            <Globe size={16} className="mr-2" />
            {t('newsDetail.visitSource', 'Visit {{source}}', {
              source: sourceName || t('newsDetail.source', 'source'),
            })}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Related rail (adaptive) ──────────────────────────────────────────────────

function ForYouNewsRail({
  articleId,
  userId,
  className,
}: {
  articleId: string;
  userId: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const trackClick = useTrackClick();

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external data; documented exemption from the eslint.config.js staged-ratchet plan.
    setHits(null);
    fetchRecommendations({
      types: ['news'],
      excludeIds: [articleId],
      limit: 8,
      userId,
    })
      .then((res) => {
        if (!cancelled) setHits(res.filter((h) => h.id !== articleId));
      })
      .catch(() => {
        if (!cancelled) setHits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId, userId]);

  // Fall back to semantic neighbours when there's no personalized signal yet.
  if (hits && hits.length === 0) {
    return (
      <SimilarItems
        entity={{ type: 'news', id: articleId }}
        contentTypes={['news']}
        title={t('newsDetail.moreLikeThis', 'More like this')}
        className={className}
      />
    );
  }

  return (
    <section className={className} aria-label={t('newsDetail.forYou', 'For you')}>
      <h2 className="mb-4 text-title font-semibold">{t('newsDetail.forYou', 'For you')}</h2>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-4 pb-4">
          {!hits
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-56 shrink-0 rounded-element" />
              ))
            : hits.map((h) => {
                const slug = (h.slug as string) || '';
                // Strict: require a canonical slug — drop UUID-only recommendations.
                const to = detailHref({ type: 'news', slug: h.slug as string, id: h.id as string });
                if (!to) return null;
                return (
                  <LocalizedLink
                    key={h.id}
                    to={to}
                    className="w-56 shrink-0"
                    onClick={() =>
                      trackClick({ type: 'news', id: h.id }, 'recommendation', {
                        surface: 'news_detail_for_you',
                      })
                    }
                  >
                    <Card className="h-40 overflow-hidden transition">
                      <Image
                        imageUrl={
                          isValidImageUrl(h.imageUrl as string | null | undefined)
                            ? (h.imageUrl as string)
                            : null
                        }
                        optimizedUrl={(h.optimizedUrl as string | null | undefined) ?? null}
                        thumbnailUrl={(h.thumbnailUrl as string | null | undefined) ?? null}
                        preferThumb
                        alt=""
                        heightPx={96}
                        imageRole="thumb"
                        rounded="none"
                        fallbackEntityType="news"
                        fallbackKey={h.id}
                      />
                      <CardContent className="p-2">
                        <div className="truncate text-sm font-medium">
                          {h.title || (h.name as string) || slug.replace(/-/g, ' ')}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[h.city, h.category].filter(Boolean).join(' · ')}
                        </div>
                      </CardContent>
                    </Card>
                  </LocalizedLink>
                );
              })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}

/**
 * One related rail that adapts to the viewer: a personalized "For you" feed for
 * signed-in users (falls back to semantic neighbours when there's no bias yet),
 * and the semantic "More like this" rail for everyone else.
 */
export function RelatedNewsRail({ articleId, className }: { articleId: string; className?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (user) return <ForYouNewsRail articleId={articleId} userId={user.id} className={className} />;
  return (
    <SimilarItems
      entity={{ type: 'news', id: articleId }}
      contentTypes={['news']}
      title={t('newsDetail.moreLikeThis', 'More like this')}
      className={className}
    />
  );
}
