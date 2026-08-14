import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocation, useNavigate } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { NotFoundMeta } from '@/components/seo/NotFoundMeta';
import { fileError } from '@/utils/autoFileError';
import { getRecentlyViewed, recentlyViewedHref } from '@/lib/recentlyViewed';
import { fetchAutocomplete, type SearchHit } from '@/lib/searchClient';
import { RecommendedForYou } from '@/components/discovery/RecommendedForYou';
import { Input } from '@/components/ui/input';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useVenueSlugRedirect } from '@/hooks/useVenueSlugRedirect';
import { useGeoSlugRedirect } from '@/hooks/useGeoSlugRedirect';
import { hrefForEntity } from '@/lib/searchRoutes';
import { PageContainer } from '@/components/layout/PageContainer';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { DeadEndTrack } from '@/components/transit/DeadEndTrack';

/** The lines you can pick up from here. */
const SUGGESTIONS: ReadonlyArray<{
  to: string;
  icon: TransitIconName;
  labelKey: string;
  fallback: string;
}> = [
  { to: '/venues', icon: 'near-you', labelKey: 'nav.venues', fallback: 'Venues' },
  { to: '/events', icon: 'events', labelKey: 'nav.events', fallback: 'Events' },
  { to: '/map', icon: 'map', labelKey: 'nav.map', fallback: 'Map' },
  { to: '/community', icon: 'community', labelKey: 'nav.community', fallback: 'Community' },
];

/** First path segment → entity type + i18n key for type-aware copy. Mirrors
 *  notFoundKindFor() in functions/_middleware.ts — keep the two in step. */
const SEGMENT_TYPE: Record<string, { type: string; key: string; fallback: string }> = {
  venues: {
    type: 'venue',
    key: 'pages.notFound.kind.venue',
    fallback: 'No venue at this stop.',
  },
  events: {
    type: 'event',
    key: 'pages.notFound.kind.event',
    fallback: 'No event at this stop.',
  },
  city: { type: 'city', key: 'pages.notFound.kind.city', fallback: 'No city at this stop.' },
  country: {
    type: 'country',
    key: 'pages.notFound.kind.country',
    fallback: 'No country at this stop.',
  },
  personalities: {
    type: 'personality',
    key: 'pages.notFound.kind.personality',
    fallback: 'Nobody at this stop.',
  },
  hotels: {
    type: 'hotel',
    key: 'pages.notFound.kind.hotel',
    fallback: 'No hotel at this stop.',
  },
  villages: {
    type: 'queer_village',
    key: 'pages.notFound.kind.village',
    fallback: 'No district at this stop.',
  },
  marketplace: {
    type: 'marketplace',
    key: 'pages.notFound.kind.marketplace',
    fallback: 'No product at this stop.',
  },
  news: {
    type: 'news',
    key: 'pages.notFound.kind.news',
    fallback: 'No article at this stop.',
  },
};

const LOCALE_RE = /^(en|es|fr|de|pt|it|ru|zh|ja|ko|ar|he|ur)$/;

/** Strip a leading locale prefix and return the path segments. */
function pathSegments(pathname: string): string[] {
  const segs = pathname.split('?')[0].split('/').filter(Boolean);
  if (segs.length && LOCALE_RE.test(segs[0])) segs.shift();
  return segs;
}

/** A row on the board: bullet · name · place. The link is an absolute overlay
 *  SIBLING, never a wrapper — a card that wraps its own controls in an anchor
 *  is `nested-interactive` (see EventCard/DepartureRow). */
function StopRow({
  href,
  type,
  title,
  meta,
}: {
  href: string;
  type: string;
  title: string;
  meta?: string | null;
}) {
  return (
    <li className="card-lift-sm relative flex items-center gap-4 border-2 border-foreground bg-background px-4 py-4">
      <RouteBullet type={type} size={38} />
      <span className="min-w-0 flex-1 truncate font-display text-title leading-tight">{title}</span>
      {meta && <span className="shrink-0 text-15 text-muted-foreground">{meta}</span>}
      <LocalizedLink to={href} aria-label={title} className="absolute inset-0 no-underline" />
    </li>
  );
}

/** `text-13`, not the `text-2xs` eyebrow convention: this page runs at the full
 *  site width, and a 10px label floating over a 1600px column is unreadable. */
const SECTION_LABEL = 'text-13 font-bold uppercase tracking-label text-muted-foreground';

const END_OF_LINE_LINK =
  'inline-flex items-center gap-2 border-2 border-background px-4 py-2 text-15 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground';

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const rrNavigate = useNavigate();
  const [suggestions, setSuggestions] = useState<SearchHit[]>([]);

  const segs = useMemo(() => pathSegments(location.pathname), [location.pathname]);
  const kind = segs.length ? SEGMENT_TYPE[segs[0]] : undefined;
  const recent = useMemo(() => getRecentlyViewed().slice(0, 6), []);
  const [searchQuery, setSearchQuery] = useState('');

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  // Crawler-mangled URLs: backslash/backtick/quote/markdown junk glued onto
  // the path (e.g. /cities%5C%60 → "/cities\`"). Redirect to the cleaned path
  // instead of dead-ending — and skip auto-filing, it's not a missing page.
  const junkFreePath = useMemo(() => {
    let decoded = location.pathname;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      /* keep raw path on malformed escapes */
    }
    const cleaned = decoded.replace(/[\\`'".,;:!)\]}>]+\/?$/, '');
    return cleaned !== decoded && cleaned.length > 1 ? cleaned : null;
  }, [location.pathname]);
  useEffect(() => {
    if (junkFreePath) rrNavigate(junkFreePath + location.search, { replace: true });
  }, [junkFreePath, rrNavigate, location.search]);

  // File the 404 into the feedback board + keep the existing dev console log.
  useEffect(() => {
    if (junkFreePath) return;
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
    fileError({ kind: 'not_found', routePath: location.pathname });
  }, [location.pathname, junkFreePath]);

  // Bare geo slugs typed at the root (/maldives, /berlin) → country/city page.
  const geoTarget = useGeoSlugRedirect(!junkFreePath && segs.length === 1 ? segs[0] : null);
  useEffect(() => {
    if (geoTarget) navigate(geoTarget, { replace: true });
  }, [geoTarget, navigate]);

  // Client-side venue slug-redirect fallback (the edge middleware handles the
  // SEO-correct 301 for direct/bot hits; this covers in-app SPA navigation).
  const redirectSlug = segs[0] === 'venues' && segs.length === 2 ? segs[1] : null;
  const newVenueSlug = useVenueSlugRedirect(redirectSlug);
  useEffect(() => {
    if (newVenueSlug) navigate(`/venues/${newVenueSlug}`, { replace: true });
  }, [newVenueSlug, navigate]);

  // "Did you mean?" — fuzzy-match the failed slug against real content.
  useEffect(() => {
    const last = segs[segs.length - 1];
    if (!last || last.length < 2) return;
    const query = decodeURIComponent(last).replace(/[-_]+/g, ' ');
    let cancelled = false;
    fetchAutocomplete(query, kind ? [kind.type] : undefined, 3)
      .then((hits) => {
        if (!cancelled) setSuggestions(hits.filter((h) => h.title || h.name).slice(0, 3));
      })
      .catch(() => {
        /* silently ignore — suggestions are best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [segs, kind]);

  // The ghost station's name: the slug that isn't on the line.
  const ghostLabel = useMemo(() => {
    const last = segs[segs.length - 1];
    if (!last) return location.pathname;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  }, [segs, location.pathname]);

  return (
    // Default size = the 1600 page cap, the same frame every other page uses.
    // Prose inside is capped to `max-w-reading` so the measure stays readable
    // at full width — the container sets the FRAME, not the line length.
    <PageContainer>
      <NotFoundMeta title={t('pages.notFound.title', 'Page not found')} />

      <header>
        <Eyebrow variant="kicker" as="div">
          {t('pages.notFound.kicker', 'Service notice · 404')}
        </Eyebrow>
        <h1 className="mt-6 font-display text-display leading-[0.95] md:text-hero">
          {kind ? t(kind.key, kind.fallback) : t('pages.notFound.heading', 'No stop here.')}
        </h1>
        <p className="mt-6 max-w-reading text-body-lg leading-relaxed text-muted-foreground">
          {t(
            'pages.notFound.description',
            'Nothing is on the map at {{path}}. It was moved, removed, or never existed.',
            { path: location.pathname },
          )}
        </p>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          {/* No icon: the transit set has no "reverse direction" glyph, and the
              nearest candidates (route/compass) read as "plan a trip", which is
              what the search below actually does. */}
          <Button variant="outline" onClick={() => window.history.back()}>
            {t('pages.notFound.goBack', 'Go Back')}
          </Button>
          <Button asChild className="gap-2">
            <LocalizedLink to="/">
              <TransitIcon name="home-base" size={18} />
              {t('pages.notFound.returnHome', 'Return Home')}
            </LocalizedLink>
          </Button>
        </div>
      </header>

      <DeadEndTrack
        className="mt-10"
        label={ghostLabel}
        type={kind?.type}
        caption={t('pages.notFound.noStop', 'No stop')}
      />

      {/* Search the site directly instead of bouncing. */}
      <section className="mt-10" aria-labelledby="notfound-search">
        <h2 id="notfound-search" className={SECTION_LABEL}>
          {t('pages.notFound.searchLabel', 'Plan another route')}
        </h2>
        <form onSubmit={onSearch} className="mt-4 flex max-w-reading gap-2" role="search">
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('pages.notFound.searchPlaceholder', 'Search venues, events, cities…')}
            aria-label={t('pages.notFound.searchPlaceholder', 'Search venues, events, cities…')}
            className="h-12"
          />
          <Button type="submit" className="h-12 shrink-0 gap-2 px-6">
            <TransitIcon name="search" size={18} />
            {t('pages.notFound.searchSubmit', 'Search')}
          </Button>
        </form>
      </section>

      {/* "Did you mean?" fuzzy matches for the failed slug. */}
      {suggestions.length > 0 && (
        <section className="mt-10" aria-labelledby="notfound-nearest">
          <h2 id="notfound-nearest" className={SECTION_LABEL}>
            {t('pages.notFound.didYouMean', 'Nearest stops')}
          </h2>
          {/* Two columns at the full page width — a single 1600px-wide row per
              stop reads as empty track, not as a board. */}
          <ul className="mt-4 grid list-none grid-cols-1 gap-2 p-0 lg:grid-cols-2">
            {suggestions.map((hit) => (
              <StopRow
                key={`${hit.type}:${hit.id}`}
                href={hrefForEntity({
                  type: hit.type,
                  slug: (hit.slug as string) || hit.id,
                  title: (hit.title as string) || (hit.name as string),
                })}
                type={hit.type}
                title={((hit.title as string) || (hit.name as string)) ?? ''}
                meta={hit.city as string}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Pick up where you left off — anon + auth (localStorage). */}
      {recent.length > 0 && (
        <section className="mt-10" aria-labelledby="notfound-recent">
          <h2 id="notfound-recent" className={SECTION_LABEL}>
            {t('pages.notFound.recentlyViewed', 'Your last stops')}
          </h2>
          {/* Two columns at the full page width — a single 1600px-wide row per
              stop reads as empty track, not as a board. */}
          <ul className="mt-4 grid list-none grid-cols-1 gap-2 p-0 lg:grid-cols-2">
            {recent.map((item) => (
              <StopRow
                key={`${item.type}:${item.slug}`}
                href={recentlyViewedHref(item)}
                type={item.type}
                title={item.title}
                meta={[item.city, item.country].filter(Boolean).join(', ') || null}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Personalized recommendations (renders nothing without a bias signal). */}
      <RecommendedForYou className="mt-10" limit={10} />

      {/* Terminus: the lines you can pick up instead. */}
      <section
        aria-labelledby="notfound-end-of-line"
        className="mt-12 border-[3px] border-foreground bg-foreground p-6 text-background md:p-8"
      >
        <p className="text-13 font-bold uppercase tracking-label text-background/70">
          {t('pages.notFound.suggestionsLabel', 'End of line')}
        </p>
        <h2 id="notfound-end-of-line" className="mt-2 font-display text-display leading-tight">
          {t('pages.notFound.endOfLineTitle', 'Pick up another line.')}
        </h2>
        <div className="mt-8 flex flex-wrap gap-2">
          {SUGGESTIONS.map(({ to, icon, labelKey, fallback }) => (
            <LocalizedLink key={to} to={to} className={END_OF_LINE_LINK}>
              <TransitIcon name={icon} size={18} />
              {t(labelKey, fallback)}
            </LocalizedLink>
          ))}
        </div>
      </section>
    </PageContainer>
  );
};

export default NotFound;
