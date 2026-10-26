import {
  Calendar,
  Music,
  Flag,
  Ship,
  Users,
  BookOpen,
  Mic,
  Laugh,
  Presentation,
  Film,
  Sparkles,
  Dumbbell,
  Palette,
  Image,
  Drama,
  HeartHandshake,
  Megaphone,
  Coffee,
  Handshake,
  Store,
  LockKeyhole,
  type LucideIcon,
} from '@/components/icons';
import type { EventType } from '@/lib/eventTypes';

export const EVENT_TYPE_ICONS: Record<EventType, LucideIcon> = {
  party: Music,
  festival: Sparkles,
  cruise: Ship,
  pride: Flag,
  meetup: Users,
  workshop: BookOpen,
  concert: Mic,
  comedy: Laugh,
  conference: Presentation,
  film: Film,
  drag: Sparkles,
  sports: Dumbbell,
  art: Palette,
  exhibition: Image,
  theater: Drama,
  fundraiser: HeartHandshake,
  protest: Megaphone,
  social: Coffee,
  community: Handshake,
  fair: Store,
  fetish: LockKeyhole,
  other: Calendar,
};

/** The type's glyph — also drawn large on a photo-less card's plate. */
export const eventTypeIcon = (type: string | null | undefined): LucideIcon =>
  (type && EVENT_TYPE_ICONS[type as EventType]) || Calendar;
