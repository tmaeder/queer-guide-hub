import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ContentSanitizer } from '@/components/security/ContentSanitizer';
import {
  Heart,
  MessageCircle,
  Pin,
  PinOff,
  MoreHorizontal,
  Megaphone,
  BarChart3,
  Clock,
  Users
} from 'lucide-react';
import { GroupPost } from '@/hooks/useGroupPosts';
import { formatDistanceToNow } from 'date-fns';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface GroupPostCardProps {
  post: GroupPost;
  onLike: (postId: string) => void;
  onUnlike: (postId: string) => void;
  onVote: (data: { postId: string; optionIndex: number }) => void;
  onTogglePin?: (data: { postId: string; isPinned: boolean }) => void;
  canManage?: boolean;
  sx?: object;
}

export const GroupPostCard = ({
  post,
  onLike,
  onUnlike,
  onVote,
  onTogglePin,
  canManage = false,
  sx
}: GroupPostCardProps) => {
  const [showPollResults, setShowPollResults] = useState(false);

  const handleLikeToggle = () => {
    if (post.user_liked) {
      onUnlike(post.id);
    } else {
      onLike(post.id);
    }
  };

  const renderMentions = (content: string) => {
    if (!post.mentions || post.mentions.length === 0) {
      return <ContentSanitizer
        content={content}
        allowedTags={['span', 'br', 'strong', 'em', 'u', 'a']}
      />;
    }

    let processedContent = content;
    post.mentions.forEach(mention => {
      // Basic sanitization of username
      const sanitizedUsername = mention.username.replace(/[<>]/g, '');
      const mentionPattern = new RegExp(`@${sanitizedUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      processedContent = processedContent.replace(
        mentionPattern,
        `<span class="text-primary font-medium">@${sanitizedUsername}</span>`
      );
    });

    return <ContentSanitizer
      content={processedContent}
      allowedTags={['span', 'br', 'strong', 'em', 'u', 'a']}
    />;
  };

  const renderPoll = () => {
    if (!post.poll_data) return null;

    const totalVotes = post.poll_data.options.reduce((sum: number, _: string, _index: number) => {
      // This would need to be calculated from actual vote data
      return sum + 0; // Placeholder
    }, 0);

    return (
      <Box
        sx={{
          mt: 2,
          p: 2,
          borderRadius: 2,
          bgcolor: 'action.hover',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <BarChart3 style={{ width: 16, height: 16 }} color="var(--primary)" />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{post.poll_data.question}</Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {post.poll_data.options.map((option: string, index: number) => {
            const isVoted = post.user_vote === index;
            const votePercentage = totalVotes > 0 ? 0 : 0; // Placeholder

            return (
              <Box key={index} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Button
                  variant={isVoted ? "default" : "outline"}
                  onClick={() => onVote({ postId: post.id, optionIndex: index })}
                  disabled={post.user_vote !== null && post.user_vote !== index}
                  style={{ width: '100%', justifyContent: 'flex-start', height: 'auto', padding: 12 }}
                >
                  <Box component="span" sx={{ textAlign: 'left' }}>{option}</Box>
                </Button>

                {showPollResults && (
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                    {votePercentage.toFixed(1)}% ({0} votes)
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPollResults(!showPollResults)}
          >
            {showPollResults ? "Hide Results" : "Show Results"}
          </Button>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Users style={{ width: 12, height: 12 }} />
            <Typography variant="caption" color="text.secondary">{totalVotes} votes</Typography>
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <Card>
      <Box sx={{ '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s', ...sx }}>
        <CardHeader>
          <Box sx={{ pb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Avatar>
                <AvatarImage src={post.profiles?.avatar_url || undefined} />
                <AvatarFallback>
                  {post.profiles?.display_name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {post.profiles?.display_name || 'Unknown User'}
                  </Typography>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {post.post_type === 'announcement' && (
                      <Badge variant="secondary">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                          <Megaphone style={{ width: 12, height: 12 }} />
                          Announcement
                        </Box>
                      </Badge>
                    )}

                    {post.is_pinned && (
                      <Pin style={{ width: 12, height: 12 }} color="var(--primary)" />
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Clock style={{ width: 12, height: 12 }} />
                  <Typography variant="caption" color="text.secondary">
                    {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                  </Typography>
                </Box>
              </Box>

              {canManage && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    opacity: 0,
                    transition: 'opacity 0.2s',
                    '.group:hover &': { opacity: 1 },
                  }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onTogglePin?.({ postId: post.id, isPinned: !post.is_pinned })}
                  >
                    {post.is_pinned ? (
                      <PinOff style={{ width: 16, height: 16 }} />
                    ) : (
                      <Pin style={{ width: 16, height: 16 }} />
                    )}
                  </Button>

                  <Button variant="ghost" size="sm">
                    <MoreHorizontal style={{ width: 16, height: 16 }} />
                  </Button>
                </Box>
              )}
            </Box>
          </Box>
        </CardHeader>

        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
              {renderMentions(post.content)}
            </Typography>

            {post.post_type === 'poll' && renderPoll()}

            <Separator />

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLikeToggle}
                  style={post.user_liked ? { color: '#ef4444' } : undefined}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Heart style={{ width: 16, height: 16, ...(post.user_liked && { fill: 'currentColor' }) }} />
                    <span>{post.likes_count}</span>
                  </Box>
                </Button>

                <Button variant="ghost" size="sm">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MessageCircle style={{ width: 16, height: 16 }} />
                    <span>{post.comments_count}</span>
                  </Box>
                </Button>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Box>
    </Card>
  );
};
