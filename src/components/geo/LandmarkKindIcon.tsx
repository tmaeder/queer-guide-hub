import {
  Building2,
  Flower2,
  Landmark,
  MapPin,
  Mountain,
  Trees,
  Waves,
} from 'lucide-react';

/** Static icon per landmark kind — mirrors landmarkKindIcon without creating components mid-render. */
export function LandmarkKindIcon({ kind, className }: { kind: string; className?: string }) {
  switch (kind) {
    case 'park':
      return <Trees className={className} aria-hidden />;
    case 'beach':
      return <Waves className={className} aria-hidden />;
    case 'monument':
    case 'landmark':
      return <Landmark className={className} aria-hidden />;
    case 'memorial':
      return <Flower2 className={className} aria-hidden />;
    case 'building':
      return <Building2 className={className} aria-hidden />;
    case 'viewpoint':
      return <Mountain className={className} aria-hidden />;
    default:
      return <MapPin className={className} aria-hidden />;
  }
}
