import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useInboxUnreadCounts, type InboxFilter } from '@/hooks/useInboxFeed';
import { useUpcomingTrips } from '@/hooks/useUpcomingTrips';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
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

interface ChipDef {
  key: InboxFilter;
  label: string;
  /** Screen-reader label for the badge. */
  unreadLabel: (count: number) => string;
}

function Chip({
  def,
  count,
  value,
  onChange,
}: {
  def: ChipDef;
  count: number;
  value: InboxFilter;
  onChange: (f: InboxFilter) => void;
}) {
  const active = value === def.key;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onChange(def.key)}
      className={chipClass(active)}
    >
      {def.label}
      {count > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            'ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold',
            active ? 'bg-background text-foreground' : 'bg-foreground text-background',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
      {count > 0 && <span className="sr-only">{def.unreadLabel(count)}</span>}
    </button>
  );
}

/**
 * Inbox lenses. Counts come from one `get_inbox_unread_counts` call, so a
 * badge never depends on which rows happen to be in the loaded page.
 * Matches, Groups and Trips appear only when they can hold anything.
 */
export function InboxFilterChips({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (f: InboxFilter) => void;
}) {
  const { t } = useTranslation();
  const counts = useInboxUnreadCounts();
  const { data: upcomingTrips } = useUpcomingTrips();
  const hasUpcomingTrips = (upcomingTrips?.length ?? 0) > 0;
  // Dating matches are a self-gated lens — only surface the chip once the
  // viewer has opted into the intimate profile (mirrors /meet/dating's gate).
  const { data: intimateProfile } = useMyIntimateProfile();
  const { userGroups } = useGroups();
  const hasGroups = (userGroups?.length ?? 0) > 0;

  const defs: ChipDef[] = [
    ...BASE_FILTERS.map((f) => ({
      key: f.key,
      label: t(f.labelKey, { defaultValue: f.defaultLabel }),
      unreadLabel: (count: number) =>
        t('inbox.filter.unread', { defaultValue: '{{count}} unread', count }),
    })),
    ...(intimateProfile
      ? [
          {
            key: 'matches' as const,
            label: t('inbox.filter.matches', { defaultValue: 'Matches' }),
            unreadLabel: (count: number) =>
              t('inbox.filter.matchesUnread', { defaultValue: '{{count}} new matches', count }),
          },
        ]
      : []),
    ...(hasGroups
      ? [
          {
            key: 'groups' as const,
            label: t('inbox.filter.groups', { defaultValue: 'Groups' }),
            unreadLabel: (count: number) =>
              t('inbox.filter.groupsUnread', {
                defaultValue: '{{count}} unread group messages',
                count,
              }),
          },
        ]
      : []),
    ...(hasUpcomingTrips || counts.trips > 0
      ? [
          {
            key: 'trips' as const,
            label: t('inbox.filter.trips', { defaultValue: 'Trips' }),
            unreadLabel: (count: number) =>
              t('inbox.filter.unread', { defaultValue: '{{count}} unread', count }),
          },
        ]
      : []),
  ];

  return (
    <div className="flex gap-1 overflow-x-auto" role="tablist">
      {defs.map((def) => (
        <Chip
          key={def.key}
          def={def}
          count={def.key === 'all' ? 0 : counts[def.key]}
          value={value}
          onChange={onChange}
        />
      ))}
    </div>
  );
}
