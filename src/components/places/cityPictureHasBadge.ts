import { hasCityNetwork } from '@/components/home/subway/cityNetworkGeometry';

/** True when the city card's picture is a photo or the city's own network —
 *  i.e. not the station plate, which already draws the city's mark. */
export function cityPictureHasBadge(slug: string | null | undefined, imageUrl?: string | null) {
  return Boolean(imageUrl) || hasCityNetwork(slug);
}
