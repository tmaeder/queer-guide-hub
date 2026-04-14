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
import { supabase } from '@/integrations/supabase/client';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
        // Fetch user's post IDs
        const { data: posts, error: postsErr } = await supabase
          .from('community_posts')
          .select('id')
          .eq('user_id', user.id)
          .limit(200);
        if (postsErr) throw postsErr;
        const postIds = (posts || []).map((p) => p.id);
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
          const likerIds = [...new Set(likesData.map((l) => l.user_id))];
          const { data: likerProfiles } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', likerIds);
          likesEnriched = (likesData || []).map((l) => {
            const p = likerProfiles?.find((x) => x.user_id === l.user_id);
            return {
              id: l.id,
              post_id: l.post_id,
              user_id: l.user_id,
              created_at: l.created_at as string,
              user_display_name: p?.display_name || 'Someone',
              user_avatar_url: p?.avatar_url || null,
            };
          });
        }
        if (isMounted) setLikes(likesEnriched);

        // Fetch recent comments on user's posts (with profile join)
        const { data: commentsData, error: commentsErr } = await supabase
          .from('post_comments')
          .select(
            `id, post_id, user_id, content, created_at, profiles ( display_name, avatar_url, user_id )`,
          )
          .in('post_id', postIds)
          .order('created_at', { ascending: false })
          .limit(20);
        if (commentsErr) throw commentsErr;
        const commentsEnriched: CommentItem[] = (commentsData || []).map((c: Record<string, unknown> & { profiles?: { display_name?: string; avatar_url?: string } }) => ({
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
    <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>{label}</Box>
  );

  const isLoadingAll =
    loading || messagingLoading || groupsLoading || likesLoading || commentsLoading;

  const combinedItems = useMemo(() => {
    const items: Array<{ type: string; createdAt: Date; data: Record<string, unknown>; key: string }> = [];

    // App notifications
    notifications.forEach((n: Record<string, unknown>) => {
      items.push({
        type: 'notification',
        createdAt: new Date(n.created_at),
        data: n,
        key: `notif-${n.id}`,
      });
    });

    // Direct messages (use last_message_at or updated_at)
    directMessages.forEach((c: Record<string, unknown>) => {
      const ts = c.last_message_at || c.updated_at || c.created_at || new Date().toISOString();
      items.push({ type: 'dm', createdAt: new Date(ts), data: c, key: `dm-${c.id}` });
    });

    // Group notifications
    groupNotifs.forEach((g: Record<string, unknown>) => {
      items.push({
        type: 'group',
        createdAt: new Date(g.created_at),
        data: g,
        key: `group-${g.id}`,
      });
    });

    // Likes on my posts
    likes.forEach((l) => {
      items.push({ type: 'like', createdAt: new Date(l.created_at), data: l, key: `like-${l.id}` });
    });

    // Comments on my posts
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
          <Box
            key={item.key}
            sx={{
              p: 1.5,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
              transition: 'background-color 0.2s',
              ...(!n.read && { bgcolor: 'rgba(var(--mui-palette-primary-mainChannel) / 0.05)' }),
            }}
            onClick={() => handleNotificationClick(n)}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Box
                sx={{
                  p: 0.5,
                  borderRadius: 1,
                  ...(n.type === 'message' && {
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    opacity: 0.1,
                  }),
                  ...(n.type === 'event' && {
                    bgcolor: 'secondary.main',
                    color: 'secondary.contrastText',
                    opacity: 0.1,
                  }),
                  ...(n.type === 'system' && { bgcolor: 'grey.200' }),
                }}
              >
                {getNotificationIcon(n.type)}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: !n.read ? 600 : 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {n.title}
                  </Typography>
                  {!n.read && <Box sx={{ width: 8, height: 8, bgcolor: 'primary.main' }} />}
                </Box>
                {n.content && (
                  <Typography
                    component="p"
                    sx={{
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                      mt: 0.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {n.content}
                  </Typography>
                )}
                <Typography
                  component="p"
                  sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}
                >
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </Typography>
              </Box>
            </Box>
          </Box>
        );
      }
      case 'dm': {
        const c = item.data;
        const others = (c.participants || []).filter((p: { user_id: string }) => p.user_id !== user?.id);
        const title =
          c.title || others.map((o: { profile?: { display_name?: string } }) => o.profile?.display_name || 'User').join(', ');
        const avatar = others[0]?.profile?.avatar_url || '';
        return (
          <Box
            key={item.key}
            sx={{ p: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
            onClick={() => navigate('/messages')}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Avatar style={{ height: 32, width: 32 }}>
                <AvatarImage src={avatar} />
                <AvatarFallback>{(title || 'U').charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Typography
                    component="h4"
                    sx={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <MessageCircle style={{ height: 16, width: 16 }} /> {title || 'Conversation'}
                  </Typography>
                  <Typography
                    component="span"
                    sx={{ fontSize: '0.75rem', color: 'text.secondary', ml: 1 }}
                  >
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </Typography>
                </Box>
                <Typography
                  component="p"
                  sx={{
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    mt: 0.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Tap to open chat
                </Typography>
              </Box>
            </Box>
          </Box>
        );
      }
      case 'group': {
        const n = item.data;
        return (
          <Box
            key={item.key}
            sx={{ p: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
            onClick={() => navigate('/groups')}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Avatar style={{ height: 32, width: 32 }}>
                <AvatarImage src={n.triggered_by_profile?.avatar_url || ''} />
                <AvatarFallback>
                  {(n.triggered_by_profile?.display_name || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Typography
                    component="h4"
                    sx={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Users style={{ height: 16, width: 16 }} />{' '}
                    {n.community_groups?.name || 'Group'}
                  </Typography>
                  <Typography
                    component="span"
                    sx={{ fontSize: '0.75rem', color: 'text.secondary', ml: 1 }}
                  >
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </Typography>
                </Box>
                <Typography
                  component="p"
                  sx={{
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    mt: 0.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {String(n.notification_type).replace('_', ' ')} • by{' '}
                  {n.triggered_by_profile?.display_name || 'Someone'}
                </Typography>
              </Box>
            </Box>
          </Box>
        );
      }
      case 'like': {
        const l = item.data as LikeItem;
        return (
          <Box
            key={item.key}
            sx={{ p: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
            onClick={() => navigate('/feed')}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Avatar style={{ height: 32, width: 32 }}>
                <AvatarImage src={l.user_avatar_url || ''} />
                <AvatarFallback>
                  {(l.user_display_name || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Typography
                    component="h4"
                    sx={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Heart style={{ height: 16, width: 16 }} /> {l.user_display_name} liked your
                    post
                  </Typography>
                  <Typography
                    component="span"
                    sx={{ fontSize: '0.75rem', color: 'text.secondary', ml: 1 }}
                  >
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </Typography>
                </Box>
                <Typography
                  component="p"
                  sx={{
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    mt: 0.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Tap to view in feed
                </Typography>
              </Box>
            </Box>
          </Box>
        );
      }
      case 'comment': {
        const c = item.data as CommentItem;
        return (
          <Box
            key={item.key}
            sx={{ p: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
            onClick={() => navigate('/feed')}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Avatar style={{ height: 32, width: 32 }}>
                <AvatarImage src={c.user_avatar_url || ''} />
                <AvatarFallback>
                  {(c.user_display_name || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Typography
                    component="h4"
                    sx={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <MessageSquare style={{ height: 16, width: 16 }} /> {c.user_display_name}{' '}
                    commented
                  </Typography>
                  <Typography
                    component="span"
                    sx={{ fontSize: '0.75rem', color: 'text.secondary', ml: 1 }}
                  >
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </Typography>
                </Box>
                <Typography
                  component="p"
                  sx={{
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    mt: 0.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {c.content}
                </Typography>
              </Box>
            </Box>
          </Box>
        );
      }
      default:
        return null;
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
          Recent
        </Typography>
        <Button variant="ghost" size="sm" onClick={markAllAsRead}>
          <CheckCheck style={{ height: 12, width: 12, marginRight: 4 }} />
          Mark all read
        </Button>
      </Box>
      {isLoadingAll ? (
        <Empty label="Loading..." />
      ) : combinedItems.length === 0 ? (
        <Empty label="Nothing new yet" />
      ) : (
        <ScrollArea style={{ height: 384 }}>
          <Box sx={{ '> *:not(:first-of-type)': { borderTop: 1, borderColor: 'divider' } }}>
            {combinedItems.map(renderItem)}
          </Box>
        </ScrollArea>
      )}
    </Box>
  );
};
