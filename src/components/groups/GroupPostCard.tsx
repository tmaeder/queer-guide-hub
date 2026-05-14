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

interface GroupPostCardProps {
  post: GroupPost;
  onLike: (postId: string) => void;
  onUnlike: (postId: string) => void;
  onVote: (data: { postId: string; optionIndex: number }) => void;
  onTogglePin?: (data: { postId: string; isPinned: boolean }) => void;
  canManage?: boolean;
  className?: string;
}

export const GroupPostCard = ({
  post,
  onLike,
  onUnlike,
  onVote,
  onTogglePin,
  canManage = false,
  className,
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

    const totalVotes = post.poll_data.options.reduce((sum: number) => sum + 0, 0);

    return (
      <div className="mt-4 p-4 rounded-md bg-muted">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 style={{ width: 16, height: 16 }} color="var(--primary)" />
          <p className="text-sm font-medium">{post.poll_data.question}</p>
        </div>

        <div className="flex flex-col gap-2">
          {post.poll_data.options.map((option: string, index: number) => {
            const isVoted = post.user_vote === index;
            const votePercentage = totalVotes > 0 ? 0 : 0;

            return (
              <div key={index} className="flex flex-col gap-1">
                <Button
                  variant={isVoted ? "default" : "outline"}
                  onClick={() => onVote({ postId: post.id, optionIndex: index })}
                  disabled={post.user_vote !== null && post.user_vote !== index}
                  style={{ width: '100%', justifyContent: 'flex-start', height: 'auto', padding: 12 }}
                >
                  <span className="text-left">{option}</span>
                </Button>

                {showPollResults && (
                  <p className="text-xs text-muted-foreground px-2">
                    {votePercentage.toFixed(1)}% ({0} votes)
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPollResults(!showPollResults)}
          >
            {showPollResults ? "Hide Results" : "Show Results"}
          </Button>

          <div className="flex items-center gap-1">
            <Users style={{ width: 12, height: 12 }} />
            <p className="text-xs text-muted-foreground">{totalVotes} votes</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <div className={`hover:shadow-md transition-shadow ${className ?? ''}`}>
        <CardHeader>
          <div className="pb-3">
            <div className="flex items-start gap-3">
              <Avatar>
                <AvatarImage src={post.profiles?.avatar_url || undefined} />
                <AvatarFallback>
                  {post.profiles?.display_name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium">
                    {post.profiles?.display_name || 'Unknown User'}
                  </p>

                  <div className="flex items-center gap-1">
                    {post.post_type === 'announcement' && (
                      <Badge variant="secondary">
                        <span className="flex items-center gap-1 text-xs">
                          <Megaphone style={{ width: 12, height: 12 }} />
                          Announcement
                        </span>
                      </Badge>
                    )}

                    {post.is_pinned && (
                      <Pin style={{ width: 12, height: 12 }} color="var(--primary)" />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Clock style={{ width: 12, height: 12 }} />
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>

              {canManage && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="text-sm leading-relaxed">
              {renderMentions(post.content)}
            </div>

            {post.post_type === 'poll' && renderPoll()}

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLikeToggle}
                  style={post.user_liked ? { color: 'hsl(var(--foreground))' } : undefined}
                >
                  <span className="flex items-center gap-2">
                    <Heart style={{ width: 16, height: 16, ...(post.user_liked && { fill: 'currentColor' }) }} />
                    <span>{post.likes_count}</span>
                  </span>
                </Button>

                <Button variant="ghost" size="sm">
                  <span className="flex items-center gap-2">
                    <MessageCircle style={{ width: 16, height: 16 }} />
                    <span>{post.comments_count}</span>
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
};
