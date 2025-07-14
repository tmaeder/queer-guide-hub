import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Calendar, Info, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'message':
      return <MessageCircle className="h-4 w-4" />;
    case 'event':
      return <Calendar className="h-4 w-4" />;
    default:
      return <Info className="h-4 w-4" />;
  }
};

export const NotificationList = () => {
  const { notifications, loading, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  const handleNotificationClick = (notification: any) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    
    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading notifications...
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No notifications yet
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between p-2">
        <span className="text-sm font-medium">Recent</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={markAllAsRead}
          className="text-xs"
        >
          <CheckCheck className="h-3 w-3 mr-1" />
          Mark all read
        </Button>
      </div>
      
      <ScrollArea className="h-96">
        <div className="divide-y">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={cn(
                "p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                !notification.read && "bg-primary/5"
              )}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "p-1 rounded-full",
                  notification.type === 'message' && "bg-primary/10 text-primary",
                  notification.type === 'event' && "bg-accent/10 text-accent",
                  notification.type === 'system' && "bg-secondary/10 text-secondary"
                )}>
                  {getNotificationIcon(notification.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <h4 className={cn(
                      "text-sm font-medium truncate",
                      !notification.read && "font-semibold"
                    )}>
                      {notification.title}
                    </h4>
                    <div className="flex items-center gap-1 ml-2">
                      {!notification.read && (
                        <div className="w-2 h-2 bg-primary rounded-full" />
                      )}
                    </div>
                  </div>
                  
                  {notification.content && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {notification.content}
                    </p>
                  )}
                  
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};