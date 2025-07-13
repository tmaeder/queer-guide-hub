import React from 'react';
import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  MoreHorizontal, 
  ExternalLink,
  BarChart3,
  Pin
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Database } from '@/integrations/supabase/types';
import { formatDistanceToNow } from 'date-fns';

type CommunityPost = Database['public']['Tables']['community_posts']['Row'] & {
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  post_likes?: Array<{ id: string }>;
  post_comments?: Array<{ id: string }>;
};

interface PostCardProps {
  post: CommunityPost;
  onLike?: (postId: string) => void;
  onComment?: (postId: string, content: string) => void;
  onShare?: (postId: string) => void;
  currentUserId?: string;
  showComments?: boolean;
}

export function PostCard({ 
  post, 
  onLike, 
  onComment, 
  onShare, 
  currentUserId,
  showComments = false 
}: PostCardProps) {
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const isLiked = post.post_likes?.some(like => like.id) || false;
  const likesCount = post.likes_count || 0;
  const commentsCount = post.comments_count || 0;
  const sharesCount = post.shares_count || 0;

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim() || !onComment) return;

    setSubmittingComment(true);
    try {
      await onComment(post.id, commentContent.trim());
      setCommentContent('');
      setShowCommentForm(false);
    } finally {
      setSubmittingComment(false);
    }
  };

  const getPostTypeIcon = (type: string) => {
    switch (type) {
      case 'poll':
        return <BarChart3 className="h-4 w-4" />;
      case 'link':
        return <ExternalLink className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const renderPollContent = () => {
    if (post.post_type !== 'poll' || !post.poll_options) return null;

    const pollData = post.poll_options as { options: string[]; votes: number[] };
    const totalVotes = pollData.votes.reduce((sum, votes) => sum + votes, 0);

    return (
      <div className="space-y-3 mt-3">
        {pollData.options.map((option, index) => {
          const votes = pollData.votes[index] || 0;
          const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
          
          return (
            <div key={index} className="relative">
              <Button
                variant="outline"
                className="w-full justify-start h-auto p-3 text-left"
                onClick={() => {
                  // In a real app, this would submit a vote
                  console.log('Vote for option:', option);
                }}
              >
                <div className="w-full">
                  <div className="flex justify-between items-center">
                    <span>{option}</span>
                    <span className="text-sm text-muted-foreground">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </Button>
            </div>
          );
        })}
        <p className="text-sm text-muted-foreground">
          {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
        </p>
      </div>
    );
  };

  const renderLinkContent = () => {
    if (post.post_type !== 'link' || !post.link_url) return null;

    return (
      <div className="mt-3 border rounded-lg p-3 hover:bg-muted/50 transition-colors">
        <a 
          href={post.link_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="block"
        >
          <div className="flex items-start gap-3">
            <ExternalLink className="h-5 w-5 text-muted-foreground mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {post.link_title && (
                <h4 className="font-medium text-sm line-clamp-2 mb-1">
                  {post.link_title}
                </h4>
              )}
              <p className="text-sm text-muted-foreground truncate">
                {post.link_url}
              </p>
            </div>
          </div>
        </a>
      </div>
    );
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.profiles?.avatar_url || undefined} />
              <AvatarFallback>
                {post.profiles?.display_name?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm">
                  {post.profiles?.display_name || 'Anonymous'}
                </h4>
                {getPostTypeIcon(post.post_type)}
                {post.pinned && (
                  <Pin className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Report Post</DropdownMenuItem>
              {currentUserId === post.user_id && (
                <>
                  <DropdownMenuItem>Edit Post</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">
                    Delete Post
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="prose prose-sm max-w-none">
          <p className="whitespace-pre-wrap">{post.content}</p>
        </div>

        {/* Render specific post type content */}
        {renderPollContent()}
        {renderLinkContent()}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs cursor-pointer">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Engagement Stats */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground border-t pt-3">
          <span>{likesCount} like{likesCount !== 1 ? 's' : ''}</span>
          <span>{commentsCount} comment{commentsCount !== 1 ? 's' : ''}</span>
          <span>{sharesCount} share{sharesCount !== 1 ? 's' : ''}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            className={`flex-1 gap-2 ${isLiked ? 'text-red-500 hover:text-red-600' : ''}`}
            onClick={() => onLike?.(post.id)}
          >
            <Heart className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} />
            Like
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setShowCommentForm(!showCommentForm)}
          >
            <MessageCircle className="h-4 w-4" />
            Comment
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 gap-2"
            onClick={() => onShare?.(post.id)}
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>

        {/* Comment Form */}
        {showCommentForm && (
          <form onSubmit={handleCommentSubmit} className="mt-3 space-y-2">
            <Textarea
              placeholder="Write a comment..."
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              className="min-h-[80px]"
            />
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCommentForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-gradient-primary"
                disabled={submittingComment || !commentContent.trim()}
              >
                {submittingComment ? 'Posting...' : 'Post Comment'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}