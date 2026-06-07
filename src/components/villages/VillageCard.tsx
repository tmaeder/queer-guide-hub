import { memo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MapPin, Landmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardImage } from '@/components/ui/card';
import type { QueerVillageWithRelations } from '@/hooks/useQueerVillages';
import { useVisitedPlaceLookup } from '@/hooks/useVisitedPlaceLookup';
import { useContentLang, localizedField } from '@/lib/localizeContent';

interface VillageCardProps {
  village: QueerVillageWithRelations;
}

export const VillageCard = memo(function VillageCard({ village }: VillageCardProps) {
  const lang = useContentLang();
  const imageUrl = village.image_url;
  const cityName = village.cities?.name;
  const countryName = village.countries?.name;
  const visitedLookup = useVisitedPlaceLookup();
  const isVisited = !!village.id && visitedLookup.has('village', village.id);

  return (
    <LocalizedLink to={`/villages/${village.slug}`} className="no-underline">
      <Card hoverable>
        <CardImage src={imageUrl} alt={village.name} fallbackIcon={Landmark} height={180}>
          {village.featured && (
            <Badge
              style={{ top: 8, right: 8, backgroundColor: 'hsl(var(--primary))', color: 'white' }}
              className="absolute"
            >
              Featured
            </Badge>
          )}
          {isVisited && (
            <div
              className="absolute bottom-2 left-2 inline-flex items-center px-1.5 py-0.5 font-semibold bg-foreground/80 text-background"
              style={{ fontSize: '0.65rem' }}
              title="Visited"
            >
              ✓ Visited
            </div>
          )}
        </CardImage>

        <div className="p-4 flex-1 flex flex-col gap-1">
          <p className="text-base font-semibold leading-tight truncate">{localizedField(village, 'name', lang)}</p>

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
              {localizedField(village, 'description', lang)}
            </p>
          )}
        </div>
      </Card>
    </LocalizedLink>
  );
});
