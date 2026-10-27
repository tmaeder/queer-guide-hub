import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { Image } from '@/components/ui/Image';
import { StationBadge } from '@/components/ui/StationBadge';
import { CityPicture } from '@/components/places/CityPicture';
import { cityPictureHasBadge } from '@/components/places/cityPictureHasBadge';
import { cityGlyph } from '@/lib/cardGlyphs';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { Badge } from '@/components/ui/badge';
import { Crown, Bookmark, Check } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { getLegalityBadge } from '@/lib/lgbtLegality';
import { useFavorites } from '@/hooks/useFavorites';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export type GeoCardVariant = 'country' | 'city' | 'village';

interface GeoCardProps {
  variant: GeoCardVariant;
  id: string;
  slug?: string | null;
  name: string;
  imageUrl?: string | null;
  editorialHook?: string | null;
  // Country-only
  capital?: string | null;
  // City-only
  countryName?: string | null;
  isCapital?: boolean;
  // Village-only
  description?: string | null;
  // Legality data for getLegalityBadge (country only)
  legalityData?: Parameters<typeof getLegalityBadge>[0];
  // Visited stamp
  visited?: boolean;
  // First row = above the fold (eager + fetchpriority high)
  priority?: boolean;
}

const VARIANT_HREF: Record<GeoCardVariant, (slug: string) => string> = {
  country: (s) => `/country/${s}`,
  city: (s) => `/city/${s}`,
  village: (s) => `/villages/${s}`,
};

/** A queer village is a district on the line, so it takes the plain stop. */
const VARIANT_GLYPH: Record<Exclude<GeoCardVariant, 'city'>, TransitIconName> = {
  country: 'globe',
  village: 'pin',
};

const FAVORITE_TYPE: Record<GeoCardVariant, 'country' | 'city' | 'queer_village'> = {
  country: 'country',
  city: 'city',
  village: 'queer_village',
};

export const GeoCard = memo(function GeoCard(props: GeoCardProps) {
  const {
    variant,
    id,
    slug,
    name,
    imageUrl,
    editorialHook,
    capital,
    countryName,
    isCapital,
    description,
    legalityData,
    visited,
    priority,
  } = props;

  const { user } = useAuth();
  const { isFavorited, toggleFavorite } = useFavorites(FAVORITE_TYPE[variant]);
  const saved = isFavorited(id);
  const glyph = variant === 'city' ? cityGlyph({ is_capital: isCapital }) : VARIANT_GLYPH[variant];

  const subtitleFallback =
    variant === 'country' ? capital : variant === 'city' ? countryName : description?.slice(0, 80);

  const subtitle = (editorialHook ?? subtitleFallback ?? '').trim();
  const legality = variant === 'country' && legalityData ? getLegalityBadge(legalityData) : null;

  const href = slug || id;
  // A photo or a city's own network is a picture and gets the mark on the seam;
  // the station plate already draws it.
  const badge = variant === 'city' ? cityPictureHasBadge(slug, imageUrl) : Boolean(imageUrl);

  return (
    // No `h-full` here: the old root anchor was `block`, so adding it would make
    // the card stretch to the grid row height and change existing layouts.
    <div className="relative group">
      <Card hoverable="group" className="overflow-hidden h-full flex flex-col">
        <div className="relative">
          {variant === 'city' ? (
            <CityPicture
              id={id}
              slug={slug}
              name={name}
              glyph={glyph}
              imageUrl={imageUrl}
              priority={priority}
            />
          ) : (
            <Image
              src={imageUrl ?? undefined}
              alt={`${name} landscape`}
              aspect="card"
              imageRole="cover"
              priority={priority}
              fallbackGlyph={glyph}
              fallbackKey={id}
            />
          )}
          {/* Save button — top-right of image */}
          {user && (
            <button
              type="button"
              aria-label={saved ? `Remove ${name} from favorites` : `Save ${name}`}
              aria-pressed={saved}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void toggleFavorite(id);
              }}
              className={cn(
                'absolute top-2 right-2 z-10 rounded-element bg-background/85 backdrop-blur',
                'border border-border/60 p-2 transition-colors',
                'hover:bg-background',
              )}
            >
              <Bookmark
                className={cn(
                  'h-4 w-4',
                  saved ? 'fill-foreground text-foreground' : 'text-foreground',
                )}
              />
            </button>
          )}
          {/* Visited stamp — bottom-left overlay */}
          {visited && (
            <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-badge bg-background/85 backdrop-blur px-2 py-1">
              <Check className="h-3 w-3" />
              <span className="text-2xs font-medium uppercase tracking-wide">Visited</span>
            </div>
          )}
        </div>

        <div
          className={cn(
            'flex flex-1 flex-col gap-2',
            badge ? 'px-4 pb-4 group-has-[[data-fallback=station]]/card:pt-4' : 'p-4',
          )}
        >
          {badge && <StationBadge glyph={glyph} className="-mt-10" />}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-title font-bold leading-tight truncate">{name}</h3>
            {variant === 'city' && isCapital && (
              <Crown
                className="h-4 w-4 mt-1 shrink-0 text-muted-foreground"
                aria-label="Capital city"
              />
            )}
          </div>

          {subtitle && <p className="text-15 text-muted-foreground line-clamp-2">{subtitle}</p>}

          {legality && (
            <div className="mt-auto pt-2">
              <Badge
                variant={legality.level === 'protected' ? 'secondary' : 'outline'}
                aria-label={legality.ariaLabel}
                className="inline-flex items-center gap-1 text-2xs font-medium"
              >
                {legality.label}
              </Badge>
            </div>
          )}
        </div>
      </Card>
      {/* Card-wide click target — overlay sibling, never a wrapper (see EventCard). */}
      <LocalizedLink
        to={VARIANT_HREF[variant](href)}
        aria-label={name}
        className="absolute inset-0 rounded-container no-underline"
      />
    </div>
  );
});
