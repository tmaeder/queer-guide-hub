import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  AtSign,
  Megaphone,
  BarChart3,
  MessageSquare,
  Heart
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useGroupNotifications, GroupNotification } from '@/hooks/useGroupNotifications';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export const GroupNotificationBell = () => {
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    isMarkingAsRead
  } = useGroupNotifications();

  const [open, setOpen] = useState(false);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'mention':
        return <AtSign style={{ height: 16, width: 16, color: '#3b82f6' }} />;
      case 'new_announcement':
        return <Megaphone style={{ height: 16, width: 16, color: '#f97316' }} />;
      case 'new_poll':
        return <BarChart3 style={{ height: 16, width: 16, color: '#a855f7' }} />;
      case 'post_liked':
        return <Heart style={{ height: 16, width: 16, color: '#ef4444' }} />;
      case 'new_post':
      default:
        return <MessageSquare style={{ height: 16, width: 16, color: '#22c55e' }} />;
    }
  };

  const getNotificationText = (notification: GroupNotification) => {
    const triggerName = notification.triggered_by_profile?.display_name || 'Someone';
    const groupName = notification.community_groups?.name || 'a group';

    switch (notification.notification_type) {
      case 'mention':
        return `${triggerName} mentioned you in ${groupName}`;
      case 'new_announcement':
        return `${triggerName} made an announcement in ${groupName}`;
      case 'new_poll':
        return `${triggerName} created a poll in ${groupName}`;
      case 'post_liked':
        return `${triggerName} liked your post in ${groupName}`;
      case 'new_post':
        return `${triggerName} posted in ${groupName}`;
      default:
        return `New activity in ${groupName}`;
    }
  };

  const handleNotificationClick = (notification: GroupNotification) => {
    if (!notification.read_at) {
      markAsRead(notification.id);
    }
  };

  if (isLoading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Bell style={{ height: 20, width: 20 }} />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" sx={{ position: 'relative' }}>
          {unreadCount > 0 ? (
            <Bell style={{ height: 20, width: 20, fill: 'currentColor', color: 'var(--primary)' }} />
          ) : (
            <BellOff style={{ height: 20, width: 20 }} />
          )}
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              sx={{ position: 'absolute', top: '-4px', right: '-4px', height: 20, width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 0, fontSize: '0.75rem' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sx={{ width: 384, p: 0 }}>
        <Card sx={{ border: 0, boxShadow: 6 }}>
          <CardHeader sx={{ pb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <CardTitle style={{ fontSize: '1.125rem' }}>Group Notifications</CardTitle>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsRead()}
                  disabled={isMarkingAsRead}
                  sx={{ fontSize: '0.75rem' }}
                >
                  <CheckCheck style={{ height: 16, width: 16, marginRight: 4 }} />
                  Mark all read
                </Button>
              )}
            </Box>
          </CardHeader>

          <Separator />

          <CardContent sx={{ p: 0 }}>
            {notifications.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                <Bell style={{ width: 48, height: 48, margin: '0 auto', marginBottom: 16, opacity: 0.5 }} />
                <Typography>No notifications yet</Typography>
                <Typography variant="caption">Group activity will appear here</Typography>
              </Box>
            ) : (
              <ScrollArea sx={{ height: 384 }}>
                <Box sx={{ '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
                  {notifications.map((notification) => (
                    <Link
                      key={notification.id}
                      to={`/groups/${notification.group_id}${notification.related_post_id ? `#post-${notification.related_post_id}` : ''}`}
                      onClick={() => {
                        handleNotificationClick(notification);
                        setOpen(false);
                      }}
                      style={{ display: 'block', padding: 16, transition: 'background-color 0.2s', textDecoration: 'none', color: 'inherit', ...(notification.read_at ? {} : { borderLeft: '4px solid var(--primary)' }) }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                        <Box sx={{ flexShrink: 0, mt: 0.5 }}>
                          {getNotificationIcon(notification.notification_type)}
                        </Box>

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Avatar sx={{ height: 24, width: 24 }}>
                              <AvatarImage src={notification.triggered_by_profile?.avatar_url || undefined} />
                              <AvatarFallback sx={{ fontSize: '0.75rem' }}>
                                {notification.triggered_by_profile?.display_name?.charAt(0) || 'U'}
                              </AvatarFallback>
                            </Avatar>

                            {!notification.read_at && (
                              <Box sx={{ width: 8, height: 8, bgcolor: 'primary.main', borderRadius: '50%' }} />
                            )}
                          </Box>

                          <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                            {getNotificationText(notification)}
                          </Typography>

                          {notification.content && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', mb: 1 }}>
                              {notification.content}
                            </Typography>
                          )}

                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                            </Typography>

                            {notification.read_at && (
                              <Check style={{ width: 12, height: 12, color: 'var(--muted-foreground)' }} />
                            )}
                          </Box>
                        </Box>
                      </Box>
                    </Link>
                  ))}
                </Box>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
};
