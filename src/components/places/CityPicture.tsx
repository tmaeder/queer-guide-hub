import { Image } from '@/components/ui/Image';
import { StationPlate } from '@/components/ui/StationPlate';
import { CityNetwork } from '@/components/home/subway/CityNetwork';
import { hasCityNetwork } from '@/components/home/subway/cityNetworkGeometry';
import type { TransitIconName } from '@/components/transit/transitIconPaths';

/**
 * The top of every city card: a real photo when we hold one, else the city's
 * own transit network, else the station plate with the city's mark.
 *
 * The network used to sit inline under the name, so a card had no picture
 * area at all and the template-line fallback — one curve and a ring — was
 * the station plate drawn small. Giving it the same 16:10 slot every other
 * card uses is what makes a grid of cities read as the same family as a grid
 * of venues.
 *
 * A photo or a network is a picture; the caller then puts the city's mark on
 * the seam with `StationBadge`. The plate already carries the mark, so
 * `cityPictureHasBadge` (./cityPictureHasBadge) is false for it and the badge is not drawn twice.
 */
export function CityPicture({
  id,
  slug,
  name,
  glyph,
  imageUrl,
  priority = false,
}: {
  id: string;
  slug: string | null | undefined;
  name: string;
  glyph: TransitIconName;
  imageUrl?: string | null;
  priority?: boolean;
}) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt={`${name} cityscape`}
        aspect="card"
        imageRole="cover"
        priority={priority}
        fallbackGlyph={glyph}
        fallbackKey={id}
      />
    );
  }
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-none bg-surface-container-low">
      {hasCityNetwork(slug) ? (
        // Decorative: the card already carries the city's name as its label.
        <div className="absolute inset-0 flex items-center justify-center px-6 pt-4 pb-8">
          <CityNetwork slug={slug} variant="thumb" className="h-full" />
        </div>
      ) : (
        <div className="absolute inset-0">
          <StationPlate theme="place" fallbackKey={id} icon={glyph} />
        </div>
      )}
    </div>
  );
}
