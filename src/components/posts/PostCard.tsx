import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
  ChevronUp
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';
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
      case 'friends': return <Users className="h-3 w-3" />;
      case 'private': return <Lock className="h-3 w-3" />;
      default: return <Globe className="h-3 w-3" />;
    }
  };

  const getVisibilityLabel = () => {
    switch (post.visibility) {
      case 'friends': return 'Friends';
      case 'private': return 'Private';
      default: return 'Public';
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
          `<span class="text-primary font-medium cursor-pointer hover:underline">@${mention.username}</span>`
        );
      });
    }

    // Handle hashtags
    if (post.tags && Array.isArray(post.tags)) {
      post.tags.forEach((tag: string) => {
        const tagRegex = new RegExp(`#${tag}`, 'g');
        content = content.replace(
          tagRegex,
          `<span class="text-primary font-medium cursor-pointer hover:underline">#${tag}</span>`
        );
      });
    }

    // Generic hashtag handling for tags not in the tags array
    content = content.replace(
      /#(\w+)/g,
      '<span class="text-primary font-medium cursor-pointer hover:underline">#$1</span>'
    );

    const contentElement = (
      <div className="space-y-4">
        <ContentSanitizer 
          content={content} 
          className="whitespace-pre-wrap"
          allowedTags={['span', 'br', 'strong', 'em', 'u', 'a', 'p']}
        />
        
        {/* Display tags as badges */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.tags.map((tag, index) => (
              <Badge key={index} variant="secondary" className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground">
                #{tag}
              </Badge>
            ))}
          </div>
        )}
        
        {/* Images */}
        {post.images && post.images.length > 0 && (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
            {post.images.slice(0, 4).map((image, index) => (
              <div key={index} className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                <img 
                  src={image} 
                  alt="Post image" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
            ))}
            {post.images.length > 4 && (
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                +{post.images.length - 4} more
              </div>
            )}
          </div>
        )}
        
        {/* Link Preview */}
        {post.post_type === 'link' && post.link_url && (
          <Card className="border">
            <CardContent className="p-4">
              <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="block hover:bg-muted/50 -m-4 p-4 rounded transition-colors">
                <div className="flex items-start gap-3">
                  <ExternalLink className="h-5 w-5 text-muted-foreground mt-1 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    {post.link_title && (
                      <h4 className="font-medium text-foreground line-clamp-2 mb-1">
                        {post.link_title}
                      </h4>
                    )}
                    {post.link_description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-1">
                        {post.link_description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      {new URL(post.link_url).hostname}
                    </p>
                  </div>
                </div>
              </a>
            </CardContent>
          </Card>
        )}
        
        {/* Poll */}
        {post.post_type === 'poll' && post.poll_options && (
          <Card className="border">
            <CardContent className="p-4 space-y-3">
              <h4 className="font-medium">Poll</h4>
            <div className="space-y-2">
              {(post.poll_options as any)?.options?.map((option: string, index: number) => (
                <Button 
                  key={index} 
                  variant="outline" 
                  className="w-full justify-start text-left h-auto py-3"
                  disabled
                >
                  <span className="w-6 h-6 rounded-full border-2 border-muted-foreground mr-3 flex-shrink-0"></span>
                  {option}
                </Button>
              )) || []}
              </div>
              <p className="text-xs text-muted-foreground">
                Voting not yet implemented
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );

    return contentElement;
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.profiles?.avatar_url || undefined} />
              <AvatarFallback>
                {post.profiles?.display_name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <Link 
                to={`/user/${post.user_id}`}
                className="font-medium hover:underline"
              >
                {post.profiles?.display_name || 'Unknown User'}
              </Link>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                <span>•</span>
                <div className="flex items-center gap-1">
                  {getVisibilityIcon()}
                  <span>{getVisibilityLabel()}</span>
                </div>
                {post.post_type !== 'text' && (
                  <>
                    <span>•</span>
                    <Badge variant="outline" className="text-xs capitalize">
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
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwnPost && (
                  <>
                    <DropdownMenuItem>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Post
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Post
                    </DropdownMenuItem>
                  </>
                )}
                {!isOwnPost && (
                  <DropdownMenuItem>
                    Report Post
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {renderPostContent()}
        
        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLikeToggle}
              disabled={isLiking || !user}
              className={post.user_liked ? 'text-red-500 hover:text-red-600' : ''}
            >
              <Heart className={`h-4 w-4 mr-1 ${post.user_liked ? 'fill-current' : ''}`} />
              <span>{post.likes_count || 0}</span>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowComments(!showComments)}
              disabled={!user}
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              <span>{post.comments_count || 0}</span>
              {showComments ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
            </Button>
          </div>
          
          <Button variant="ghost" size="sm" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Comments Section */}
        {showComments && user && (
          <div className="pt-4 border-t">
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};