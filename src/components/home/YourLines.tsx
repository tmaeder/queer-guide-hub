import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { Band } from './Band';
import { useHomeRegionContext } from './HomeRegionProvider';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useRecentlyViewedImages } from '@/hooks/useRecentlyViewedImages';
import { useYourLinesDiscovery } from '@/hooks/useYourLines';
import { recentlyViewedHref, type RecentlyViewedType } from '@/lib/recentlyViewed';
import { type FallbackTheme } from '@/utils/fallbackImages';

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
  const { data: discovery = [] } = useYourLinesDiscovery(region, MAX_CARDS);

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

  if (cards.length === 0) return null;

  return (
    <Band title={t('home.yourLines.title', 'Your lines')}>
      <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-4">
        {cards.map((c) => (
          <li key={c.key} className="card-lift relative border-[3px] border-foreground bg-background">
            <Image
              imageUrl={c.image}
              fallbackEntityType={fallbackTheme(c.type)}
              fallbackKey={c.slug}
              imageRole="thumb"
              heightPx={112}
              rounded="none"
              alt=""
            />
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
