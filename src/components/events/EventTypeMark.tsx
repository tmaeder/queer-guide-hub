import { useTranslation } from 'react-i18next';
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
import { useEventTypeOptions, useEventTypeLabel, type EventType } from '@/lib/eventTypes';

const ICONS: Record<EventType, LucideIcon> = {
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

export function EventTypeMark({ type }: { type: string }) {
  const label = useEventTypeLabel(type);
  const Icon = ICONS[type] ?? Calendar;
  return (
    <span className="inline-flex items-center gap-1.5 text-13">
      <Icon size={16} aria-hidden="true" className="shrink-0" />
      {label}
    </span>
  );
}

export function EventTypeLegend() {
  const options = useEventTypeOptions();
  const { t } = useTranslation();
  return (
    <details className="mb-4 rounded-element bg-surface-container px-4 py-2">
      <summary className="cursor-pointer text-sm font-medium">
        {t('events.typeLegend', 'Event icons & types')}
      </summary>
      <ul className="mt-4 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-4">
        {options.map((option) => (
          <li key={option.value}>
            <EventTypeMark type={option.value} />
          </li>
        ))}
      </ul>
    </details>
  );
}
