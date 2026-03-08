import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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

export const InboxItemList: React.FC<InboxItemListProps> = ({ items, onSelect, onToggleStar }) => {
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
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Icon
                className={`h-4 w-4 mt-1 shrink-0 ${
                  !item.isRead ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    fontWeight={item.isRead ? 400 : 700}
                    noWrap
                    sx={{ flex: 1 }}
                  >
                    {item.from}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {formatDistanceToNow(new Date(item.date), { addSuffix: true })}
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight={item.isRead ? 400 : 600} noWrap>
                  {item.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {item.snippet}
                </Typography>
              </Box>
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
                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  ) : (
                    <StarOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              )}
            </Box>
          </Card>
        );
      })}
    </div>
  );
};
