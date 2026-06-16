import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { InboxFilter } from '@/hooks/useInboxFeed';

const FILTERS: { key: InboxFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'inbox.filter.all' },
  { key: 'chats', labelKey: 'inbox.filter.chats' },
  { key: 'mail', labelKey: 'inbox.filter.mail' },
  { key: 'alerts', labelKey: 'inbox.filter.alerts' },
];

export function InboxFilterChips({
  value,
  onChange,
}: {
  value: InboxFilter;
  onChange: (f: InboxFilter) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 overflow-x-auto p-2" role="tablist">
      {FILTERS.map((f) => (
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
          {t(f.labelKey, { defaultValue: f.key })}
        </button>
      ))}
    </div>
  );
}
