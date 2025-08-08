import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Calendar, Info, CheckCheck, Users, Heart, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useNotifications } from "@/hooks/useNotifications";
import { useMessaging } from "@/hooks/useMessaging";
import { useGroupNotifications } from "@/hooks/useGroupNotifications";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
  const navigate = useNavigate();

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
        // Fetch user's post IDs
        const { data: posts, error: postsErr } = await supabase
          .from('community_posts')
          .select('id')
          .eq('user_id', user.id)
          .limit(200);
        if (postsErr) throw postsErr;
        const postIds = (posts || []).map(p => p.id);
        if (postIds.length === 0) {
          if (isMounted) {
            setLikes([]);
            setComments([]);
          }
          return;
        }
        // Fetch recent likes on user's posts
        const { data: likesData } = await supabase
          .from('post_likes')
          .select('id, post_id, user_id, created_at')
          .in('post_id', postIds)
          .order('created_at', { ascending: false })
          .limit(20);
        let likesEnriched: LikeItem[] = [];
        if (likesData?.length) {
          const likerIds = [...new Set(likesData.map(l => l.user_id))];
          const { data: likerProfiles } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', likerIds);
          likesEnriched = (likesData || []).map(l => {
            const p = likerProfiles?.find(x => x.user_id === l.user_id);
            return {
              id: l.id,
              post_id: l.post_id,
              user_id: l.user_id,
              created_at: l.created_at as string,
              user_display_name: p?.display_name || 'Someone',
              user_avatar_url: p?.avatar_url || null
            };
          });
        }
        if (isMounted) setLikes(likesEnriched);

        // Fetch recent comments on user's posts (with profile join)
        const { data: commentsData, error: commentsErr } = await supabase
          .from('post_comments')
          .select(`id, post_id, user_id, content, created_at, profiles ( display_name, avatar_url, user_id )`)
          .in('post_id', postIds)
          .order('created_at', { ascending: false })
          .limit(20);
        if (commentsErr) throw commentsErr;
        const commentsEnriched: CommentItem[] = (commentsData || []).map((c: any) => ({
          id: c.id,
          post_id: c.post_id,
          user_id: c.user_id,
          content: c.content,
          created_at: c.created_at,
          user_display_name: c.profiles?.display_name || 'Someone',
          user_avatar_url: c.profiles?.avatar_url || null,
        }));
        if (isMounted) setComments(commentsEnriched);
      } catch (e) {
        // Fail silently in dropdown context
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

  const handleNotificationClick = (notification: any) => {
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

  const isLoadingAll = loading || messagingLoading || groupsLoading || likesLoading || commentsLoading;

  const combinedItems = useMemo(() => {
    const items: Array<{ type: string; createdAt: Date; data: any; key: string }> = [];

    // App notifications
    notifications.forEach((n: any) => {
      items.push({ type: 'notification', createdAt: new Date(n.created_at), data: n, key: `notif-${n.id}` });
    });

    // Direct messages (use last_message_at or updated_at)
    directMessages.forEach((c: any) => {
      const ts = c.last_message_at || c.updated_at || c.created_at || new Date().toISOString();
      items.push({ type: 'dm', createdAt: new Date(ts), data: c, key: `dm-${c.id}` });
    });

    // Group notifications
    groupNotifs.forEach((g: any) => {
      items.push({ type: 'group', createdAt: new Date(g.created_at), data: g, key: `group-${g.id}` });
    });

    // Likes on my posts
    likes.forEach((l) => {
      items.push({ type: 'like', createdAt: new Date(l.created_at), data: l, key: `like-${l.id}` });
    });

    // Comments on my posts
    comments.forEach((c) => {
      items.push({ type: 'comment', createdAt: new Date(c.created_at), data: c, key: `comment-${c.id}` });
    });

    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [notifications, directMessages, groupNotifs, likes, comments]);

  const renderItem = (item: any) => {
    switch (item.type) {
      case 'notification': {
        const n = item.data;
        return (
          <div
            key={item.key}
            className={cn(
              "p-3 cursor-pointer hover:bg-muted/50 transition-colors",
              !n.read && "bg-primary/5"
            )}
            onClick={() => handleNotificationClick(n)}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "p-1",
                n.type === 'message' && "bg-primary/10 text-primary",
                n.type === 'event' && "bg-accent/10 text-accent",
                n.type === 'system' && "bg-secondary/10 text-secondary"
              )}>
                {getNotificationIcon(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <h4 className={cn("text-sm font-medium truncate", !n.read && "font-semibold")}>{n.title}</h4>
                  {!n.read && (<div className="w-2 h-2 bg-primary" />)}
                </div>
                {n.content && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.content}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>
        );
      }
      case 'dm': {
        const c = item.data;
        const others = (c.participants || []).filter((p: any) => p.user_id !== user?.id);
        const title = c.title || others.map((o: any) => o.profile?.display_name || 'User').join(', ');
        const avatar = others[0]?.profile?.avatar_url || '';
        return (
          <div key={item.key} className="p-3 hover:bg-muted/50 cursor-pointer" onClick={() => navigate('/messages')}>
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={avatar} />
                <AvatarFallback>{(title || 'U').charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium truncate flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" /> {title || 'Conversation'}
                  </h4>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">Tap to open chat</p>
              </div>
            </div>
          </div>
        );
      }
      case 'group': {
        const n = item.data;
        return (
          <div key={item.key} className="p-3 hover:bg-muted/50 cursor-pointer" onClick={() => navigate('/groups')}>
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={n.triggered_by_profile?.avatar_url || ''} />
                <AvatarFallback>{(n.triggered_by_profile?.display_name || 'U').charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium truncate flex items-center gap-2">
                    <Users className="h-4 w-4" /> {n.community_groups?.name || 'Group'}
                  </h4>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {String(n.notification_type).replace('_', ' ')} • by {n.triggered_by_profile?.display_name || 'Someone'}
                </p>
              </div>
            </div>
          </div>
        );
      }
      case 'like': {
        const l = item.data as LikeItem;
        return (
          <div key={item.key} className="p-3 hover:bg-muted/50 cursor-pointer" onClick={() => navigate('/feed')}>
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={l.user_avatar_url || ''} />
                <AvatarFallback>{(l.user_display_name || 'U').charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium truncate flex items-center gap-2">
                    <Heart className="h-4 w-4" /> {l.user_display_name} liked your post
                  </h4>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">Tap to view in feed</p>
              </div>
            </div>
          </div>
        );
      }
      case 'comment': {
        const c = item.data as CommentItem;
        return (
          <div key={item.key} className="p-3 hover:bg-muted/50 cursor-pointer" onClick={() => navigate('/feed')}>
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={c.user_avatar_url || ''} />
                <AvatarFallback>{(c.user_display_name || 'U').charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium truncate flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" /> {c.user_display_name} commented
                  </h4>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.content}</p>
              </div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between p-2">
        <span className="text-sm font-medium">Recent</span>
        <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
          <CheckCheck className="h-3 w-3 mr-1" />
          Mark all read
        </Button>
      </div>
      {isLoadingAll ? (
        <Empty label="Loading..." />
      ) : combinedItems.length === 0 ? (
        <Empty label="Nothing new yet" />
      ) : (
        <ScrollArea className="h-96">
          <div className="divide-y">
            {combinedItems.map(renderItem)}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};