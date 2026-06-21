import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { InboxFilter } from '@/hooks/useInboxFeed';
import { useUpcomingTrips } from '@/hooks/useUpcomingTrips';

const BASE_FILTERS: { key: InboxFilter; labelKey: string; defaultLabel: string }[] = [
  { key: 'all', labelKey: 'inbox.filter.all', defaultLabel: 'All' },
  { key: 'chats', labelKey: 'inbox.filter.chats', defaultLabel: 'Chats' },
  { key: 'mail', labelKey: 'inbox.filter.mail', defaultLabel: 'Mail' },
  { key: 'alerts', labelKey: 'inbox.filter.alerts', defaultLabel: 'Alerts' },
];

export function InboxFilterChips({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (f: InboxFilter) => void;
}) {
  const { t } = useTranslation();
  const { data: upcomingTrips } = useUpcomingTrips();
  const hasUpcomingTrips = (upcomingTrips?.length ?? 0) > 0;

  const filters = hasUpcomingTrips
    ? [...BASE_FILTERS, { key: 'trips' as InboxFilter, labelKey: 'inbox.filter.trips', defaultLabel: 'Trips' }]
    : BASE_FILTERS;

  return (
    <div className="flex gap-2 overflow-x-auto p-2" role="tablist">
      {filters.map((f) => (
        <button
          key={f.key}
          role="tab"
          aria-selected={value === f.key}
          onClick={() => onChange(f.key)}
          className={cn(
            'min-h-0 whitespace-nowrap rounded-badge border px-4 py-2 text-13',
            value === f.key ? 'bg-foreground text-background' : 'bg-background text-foreground',
          )}
        >
          {t(f.labelKey, { defaultValue: f.defaultLabel })}
        </button>
      ))}
    </div>
  );
}
