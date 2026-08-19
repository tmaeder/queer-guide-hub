import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { Band } from './Band';
import { useHomeRegionContext } from './homeRegionContext';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useRecentlyViewedImages } from '@/hooks/useRecentlyViewedImages';
import { useYourLinesDiscovery } from '@/hooks/useYourLines';
import { recentlyViewedHref, type RecentlyViewedType } from '@/lib/recentlyViewed';
import { type FallbackTheme } from '@/utils/fallbackImages';
import { CityNetwork } from '@/components/home/subway/CityNetwork';
import { hasCityNetwork } from '@/components/home/subway/cityNetworkGeometry';

const MAX_CARDS = 8;

function fallbackTheme(type: RecentlyViewedType | string): FallbackTheme {
  switch (type) {
    case 'venue':
      return 'venue';
    case 'event':
      return 'event';
    case 'hotel':
      return 'hotel';
    case 'marketplace':
      return 'marketplace';
    case 'personality':
      return 'person';
    case 'organization':
      return 'default';
    default:
      return 'place';
  }
}

interface LineCard {
  key: string;
  href: string;
  title: string;
  subtitle: string;
  /** Why this card is here. Shown verbatim — never invent a reason. */
  reason: string;
  image?: string | null;
  type: string;
  slug: string;
}

/**
 * "Your lines" — the visitor's own thread through the guide.
 *
 * Absorbs the old RecentlyViewedRail, which sat outside every error boundary
 * and every deferral, and adds region-aware discovery beside it. Each card
 * states WHY it is there; a recommendation with no visible reason is just
 * clutter that happens to be personal.
 *
 * Self-hides completely for a first-time visitor with no history and no
 * region — there is nothing honest to put here.
 *
 * Cards use the overlay-link-as-sibling pattern (an absolutely positioned
 * link that is a SIBLING of the card body, not a wrapper around it), because
 * these cards will carry their own controls and an <a> wrapping a button is
 * invalid HTML and an axe `nested-interactive` failure.
 */
export function YourLines() {
  const { t } = useTranslation();
  const region = useHomeRegionContext();
  const recent = useRecentlyViewed();
  const resolvedImages = useRecentlyViewedImages(recent);

  // A thread needs a first stitch. Without any history of their own, the
  // discovery half is just "places in your region" — which is exactly what the
  // Near you band above already is, so the two rendered near-identical lists
  // (Zurich Pride, Cranberry and Petra's Tip Top Bar appeared in both) under a
  // heading claiming the content was the reader's. Discovery AUGMENTS a
  // personal thread here; it does not constitute one.
  const hasOwnThread = recent.length > 0;
  const { data: discovery = [] } = useYourLinesDiscovery(region, MAX_CARDS, hasOwnThread);

  const cards = useMemo<LineCard[]>(() => {
    const seen = new Set<string>();
    const out: LineCard[] = [];

    for (const it of recent) {
      const key = `${it.type}:${it.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        href: recentlyViewedHref(it),
        title: it.title,
        subtitle: [it.city, it.country].filter(Boolean).join(', '),
        reason: t('home.yourLines.reasonRecent', 'You looked at this'),
        image: it.image ?? resolvedImages[key],
        type: it.type,
        slug: it.slug,
      });
    }

    for (const d of discovery) {
      const key = `${d.type}:${d.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        href: d.href,
        title: d.title,
        subtitle: d.subtitle,
        reason: d.reason,
        image: d.image,
        type: d.type,
        slug: d.slug,
      });
    }

    return out.slice(0, MAX_CARDS);
  }, [recent, resolvedImages, discovery, t]);

  if (!hasOwnThread || cards.length === 0) return null;

  return (
    <Band title={t('home.yourLines.title', 'Your lines')}>
      <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-4">
        {cards.map((c) => (
          <li key={c.key} className="card-lift relative bg-card rounded-container shadow-soft">
            {!c.image && c.type === 'city' && hasCityNetwork(c.slug) ? (
              // A themed fallback tile says "city". The city's own network says
              // WHICH city — better placeholder, same empty-image branch.
              <div className="flex h-28 items-center justify-center bg-background p-2">
                <CityNetwork slug={c.slug} variant="thumb" className="h-full" />
              </div>
            ) : (
              <Image
                imageUrl={c.image}
                fallbackEntityType={fallbackTheme(c.type)}
                fallbackKey={c.slug}
                imageRole="thumb"
                heightPx={112}
                rounded="none"
                alt=""
              />
            )}
            <div className="p-4">
              <span className="block truncate text-title font-bold">{c.title}</span>
              {c.subtitle && (
                <span className="block truncate text-13 text-muted-foreground">{c.subtitle}</span>
              )}
              <span className="mt-2 block truncate text-2xs uppercase tracking-label text-muted-foreground">
                {c.reason}
              </span>
            </div>
            {/* Sibling of the card body, never a wrapper. `no-underline` is
                load-bearing: the unlayered `li a` rule in index.css would
                otherwise set `display:inline` and collapse the overlay. */}
            <LocalizedLink
              to={c.href}
              className="absolute inset-0 no-underline"
              aria-label={c.title}
            />
          </li>
        ))}
      </ul>
    </Band>
  );
}

export default YourLines;
