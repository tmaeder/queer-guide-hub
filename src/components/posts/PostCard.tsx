import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Link } from 'react-router';
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
      } catch (error) {
        console.log('Share cancelled or failed:', error);
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
      (post.mentions as any[]).forEach((mention: any) => {
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <ContentSanitizer
          content={content}
          style={{ whiteSpace: 'pre-wrap' }}
          allowedTags={['span', 'br', 'strong', 'em', 'u', 'a', 'p']}
        />

        {/* Display tags as badges */}
        {post.tags && post.tags.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {post.tags.map((tag, index) => (
              <Badge
                key={index}
                variant="secondary"
                style={{ fontSize: '0.75rem', cursor: 'pointer' }}
              >
                #{tag}
              </Badge>
            ))}
          </Box>
        )}

        {/* Images */}
        {post.images && post.images.length > 0 && (
          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {post.images.slice(0, 4).map((image, index) => (
              <Box
                key={index}
                sx={{
                  position: 'relative',
                  aspectRatio: '16/9',
                  bgcolor: 'action.hover',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <Box
                  component="img"
                  src={image}
                  alt="Post image"
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </Box>
            ))}
            {post.images.length > 4 && (
              <Box
                sx={{
                  aspectRatio: '16/9',
                  bgcolor: 'action.hover',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'text.secondary',
                }}
              >
                +{post.images.length - 4} more
              </Box>
            )}
          </Box>
        )}

        {/* Link Preview */}
        {post.post_type === 'link' && post.link_url && (
          <Card style={{ border: '1px solid var(--border)' }}>
            <CardContent style={{ padding: 16 }}>
              <Box
                component="a"
                href={post.link_url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'block',
                  m: -2,
                  p: 2,
                  borderRadius: 1,
                  transition: 'background-color 0.2s',
                  '&:hover': { bgcolor: 'action.hover' },
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <ExternalLink
                    style={{ height: 20, width: 20, color: 'hsl(var(--muted-foreground))', marginTop: 4, flexShrink: 0 }}
                  />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    {post.link_title && (
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 500,
                          color: 'text.primary',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          mb: 0.5,
                        }}
                      >
                        {post.link_title}
                      </Typography>
                    )}
                    {post.link_description && (
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.875rem',
                          color: 'text.secondary',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          mb: 0.5,
                        }}
                      >
                        {post.link_description}
                      </Typography>
                    )}
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                      }}
                    >
                      {new URL(post.link_url).hostname}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Poll */}
        {post.post_type === 'poll' && post.poll_options && (
          <Card style={{ border: '1px solid var(--border)' }}>
            <CardContent style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                Poll
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {(post.poll_options as any)?.options?.map((option: string, index: number) => (
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
              </Box>
              <Typography variant="caption" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                Voting not yet implemented
              </Typography>
            </CardContent>
          </Card>
        )}
      </Box>
    );

    return contentElement;
  };

  return (
    <Card>
      <CardHeader style={{ paddingBottom: 16 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar style={{ height: 40, width: 40 }}>
              <AvatarImage src={post.profiles?.avatar_url || undefined} />
              <AvatarFallback>
                {post.profiles?.display_name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <Link
                to={`/user/${post.user_id}`}
                style={{ fontWeight: 500, textDecoration: 'none', color: 'inherit' }}
              >
                {post.profiles?.display_name || 'Unknown User'}
              </Link>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  fontSize: '0.875rem',
                  color: 'text.secondary',
                }}
              >
                <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                <span>&bull;</span>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {getVisibilityIcon()}
                  <span>{getVisibilityLabel()}</span>
                </Box>
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
              </Box>
            </div>
          </Box>

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
                      style={{ color: '#ef4444' }}
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
        </Box>
      </CardHeader>

      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {renderPostContent()}

        {/* Actions */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLikeToggle}
              disabled={isLiking || !user}
              style={post.user_liked ? { color: '#ef4444' } : {}}
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
          </Box>

          <Button variant="ghost" size="sm" onClick={handleShare}>
            <Share2 style={{ height: 16, width: 16 }} />
          </Button>
        </Box>

        {/* Comments Section */}
        {showComments && user && (
          <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <CommentsSection postId={post.id} />
          </Box>
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
              style={{ backgroundColor: '#ef4444', color: 'white' }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
