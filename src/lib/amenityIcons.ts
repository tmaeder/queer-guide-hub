// Static string->LucideIcon registry for the amenity/accessibility vocabulary
// (public.amenities.icon_name). Explicit imports keep the bundle tree-shakeable
// rather than pulling all of lucide-react. Add a row here when a new icon_name
// is introduced in the vocabulary seed.
import {
  AirVent, Accessibility, Baby, Bath, Beer, BookOpen, BusFront, ChefHat,
  CigaretteOff, CircleAlert, CloudFog, Coffee, ConciergeBell, Crown, Dice5,
  Disc3, Dog, DoorClosed, DoorOpen, Dumbbell, Ear, Flame, Flower2, Footprints,
  Heart, Lock, Martini, Mic2, Moon, Music, Palmtree, PartyPopper, PawPrint,
  PlugZap, Rainbow, ShowerHead, Shirt, SquareParking, Sun, Thermometer, Toilet,
  Trees, Tv, Users, Utensils, WashingMachine, Waves, Tag,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  AirVent, Accessibility, Baby, Bath, Beer, BookOpen, BusFront, ChefHat,
  CigaretteOff, CircleAlert, CloudFog, Coffee, ConciergeBell, Crown, Dice5,
  Disc3, Dog, DoorClosed, DoorOpen, Dumbbell, Ear, Flame, Flower2, Footprints,
  Heart, Lock, Martini, Mic2, Moon, Music, Palmtree, PartyPopper, PawPrint,
  PlugZap, Rainbow, ShowerHead, Shirt, SquareParking, Sun, Thermometer, Toilet,
  Trees, Tv, Users, Utensils, WashingMachine, Waves,
};

/** Resolve a vocabulary icon_name to a lucide component (Tag fallback). */
export function amenityIcon(iconName?: string | null): LucideIcon {
  return (iconName && ICONS[iconName]) || Tag;
}
