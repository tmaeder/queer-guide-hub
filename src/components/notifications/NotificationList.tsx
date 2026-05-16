import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageCircle,
  Calendar,
  Info,
  CheckCheck,
  Users,
  Heart,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useNotifications } from '@/hooks/useNotifications';
import { useMessaging } from '@/hooks/useMessaging';
import { useGroupNotifications } from '@/hooks/useGroupNotifications';
import { useAuth } from '@/hooks/useAuth';
import { fetchUserPostInteractions } from '@/hooks/usePageFetchers';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'message':
      return <MessageCircle style={{ height: 16, width: 16 }} />;
    case 'event':
      return <Calendar style={{ height: 16, width: 16 }} />;
    default:
      return <Info style={{ height: 16, width: 16 }} />;
  }
};

interface LikeItem {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
  user_display_name: string;
  user_avatar_url: string | null;
}

interface CommentItem {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_display_name: string;
  user_avatar_url: string | null;
}

export const NotificationList = () => {
  const { notifications, loading, markAsRead, markAllAsRead } = useNotifications();
  const { conversations, loading: messagingLoading } = useMessaging();
  const { notifications: groupNotifs, isLoading: groupsLoading } = useGroupNotifications();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();

  const [likes, setLikes] = useState<LikeItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchLikesAndComments = async () => {
      if (!user?.id) return;
      try {
        setLikesLoading(true);
        setCommentsLoading(true);
        const { likes, comments } = await fetchUserPostInteractions<LikeItem, CommentItem>(user.id);
        if (isMounted) {
          setLikes(likes);
          setComments(comments);
        }
      } catch (e) {
        console.error('Failed to fetch likes/comments', e);
      } finally {
        if (isMounted) {
          setLikesLoading(false);
          setCommentsLoading(false);
        }
      }
    };

    fetchLikesAndComments();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const handleNotificationClick = (notification: { id: string; read?: boolean; action_url?: string }) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  const directMessages = useMemo(() => {
    return (conversations || []).slice(0, 10);
  }, [conversations]);

  const Empty = ({ label }: { label: string }) => (
    <div className="p-4 text-center text-muted-foreground">{label}</div>
  );

  const isLoadingAll =
    loading || messagingLoading || groupsLoading || likesLoading || commentsLoading;

  const combinedItems = useMemo(() => {
    const items: Array<{ type: string; createdAt: Date; data: Record<string, unknown>; key: string }> = [];

    notifications.forEach((n: Record<string, unknown>) => {
      items.push({
        type: 'notification',
        createdAt: new Date(n.created_at),
        data: n,
        key: `notif-${n.id}`,
      });
    });

    directMessages.forEach((c: Record<string, unknown>) => {
      const ts = c.last_message_at || c.updated_at || c.created_at || new Date().toISOString();
      items.push({ type: 'dm', createdAt: new Date(ts), data: c, key: `dm-${c.id}` });
    });

    groupNotifs.forEach((g: Record<string, unknown>) => {
      items.push({
        type: 'group',
        createdAt: new Date(g.created_at),
        data: g,
        key: `group-${g.id}`,
      });
    });

    likes.forEach((l) => {
      items.push({ type: 'like', createdAt: new Date(l.created_at), data: l, key: `like-${l.id}` });
    });

    comments.forEach((c) => {
      items.push({
        type: 'comment',
        createdAt: new Date(c.created_at),
        data: c,
        key: `comment-${c.id}`,
      });
    });

    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [notifications, directMessages, groupNotifs, likes, comments]);

  const renderItem = (item: { type: string; createdAt: Date; data: Record<string, unknown>; key: string }) => {
    switch (item.type) {
      case 'notification': {
        const n = item.data;
        return (
          <button
            type="button"
            key={item.key}
            className={`w-full text-left p-3 cursor-pointer hover:bg-muted transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
            onClick={() => handleNotificationClick(n)}
          >
            <div className="flex items-start gap-3">
              <div className="p-1 rounded">
                {getNotificationIcon(n.type as string)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <p className={`text-sm truncate ${!n.read ? 'font-semibold' : 'font-medium'}`}>
                    {n.title}
                  </p>
                  {!n.read && <div className="bg-primary" style={{ width: 8, height: 8 }} />}
                </div>
                {n.content && (
                  <p
                    className="text-xs text-muted-foreground mt-1"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {n.content}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          </button>
        );
      }
      case 'dm': {
        const c = item.data;
        const others = (c.participants || []).filter((p: { user_id: string }) => p.user_id !== user?.id);
        const title =
          c.title || others.map((o: { profile?: { display_name?: string } }) => o.profile?.display_name || 'User').join(', ');
        const avatar = others[0]?.profile?.avatar_url || '';
        return (
          <button
            type="button"
            key={item.key}
            className="w-full text-left p-3 cursor-pointer hover:bg-muted"
            onClick={() => navigate('/messages')}
          >
            <div className="flex items-start gap-3">
              <Avatar style={{ height: 32, width: 32 }}>
                <AvatarImage src={avatar} />
                <AvatarFallback>{(title || 'U').charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium truncate flex items-center gap-2">
                    <MessageCircle style={{ height: 16, width: 16 }} /> {title || 'Conversation'}
                  </h4>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  Tap to open chat
                </p>
              </div>
            </div>
          </button>
        );
      }
      case 'group': {
        const n = item.data;
        return (
          <button
            type="button"
            key={item.key}
            className="w-full text-left p-3 cursor-pointer hover:bg-muted"
            onClick={() => navigate('/groups')}
          >
            <div className="flex items-start gap-3">
              <Avatar style={{ height: 32, width: 32 }}>
                <AvatarImage src={n.triggered_by_profile?.avatar_url || ''} />
                <AvatarFallback>
                  {(n.triggered_by_profile?.display_name || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium truncate flex items-center gap-2">
                    <Users style={{ height: 16, width: 16 }} />{' '}
                    {n.community_groups?.name || 'Group'}
                  </h4>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {String(n.notification_type).replace('_', ' ')} • by{' '}
                  {n.triggered_by_profile?.display_name || 'Someone'}
                </p>
              </div>
            </div>
          </button>
        );
      }
      case 'like': {
        const l = item.data as unknown as LikeItem;
        return (
          <button
            type="button"
            key={item.key}
            className="w-full text-left p-3 cursor-pointer hover:bg-muted"
            onClick={() => navigate('/feed')}
          >
            <div className="flex items-start gap-3">
              <Avatar style={{ height: 32, width: 32 }}>
                <AvatarImage src={l.user_avatar_url || ''} />
                <AvatarFallback>
                  {(l.user_display_name || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium truncate flex items-center gap-2">
                    <Heart style={{ height: 16, width: 16 }} /> {l.user_display_name} liked your
                    post
                  </h4>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  Tap to view in feed
                </p>
              </div>
            </div>
          </button>
        );
      }
      case 'comment': {
        const c = item.data as unknown as CommentItem;
        return (
          <button
            type="button"
            key={item.key}
            className="w-full text-left p-3 cursor-pointer hover:bg-muted"
            onClick={() => navigate('/feed')}
          >
            <div className="flex items-start gap-3">
              <Avatar style={{ height: 32, width: 32 }}>
                <AvatarImage src={c.user_avatar_url || ''} />
                <AvatarFallback>
                  {(c.user_display_name || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium truncate flex items-center gap-2">
                    <MessageSquare style={{ height: 16, width: 16 }} /> {c.user_display_name}{' '}
                    commented
                  </h4>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <p
                  className="text-xs text-muted-foreground mt-1"
                  style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {c.content}
                </p>
              </div>
            </div>
          </button>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between p-2">
        <span className="text-sm font-medium">
          Recent
        </span>
        <Button variant="ghost" size="sm" onClick={markAllAsRead}>
          <CheckCheck style={{ height: 12, width: 12, marginRight: 4 }} />
          Mark all read
        </Button>
      </div>
      {isLoadingAll ? (
        <Empty label="Loading..." />
      ) : combinedItems.length === 0 ? (
        <Empty label="Nothing new yet" />
      ) : (
        <ScrollArea style={{ height: 384 }}>
          <div className="[&>*:not(:first-child)]:border-t [&>*:not(:first-child)]:border-border">
            {combinedItems.map(renderItem)}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
