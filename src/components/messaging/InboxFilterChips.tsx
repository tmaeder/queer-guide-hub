import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useInboxFeed, type InboxFilter } from '@/hooks/useInboxFeed';
import { useUpcomingTrips } from '@/hooks/useUpcomingTrips';
import { useGroups } from '@/hooks/useGroups';

const BASE_FILTERS: { key: InboxFilter; labelKey: string; defaultLabel: string }[] = [
  { key: 'all', labelKey: 'inbox.filter.all', defaultLabel: 'All' },
  { key: 'chats', labelKey: 'inbox.filter.chats', defaultLabel: 'Chats' },
  { key: 'mail', labelKey: 'inbox.filter.mail', defaultLabel: 'Mail' },
  { key: 'alerts', labelKey: 'inbox.filter.alerts', defaultLabel: 'Alerts' },
];

// 44px tabs (the touch-target rule) with the same active/inactive treatment
// as the Hub's second-row page pills directly above.
const chipClass = (active: boolean) =>
  cn(
    'flex min-h-11 items-center whitespace-nowrap rounded-element px-4 text-13 font-bold transition-colors',
    active
      ? 'bg-foreground text-background'
      : 'text-muted-foreground hover:bg-surface-container-high hover:text-foreground',
  );

/**
 * Groups lens chip: an unread badge counting group threads you haven't opened
 * yet. Only rendered once the viewer belongs to at least one group, like the
 * Trips chip below. Dating matches have no chip of their own: they are chats,
 * and Chats already lists them.
 */
function GroupsFilterChip({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (f: InboxFilter) => void;
}) {
  const { t } = useTranslation();
  const { items } = useInboxFeed('groups');
  const unread = items.filter((i) => i.unread).length;
  const active = value === 'groups';

  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onChange('groups')}
      className={chipClass(active)}
    >
      {t('inbox.filter.groups', { defaultValue: 'Groups' })}
      {unread > 0 && (
        <span
          className={cn(
            'ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold',
            active ? 'bg-background text-foreground' : 'bg-foreground text-background',
          )}
          aria-label={t('inbox.filter.groupsUnread', {
            defaultValue: '{{count}} unread group messages',
            count: unread,
          })}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

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
  const { userGroups } = useGroups();
  const hasGroups = (userGroups?.length ?? 0) > 0;

  return (
    <div className="flex gap-1 overflow-x-auto" role="tablist">
      {BASE_FILTERS.map((f) => (
        <button
          key={f.key}
          role="tab"
          aria-selected={value === f.key}
          onClick={() => onChange(f.key)}
          className={chipClass(value === f.key)}
        >
          {t(f.labelKey, { defaultValue: f.defaultLabel })}
        </button>
      ))}
      {hasGroups && <GroupsFilterChip value={value} onChange={onChange} />}
      {hasUpcomingTrips && (
        <button
          role="tab"
          aria-selected={value === 'trips'}
          onClick={() => onChange('trips')}
          className={chipClass(value === 'trips')}
        >
          {t('inbox.filter.trips', { defaultValue: 'Trips' })}
        </button>
      )}
    </div>
  );
}
