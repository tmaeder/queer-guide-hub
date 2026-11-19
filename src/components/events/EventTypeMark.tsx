import { useEventTypeLabel } from '@/lib/eventTypes';
import { Calendar } from '@/components/icons';
import { EVENT_TYPE_ICONS } from './eventTypeIcon';

export function EventTypeMark({ type }: { type: string }) {
  const label = useEventTypeLabel(type);
  const Icon = EVENT_TYPE_ICONS[type as keyof typeof EVENT_TYPE_ICONS] ?? Calendar;
  return (
    <span className="inline-flex items-center gap-1.5 text-13">
      <Icon size={16} aria-hidden="true" className="shrink-0" />
      {label}
    </span>
  );
}
