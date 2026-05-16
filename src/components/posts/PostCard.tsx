import { useState } from 'react';
import { MotionCard as Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Heart,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Globe,
  Users,
  Lock,
  ExternalLink,
  Trash2,
  Edit,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { formatDistanceToNow } from 'date-fns';
import { CommunityPost } from '@/hooks/useCommunityPosts';
import { CommentsSection } from './CommentsSection';
import { useAuth } from '@/hooks/useAuth';
import { ContentSanitizer } from '@/components/security/ContentSanitizer';

interface PostCardProps {
  post: CommunityPost;
  onLike?: (postId: string) => void;
  onUnlike?: (postId: string) => void;
  onDelete?: (postId: string) => void;
  isLiking?: boolean;
}

export const PostCard = ({ post, onLike, onUnlike, onDelete, isLiking }: PostCardProps) => {
  const { user } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const isOwnPost = user?.id === post.user_id;

  const handleLikeToggle = () => {
    if (post.user_liked) {
      onUnlike?.(post.id);
    } else {
      onLike?.(post.id);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/posts/${post.id}`;
    const title = `${post.profiles?.display_name}'s Post`;
    const text = post.content.slice(0, 100) + (post.content.length > 100 ? '...' : '');

    if (navigator.share && navigator.canShare && navigator.canShare({ title, text, url })) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // share dismissed
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const getVisibilityIcon = () => {
    switch (post.visibility) {
      case 'friends':
        return <Users style={{ height: 12, width: 12 }} />;
      case 'private':
        return <Lock style={{ height: 12, width: 12 }} />;
      default:
        return <Globe style={{ height: 12, width: 12 }} />;
    }
  };

  const getVisibilityLabel = () => {
    switch (post.visibility) {
      case 'friends':
        return 'Friends';
      case 'private':
        return 'Private';
      default:
        return 'Public';
    }
  };

  const renderPostContent = () => {
    let content = post.content;

    // Handle mentions
    if (post.mentions && Array.isArray(post.mentions)) {
      (post.mentions as Array<{ username: string }>).forEach((mention) => {
        const mentionRegex = new RegExp(`@${mention.username}`, 'g');
        content = content.replace(
          mentionRegex,
          `<span class="text-primary font-medium cursor-pointer hover:underline">@${mention.username}</span>`,
        );
      });
    }

    // Handle hashtags
    if (post.tags && Array.isArray(post.tags)) {
      post.tags.forEach((tag: string) => {
        const tagRegex = new RegExp(`#${tag}`, 'g');
        content = content.replace(
          tagRegex,
          `<span class="text-primary font-medium cursor-pointer hover:underline">#${tag}</span>`,
        );
      });
    }

    // Generic hashtag handling for tags not in the tags array
    content = content.replace(
      /#(\w+)/g,
      '<span class="text-primary font-medium cursor-pointer hover:underline">#$1</span>',
    );

    const contentElement = (
      <div className="flex flex-col gap-4">
        <ContentSanitizer
          content={content}
          style={{ whiteSpace: 'pre-wrap' }}
          allowedTags={['span', 'br', 'strong', 'em', 'u', 'a', 'p']}
        />

        {/* Display tags as badges */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.tags.map((tag, index) => (
              <Badge
                key={index}
                variant="secondary"
                style={{ fontSize: '0.75rem', cursor: 'pointer' }}
              >
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Images */}
        {post.images && post.images.length > 0 && (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
            {post.images.slice(0, 4).map((image, index) => (
              <div
                key={index}
                className="relative bg-muted rounded-element overflow-hidden"
                style={{ aspectRatio: '16/9' }}
              >
                <img
                  src={image}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
            ))}
            {post.images.length > 4 && (
              <div
                className="bg-muted rounded-element flex items-center justify-center text-muted-foreground"
                style={{ aspectRatio: '16/9' }}
              >
                +{post.images.length - 4} more
              </div>
            )}
          </div>
        )}

        {/* Link Preview */}
        {post.post_type === 'link' && post.link_url && (
          <Card>
            <CardContent style={{ padding: 16 }}>
              <a
                href={post.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block -m-2 p-4 rounded-element transition-colors hover:bg-muted no-underline text-foreground"
              >
                <div className="flex items-start gap-3">
                  <ExternalLink
                    style={{ height: 20, width: 20, color: 'hsl(var(--muted-foreground))', marginTop: 4, flexShrink: 0 }}
                  />
                  <div className="min-w-0 flex-1">
                    {post.link_title && (
                      <p
                        className="font-medium text-foreground mb-1"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {post.link_title}
                      </p>
                    )}
                    {post.link_description && (
                      <p
                        className="text-sm text-muted-foreground mb-1"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {post.link_description}
                      </p>
                    )}
                    <span className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap block">
                      {new URL(post.link_url).hostname}
                    </span>
                  </div>
                </div>
              </a>
            </CardContent>
          </Card>
        )}

        {/* Poll */}
        {post.post_type === 'poll' && post.poll_options && (
          <Card>
            <CardContent style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="font-medium">
                Poll
              </p>
              <div className="flex flex-col gap-2">
                {(post.poll_options as { options?: string[] })?.options?.map((option: string, index: number) => (
                  <Button
                    key={index}
                    variant="outline"
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      height: 'auto',
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                    disabled
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        border: '2px solid var(--muted-foreground)',
                        marginRight: 12,
                        flexShrink: 0,
                        display: 'inline-block',
                      }}
                    ></span>
                    {option}
                  </Button>
                )) || []}
              </div>
              <span className="text-xs text-muted-foreground">
                Voting not yet implemented
              </span>
            </CardContent>
          </Card>
        )}
      </div>
    );

    return contentElement;
  };

  return (
    <Card>
      <CardHeader style={{ paddingBottom: 16 }}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar style={{ height: 40, width: 40 }}>
              <AvatarImage src={post.profiles?.avatar_url || undefined} />
              <AvatarFallback>
                {post.profiles?.display_name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <LocalizedLink
                to={`/user/${post.user_id}`}
                style={{ fontWeight: 500, textDecoration: 'none', color: 'inherit' }}
              >
                {post.profiles?.display_name || 'Unknown User'}
              </LocalizedLink>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                <span>&bull;</span>
                <div className="flex items-center gap-1">
                  {getVisibilityIcon()}
                  <span>{getVisibilityLabel()}</span>
                </div>
                {post.post_type !== 'text' && (
                  <>
                    <span>&bull;</span>
                    <Badge
                      variant="outline"
                      style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}
                    >
                      {post.post_type}
                    </Badge>
                  </>
                )}
              </div>
            </div>
          </div>

          {(isOwnPost || user) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  style={{ height: 32, width: 32 }}
                  aria-label="More options"
                >
                  <MoreHorizontal style={{ height: 16, width: 16 }} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwnPost && (
                  <>
                    <DropdownMenuItem>
                      <Edit style={{ height: 16, width: 16, marginRight: 8 }} />
                      Edit Post
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
                      Delete Post
                    </DropdownMenuItem>
                  </>
                )}
                {!isOwnPost && <DropdownMenuItem>Report Post</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {renderPostContent()}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLikeToggle}
              disabled={isLiking || !user}
              style={post.user_liked ? { color: 'hsl(var(--foreground))' } : {}}
            >
              <Heart
                style={{
                  height: 16,
                  width: 16,
                  marginRight: 4,
                  ...(post.user_liked ? { fill: 'currentColor' } : {}),
                }}
              />
              <span>{post.likes_count || 0}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowComments(!showComments)}
              disabled={!user}
            >
              <MessageCircle style={{ height: 16, width: 16, marginRight: 4 }} />
              <span>{post.comments_count || 0}</span>
              {showComments ? (
                <ChevronUp style={{ height: 16, width: 16, marginLeft: 4 }} />
              ) : (
                <ChevronDown style={{ height: 16, width: 16, marginLeft: 4 }} />
              )}
            </Button>
          </div>

          <Button variant="ghost" size="sm" onClick={handleShare}>
            <Share2 style={{ height: 16, width: 16 }} />
          </Button>
        </div>

        {/* Comments Section */}
        {showComments && user && (
          <div className="pt-4 border-t border-border">
            <CommentsSection postId={post.id} />
          </div>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this post? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete?.(post.id);
                setShowDeleteDialog(false);
              }}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
