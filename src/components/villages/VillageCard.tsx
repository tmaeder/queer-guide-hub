import { memo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MapPin, Landmark } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Image } from '@/components/ui/Image';
import { FeaturedBadge } from '@/components/ui/FeaturedBadge';
import type { QueerVillageWithRelations } from '@/hooks/useQueerVillages';
import { useVisitedPlaceLookup } from '@/hooks/useVisitedPlaceLookup';

interface VillageCardProps {
  village: QueerVillageWithRelations;
}

export const VillageCard = memo(function VillageCard({ village }: VillageCardProps) {
  const imageUrl = village.image_url;
  const cityName = village.cities?.name;
  const countryName = village.countries?.name;
  const visitedLookup = useVisitedPlaceLookup();
  const isVisited = !!village.id && visitedLookup.has('village', village.id);

  return (
    <LocalizedLink to={`/villages/${village.slug}`} className="no-underline">
      <Card hoverable>
        <Image
          src={imageUrl}
          alt={village.name}
          aspect="card"
          imageRole="cover"
          rounded="top"
          fallbackIcon={Landmark}
          fallbackKey={village.slug}
        >
          {village.featured && <FeaturedBadge />}
          {isVisited && (
            <div
              className="absolute bottom-2 left-2 inline-flex items-center px-1.5 py-0.5 font-semibold bg-foreground/80 text-background"
              style={{ fontSize: '0.65rem' }}
              title="Visited"
            >
              ✓ Visited
            </div>
          )}
        </Image>

        <div className="p-4 flex-1 flex flex-col gap-1">
          <h3 className="text-base font-semibold leading-tight truncate">{village.name}</h3>

          {(cityName || countryName) && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin size={14} className="shrink-0" />
              <p className="text-sm truncate">
                {[cityName, countryName].filter(Boolean).join(', ')}
              </p>
            </div>
          )}

          {village.description && (
            <p
              className="text-sm text-muted-foreground mt-1 overflow-hidden"
              style={{
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {village.description}
            </p>
          )}
        </div>
      </Card>
    </LocalizedLink>
  );
});
