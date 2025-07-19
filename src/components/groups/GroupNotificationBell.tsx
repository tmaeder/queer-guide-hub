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
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

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
        return <AtSign className="h-4 w-4 text-blue-500" />;
      case 'new_announcement':
        return <Megaphone className="h-4 w-4 text-orange-500" />;
      case 'new_poll':
        return <BarChart3 className="h-4 w-4 text-purple-500" />;
      case 'post_liked':
        return <Heart className="h-4 w-4 text-red-500" />;
      case 'new_post':
      default:
        return <MessageSquare className="h-4 w-4 text-green-500" />;
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
        <Bell className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          {unreadCount > 0 ? (
            <Bell className="h-5 w-5 fill-current text-primary" />
          ) : (
            <BellOff className="h-5 w-5" />
          )}
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0">
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Group Notifications</CardTitle>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsRead()}
                  disabled={isMarkingAsRead}
                  className="text-xs"
                >
                  <CheckCheck className="h-4 w-4 mr-1" />
                  Mark all read
                </Button>
              )}
            </div>
          </CardHeader>

          <Separator />

          <CardContent className="p-0">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No notifications yet</p>
                <p className="text-xs">Group activity will appear here</p>
              </div>
            ) : (
              <ScrollArea className="h-96">
                <div className="divide-y">
                  {notifications.map((notification) => (
                    <Link
                      key={notification.id}
                      to={`/groups/${notification.group_id}${notification.related_post_id ? `#post-${notification.related_post_id}` : ''}`}
                      onClick={() => {
                        handleNotificationClick(notification);
                        setOpen(false);
                      }}
                      className={cn(
                        "block p-4 hover:bg-muted/50 transition-colors",
                        !notification.read_at && "bg-primary/5 border-l-4 border-l-primary"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          {getNotificationIcon(notification.notification_type)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={notification.triggered_by_profile?.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {notification.triggered_by_profile?.display_name?.charAt(0) || 'U'}
                              </AvatarFallback>
                            </Avatar>
                            
                            {!notification.read_at && (
                              <div className="w-2 h-2 bg-primary rounded-full" />
                            )}
                          </div>

                          <p className="text-sm font-medium leading-tight mb-1">
                            {getNotificationText(notification)}
                          </p>

                          {notification.content && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                              {notification.content}
                            </p>
                          )}

                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                            </span>

                            {notification.read_at && (
                              <Check className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
};