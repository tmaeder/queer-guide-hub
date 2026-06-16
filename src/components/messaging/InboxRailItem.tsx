import { MessageCircle, Mail, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InboxItem } from '@/hooks/useInboxFeed';

const KIND_ICON = { chat: MessageCircle, mail: Mail, notification: Bell } as const;

export function InboxRailItem({
  item,
  active,
  onSelect,
}: {
  item: InboxItem;
  active: boolean;
  onSelect: (item: InboxItem) => void;
}) {
  const Icon = KIND_ICON[item.kind];
  return (
    <button
      onClick={() => onSelect(item)}
      className={cn(
        'flex w-full items-start gap-2 rounded-element border-b p-4 text-left',
        active && 'bg-muted',
      )}
    >
      <Icon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-15', item.unread && 'font-semibold')}>
            {item.title}
          </span>
          {item.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-foreground" />}
        </span>
        <span className="block truncate text-13 text-muted-foreground">{item.preview}</span>
      </span>
    </button>
  );
}
