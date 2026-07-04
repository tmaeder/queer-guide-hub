import {
  StickyNote,
  Utensils,
  Coffee,
  Martini,
  TrainFront,
  Plane,
  Bus,
  CarFront,
  Ship,
  Camera,
  Music,
  ShoppingBag,
  BedDouble,
  Sunrise,
  Ticket,
  Info,
  AlertTriangle,
  Heart,
  Star,
  MapPin,
  Phone,
  type LucideIcon,
} from 'lucide-react';

/**
 * Curated icon vocabulary for day notes (`trip_places.icon`). Slugs are
 * stored in the DB — keep them stable. `StickyNote` is the fallback for
 * unknown/absent slugs.
 */
export const NOTE_ICONS: Record<string, LucideIcon> = {
  note: StickyNote,
  food: Utensils,
  coffee: Coffee,
  drinks: Martini,
  train: TrainFront,
  flight: Plane,
  bus: Bus,
  car: CarFront,
  ferry: Ship,
  photo: Camera,
  music: Music,
  shopping: ShoppingBag,
  sleep: BedDouble,
  sunrise: Sunrise,
  ticket: Ticket,
  info: Info,
  important: AlertTriangle,
  love: Heart,
  highlight: Star,
  meet: MapPin,
  call: Phone,
};

export const NOTE_ICON_SLUGS = Object.keys(NOTE_ICONS);

export function noteIconFor(slug: string | null | undefined): LucideIcon {
  return (slug && NOTE_ICONS[slug]) || StickyNote;
}
