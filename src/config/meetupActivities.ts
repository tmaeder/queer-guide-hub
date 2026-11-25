import { Coffee, Footprints, Moon, Palette, Sparkles, Ticket } from '@/components/icons';

export const MEETUP_ACTIVITY_ICONS = {
  coffee: Coffee,
  culture: Palette,
  outdoors: Footprints,
  nightlife: Moon,
  event: Ticket,
};

export const MEETUP_ACTIVITY_CHOICES = [
  { id: '', label: 'Open to anything', icon: Sparkles },
  { id: 'coffee', label: 'Coffee & food', icon: Coffee },
  { id: 'culture', label: 'Art & culture', icon: Palette },
  { id: 'outdoors', label: 'Walks & outdoors', icon: Footprints },
  { id: 'nightlife', label: 'A night out', icon: Moon },
  { id: 'event', label: 'An event', icon: Ticket },
] as const;
