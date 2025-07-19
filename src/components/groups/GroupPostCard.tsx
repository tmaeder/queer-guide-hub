import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
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
import { cn } from '@/lib/utils';

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
  className
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
      return content;
    }

    let processedContent = content;
    post.mentions.forEach(mention => {
      const mentionPattern = new RegExp(`@${mention.username}`, 'g');
      processedContent = processedContent.replace(
        mentionPattern,
        `<span class="text-primary font-medium">@${mention.username}</span>`
      );
    });

    return <span dangerouslySetInnerHTML={{ __html: processedContent }} />;
  };

  const renderPoll = () => {
    if (!post.poll_data) return null;

    const totalVotes = post.poll_data.options.reduce((sum: number, _: string, index: number) => {
      // This would need to be calculated from actual vote data
      return sum + 0; // Placeholder
    }, 0);

    return (
      <div className="mt-4 p-4 border rounded-lg bg-muted/50">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="font-medium">{post.poll_data.question}</span>
        </div>

        <div className="space-y-2">
          {post.poll_data.options.map((option: string, index: number) => {
            const isVoted = post.user_vote === index;
            const votePercentage = totalVotes > 0 ? 0 : 0; // Placeholder

            return (
              <div key={index} className="space-y-1">
                <Button
                  variant={isVoted ? "default" : "outline"}
                  className={cn(
                    "w-full justify-start h-auto p-3",
                    isVoted && "bg-primary text-primary-foreground"
                  )}
                  onClick={() => onVote({ postId: post.id, optionIndex: index })}
                  disabled={post.user_vote !== null && post.user_vote !== index}
                >
                  <span className="text-left">{option}</span>
                </Button>
                
                {showPollResults && (
                  <div className="text-xs text-muted-foreground px-2">
                    {votePercentage.toFixed(1)}% ({0} votes)
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-3 pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPollResults(!showPollResults)}
          >
            {showPollResults ? "Hide Results" : "Show Results"}
          </Button>
          
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{totalVotes} votes</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className={cn("group hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.profiles?.avatar_url || undefined} />
            <AvatarFallback>
              {post.profiles?.display_name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">
                {post.profiles?.display_name || 'Unknown User'}
              </span>
              
              <div className="flex items-center gap-1">
                {post.post_type === 'announcement' && (
                  <Badge variant="secondary" className="text-xs flex items-center gap-1">
                    <Megaphone className="h-3 w-3" />
                    Announcement
                  </Badge>
                )}
                
                {post.is_pinned && (
                  <Pin className="h-3 w-3 text-primary" />
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
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
                  <PinOff className="h-4 w-4" />
                ) : (
                  <Pin className="h-4 w-4" />
                )}
              </Button>
              
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-4">
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
                className={cn(
                  "flex items-center gap-2",
                  post.user_liked && "text-red-500 hover:text-red-600"
                )}
              >
                <Heart className={cn("h-4 w-4", post.user_liked && "fill-current")} />
                <span>{post.likes_count}</span>
              </Button>

              <Button variant="ghost" size="sm" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                <span>{post.comments_count}</span>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};