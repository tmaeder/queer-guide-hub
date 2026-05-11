import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mail, Bell, Star, StarOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { UnifiedInboxItem } from '@/hooks/useUnifiedInbox';

interface InboxItemListProps {
  items: UnifiedInboxItem[];
  onSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  email: Mail,
  notification: Bell,
};

export const InboxItemList = ({ items, onSelect, onToggleStar }: InboxItemListProps) => {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const Icon = TYPE_ICON[item.type] || Mail;
        return (
          <Card
            key={item.id}
            className={`p-3 cursor-pointer hover:bg-accent/50 transition-colors ${
              !item.isRead ? 'border-l-4 border-l-primary bg-primary/5' : ''
            }`}
            onClick={() => onSelect(item.id)}
          >
            <div className="flex items-start gap-3">
              <Icon
                className={`h-4 w-4 mt-1 shrink-0 ${
                  !item.isRead ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`flex-1 truncate text-sm ${item.isRead ? 'font-normal' : 'font-bold'}`}
                  >
                    {item.from}
                  </p>
                  <span className="truncate text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(item.date), { addSuffix: true })}
                  </span>
                </div>
                <p className={`truncate text-sm ${item.isRead ? 'font-normal' : 'font-semibold'}`}>
                  {item.title}
                </p>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.snippet}
                </span>
              </div>
              {item.type === 'email' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(item.id);
                  }}
                >
                  {item.isStarred ? (
                    <Star className="h-4 w-4 text-foreground fill-foreground" />
                  ) : (
                    <StarOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
