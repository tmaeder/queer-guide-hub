import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocation } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { Home, ArrowLeft, MapPin, CalendarDays, Map, Users, Search, Clock } from 'lucide-react';
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
import { hrefForEntity } from '@/lib/searchRoutes';

const SUGGESTIONS = [
  { to: '/venues', icon: MapPin, labelKey: 'nav.venues', fallback: 'Venues' },
  { to: '/events', icon: CalendarDays, labelKey: 'nav.events', fallback: 'Events' },
  { to: '/map', icon: Map, labelKey: 'nav.map', fallback: 'Map' },
  { to: '/community', icon: Users, labelKey: 'nav.community', fallback: 'Community' },
] as const;

/** First path segment → entity type + i18n key for type-aware copy. Mirrors
 *  notFoundKindFor() in functions/_middleware.ts. */
const SEGMENT_TYPE: Record<string, { type: string; key: string; fallback: string }> = {
  venues: { type: 'venue', key: 'pages.notFound.kind.venue', fallback: "We couldn't find that venue." },
  events: { type: 'event', key: 'pages.notFound.kind.event', fallback: "We couldn't find that event." },
  city: { type: 'city', key: 'pages.notFound.kind.city', fallback: "We couldn't find that city." },
  country: { type: 'country', key: 'pages.notFound.kind.country', fallback: "We couldn't find that country." },
  personalities: { type: 'personality', key: 'pages.notFound.kind.personality', fallback: "We couldn't find that person." },
  hotels: { type: 'hotel', key: 'pages.notFound.kind.hotel', fallback: "We couldn't find that hotel." },
  villages: { type: 'queer_village', key: 'pages.notFound.kind.village', fallback: "We couldn't find that place." },
  marketplace: { type: 'marketplace', key: 'pages.notFound.kind.marketplace', fallback: "We couldn't find that product." },
  news: { type: 'news', key: 'pages.notFound.kind.news', fallback: "We couldn't find that article." },
};

const LOCALE_RE = /^(en|es|fr|de|pt|it|ru|zh|ja|ko|ar|he|ur)$/;

/** Strip a leading locale prefix and return the path segments. */
function pathSegments(pathname: string): string[] {
  const segs = pathname.split('?')[0].split('/').filter(Boolean);
  if (segs.length && LOCALE_RE.test(segs[0])) segs.shift();
  return segs;
}

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
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

  // File the 404 into the feedback board + keep the existing dev console log.
  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
    fileError({ kind: 'not_found', routePath: location.pathname });
  }, [location.pathname]);

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

  return (
    <div className="min-h-[60vh] bg-background">
      <NotFoundMeta title={t('pages.notFound.title', 'Page not found')} />
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="text-center">
          <h2 className="font-display text-display md:text-hero font-bold mb-4">404</h2>
          <h6 className="text-title font-semibold mb-2">
            {t('pages.notFound.title', 'Page not found')}
          </h6>
          <p className="text-muted-foreground mb-8">
            {kind
              ? t(kind.key, kind.fallback)
              : t(
                  'pages.notFound.description',
                  "The page you're looking for doesn't exist or has been moved.",
                )}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              variant="outline"
              onClick={() => window.history.back()}
              style={{ display: 'inline-flex', gap: 8 }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t('pages.notFound.goBack', 'Go Back')}
            </Button>
            <Button asChild className="inline-flex gap-2">
              <LocalizedLink to="/">
                <Home size={16} aria-hidden="true" />
                {t('pages.notFound.returnHome', 'Return Home')}
              </LocalizedLink>
            </Button>
          </div>
        </div>

        {/* Search the site directly instead of bouncing. */}
        <form onSubmit={onSearch} className="mt-12 relative" role="search">
          <Search
            size={18}
            aria-hidden="true"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('pages.notFound.searchPlaceholder', 'Search venues, events, cities…')}
            aria-label={t('pages.notFound.searchPlaceholder', 'Search venues, events, cities…')}
            className="pl-12 h-12"
          />
        </form>

        {/* "Did you mean?" fuzzy matches for the failed slug. */}
        {suggestions.length > 0 && (
          <div className="mt-10">
            <p className="text-xs2 font-medium uppercase tracking-[0.14em] text-muted-foreground mb-4 flex items-center gap-2">
              <Search size={14} aria-hidden="true" />
              {t('pages.notFound.didYouMean', 'Did you mean')}
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.map((hit) => {
                const href = hrefForEntity({
                  type: hit.type,
                  slug: (hit.slug as string) || hit.id,
                  title: (hit.title as string) || (hit.name as string),
                });
                return (
                  <LocalizedLink
                    key={`${hit.type}:${hit.id}`}
                    to={href}
                    className="flex items-center justify-between gap-2 rounded-element border border-border bg-background px-4 py-3 no-underline transition-colors hover:bg-surface-container hover:border-foreground/30"
                  >
                    <span className="text-15 font-medium text-foreground truncate">
                      {hit.title || hit.name}
                    </span>
                    {(hit.city as string) && (
                      <span className="text-13 text-muted-foreground shrink-0">
                        {hit.city as string}
                      </span>
                    )}
                  </LocalizedLink>
                );
              })}
            </div>
          </div>
        )}

        {/* Pick up where you left off — anon + auth (localStorage). */}
        {recent.length > 0 && (
          <div className="mt-10">
            <p className="text-xs2 font-medium uppercase tracking-[0.14em] text-muted-foreground mb-4 flex items-center gap-2">
              <Clock size={14} aria-hidden="true" />
              {t('pages.notFound.recentlyViewed', 'Pick up where you left off')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {recent.map((item) => (
                <LocalizedLink
                  key={`${item.type}:${item.slug}`}
                  to={recentlyViewedHref(item)}
                  className="flex flex-col gap-1 rounded-element border border-border bg-background px-4 py-3 no-underline transition-colors hover:bg-surface-container hover:border-foreground/30"
                >
                  <span className="text-15 font-medium text-foreground truncate">{item.title}</span>
                  {(item.city || item.country) && (
                    <span className="text-13 text-muted-foreground truncate">
                      {[item.city, item.country].filter(Boolean).join(', ')}
                    </span>
                  )}
                </LocalizedLink>
              ))}
            </div>
          </div>
        )}

        {/* Personalized recommendations (renders nothing without a bias signal). */}
        <RecommendedForYou className="mt-10" limit={10} />

        {/* Static fallback jump-links. */}
        <div className="mt-12 border-t border-border pt-8">
          <p className="text-xs2 font-medium uppercase tracking-[0.14em] text-muted-foreground mb-4">
            {t('pages.notFound.suggestionsLabel', 'Or jump to')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SUGGESTIONS.map(({ to, icon: Icon, labelKey, fallback }) => (
              <LocalizedLink
                key={to}
                to={to}
                className="flex flex-col items-center gap-2 rounded-element border border-border bg-background px-4 py-6 no-underline transition-colors hover:bg-surface-container hover:border-foreground/30"
              >
                <Icon size={20} aria-hidden="true" className="text-muted-foreground" />
                <span className="text-13 font-medium text-foreground">{t(labelKey, fallback)}</span>
              </LocalizedLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
