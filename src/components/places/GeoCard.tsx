import { memo } from 'react';
import { Card, CardImage } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown, Bookmark, Check, Globe, Building2, MapPin } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { getLegalityBadge } from '@/lib/lgbtLegality';
import { useFavorites } from '@/hooks/useFavorites';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useContentLang, pickLocalized } from '@/lib/localizeContent';

export type GeoCardVariant = 'country' | 'city' | 'village';

interface GeoCardProps {
  variant: GeoCardVariant;
  id: string;
  slug?: string | null;
  name: string;
  /** Optional per-locale name translations (`name_i18n` JSONB on the source row). */
  nameI18n?: Record<string, unknown> | null;
  imageUrl?: string | null;
  editorialHook?: string | null;
  // Country-only
  capital?: string | null;
  // City-only
  countryName?: string | null;
  isCapital?: boolean;
  // Village-only
  description?: string | null;
  /** Optional per-locale description translations (`description_i18n` JSONB). */
  descriptionI18n?: Record<string, unknown> | null;
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

const VARIANT_ICON: Record<GeoCardVariant, typeof Globe> = {
  country: Globe,
  city: Building2,
  village: MapPin,
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
    nameI18n,
    imageUrl,
    editorialHook,
    capital,
    countryName,
    isCapital,
    description,
    descriptionI18n,
    legalityData,
    visited,
    priority,
  } = props;

  const { user } = useAuth();
  const lang = useContentLang();
  const { isFavorited, toggleFavorite } = useFavorites(FAVORITE_TYPE[variant]);
  const saved = isFavorited(id);
  const FallbackIcon = VARIANT_ICON[variant];

  const localizedName = pickLocalized(nameI18n, name, lang);
  const localizedDescription = pickLocalized(descriptionI18n, description, lang);
  const subtitleFallback =
    variant === 'country' ? capital
    : variant === 'city' ? countryName
    : localizedDescription.slice(0, 80);

  const subtitle = (editorialHook ?? subtitleFallback ?? '').trim();
  const legality = variant === 'country' && legalityData ? getLegalityBadge(legalityData) : null;

  const href = slug || id;

  return (
    <LocalizedLink to={VARIANT_HREF[variant](href)} className="block group">
      <Card hoverable className="overflow-hidden h-full flex flex-col">
        <div className="relative">
          <CardImage
            src={imageUrl ?? null}
            alt={`${name} ${variant === 'city' ? 'cityscape' : 'landscape'}`}
            fallbackIcon={FallbackIcon}
            height={180}
            priority={priority}
          />
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
                'absolute top-2 right-2 rounded-element bg-background/85 backdrop-blur',
                'border border-border/60 p-2 transition-colors',
                'hover:bg-background',
              )}
            >
              <Bookmark
                className={cn('h-4 w-4', saved ? 'fill-foreground text-foreground' : 'text-foreground')}
              />
            </button>
          )}
          {/* Visited stamp — bottom-left overlay */}
          {visited && (
            <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-badge bg-background/85 backdrop-blur border border-border/60 px-2 py-1">
              <Check className="h-3 w-3" />
              <span className="text-2xs font-medium uppercase tracking-wide">Visited</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 p-4 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-headline font-semibold leading-tight truncate">{localizedName}</h3>
            {variant === 'city' && isCapital && (
              <Crown className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" aria-label="Capital city" />
            )}
          </div>

          {subtitle && (
            <p className="text-15 text-muted-foreground line-clamp-2">{subtitle}</p>
          )}

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
    </LocalizedLink>
  );
});
