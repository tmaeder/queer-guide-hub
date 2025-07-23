import { useState, useRef, useCallback } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Heart, 
  MessageCircle, 
  Reply, 
  MoreHorizontal, 
  Send,
  Trash2,
  Edit,
  AtSign,
  Hash
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useComments, PostComment, CreateCommentData } from '@/hooks/useComments';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';

interface CommentsSectionProps {
  postId: string;
}

interface CommentItemProps {
  comment: PostComment;
  onLike: (commentId: string) => void;
  onUnlike: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onReply: (commentId: string, username: string) => void;
  isLiking: boolean;
}

const CommentItem = ({ comment, onLike, onUnlike, onDelete, onReply, isLiking }: CommentItemProps) => {
  const { user } = useAuth();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const isOwnComment = user?.id === comment.user_id;
  
  const handleLikeToggle = () => {
    if (comment.user_liked) {
      onUnlike(comment.id);
    } else {
      onLike(comment.id);
    }
  };

  const renderCommentContent = () => {
    let content = comment.content;
    
    // Handle mentions
    if (comment.mentions && Array.isArray(comment.mentions)) {
      (comment.mentions as any[]).forEach((mention: any) => {
        const mentionRegex = new RegExp(`@${mention.username}`, 'g');
        content = content.replace(
          mentionRegex,
          `<span class="text-primary font-medium">@${mention.username}</span>`
        );
      });
    }

    // Handle hashtags (simple implementation)
    content = content.replace(
      /#(\w+)/g,
      '<span class="text-primary font-medium">#$1</span>'
    );

    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  };

  return (
    <>
      <div className="flex gap-3 py-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.profiles?.avatar_url || undefined} />
          <AvatarFallback className="text-xs">
            {comment.profiles?.display_name?.charAt(0)?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link 
              to={`/user/${comment.user_id}`}
              className="font-medium text-sm hover:underline"
            >
              {comment.profiles?.display_name || 'Unknown User'}
            </Link>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>
          
          <div className="text-sm text-foreground mb-2">
            {renderCommentContent()}
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLikeToggle}
              disabled={isLiking || !user}
              className={`h-6 px-2 text-xs ${comment.user_liked ? 'text-red-500' : 'text-muted-foreground'}`}
            >
              <Heart className={`h-3 w-3 mr-1 ${comment.user_liked ? 'fill-current' : ''}`} />
              {comment.likes_count || 0}
            </Button>
            
            {user && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReply(comment.id, comment.profiles?.display_name || 'User')}
                className="h-6 px-2 text-xs text-muted-foreground"
              >
                <Reply className="h-3 w-3 mr-1" />
                Reply
              </Button>
            )}
          </div>
        </div>
        
        {(isOwnComment || user) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwnComment && (
                <>
                  <DropdownMenuItem>
                    <Edit className="h-3 w-3 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-3 w-3 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
              {!isOwnComment && (
                <DropdownMenuItem>
                  Report Comment
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Comment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this comment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(comment.id);
                setShowDeleteDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const CommentsSection = ({ postId }: CommentsSectionProps) => {
  const { user } = useAuth();
  const {
    comments,
    isLoading,
    createComment,
    isCreatingComment,
    likeComment,
    unlikeComment,
    deleteComment,
    isLikingComment
  } = useComments(postId);

  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleReply = useCallback((commentId: string, username: string) => {
    setReplyingTo({ id: commentId, username });
    setNewComment(`@${username} `);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newComment.length + username.length + 2, newComment.length + username.length + 2);
    }, 100);
  }, [newComment]);

  const handleSubmitComment = () => {
    if (!newComment.trim() || !user) return;

    // Parse mentions from the comment
    const mentionRegex = /@(\w+)/g;
    const mentions: Array<{ user_id: string; username: string }> = [];
    let match;
    
    while ((match = mentionRegex.exec(newComment)) !== null) {
      const username = match[1];
      // In a real implementation, you'd look up the user_id by username
      // For now, we'll just store the username
      mentions.push({ user_id: '', username });
    }

    const commentData: CreateCommentData = {
      content: newComment.trim(),
      parent_comment_id: replyingTo?.id,
      mentions: mentions.length > 0 ? mentions : undefined,
    };

    createComment(commentData);
    setNewComment('');
    setReplyingTo(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmitComment();
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 bg-muted rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-1/4"></div>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Comments Header */}
        <div className="p-4 border-b">
          <h3 className="font-medium flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Comments ({comments.length})
          </h3>
        </div>

        {/* Add Comment */}
        {user && (
          <div className="p-4 border-b">
            {replyingTo && (
              <div className="mb-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                Replying to <span className="font-medium">{replyingTo.username}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReplyingTo(null);
                    setNewComment('');
                  }}
                  className="ml-2 h-4 px-1"
                >
                  Cancel
                </Button>
              </div>
            )}
            
            <div className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.user_metadata?.avatar_url} />
                <AvatarFallback className="text-xs">
                  {user.email?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1">
                <Textarea
                  ref={textareaRef}
                  placeholder="Add a comment... Use @ to mention users and # for tags"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="min-h-[60px] resize-none text-sm"
                  maxLength={500}
                />
                
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <AtSign className="h-3 w-3" />
                      <span>mention</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      <span>tag</span>
                    </div>
                    <span>• Ctrl+Enter to post</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {newComment.length}/500
                    </span>
                    <Button
                      size="sm"
                      onClick={handleSubmitComment}
                      disabled={!newComment.trim() || isCreatingComment}
                      className="h-7"
                    >
                      <Send className="h-3 w-3 mr-1" />
                      {isCreatingComment ? 'Posting...' : 'Post'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comments List */}
        <div className="divide-y">
          {comments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No comments yet. Be the first to comment!</p>
            </div>
          ) : (
            <div className="px-4">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  onLike={likeComment}
                  onUnlike={unlikeComment}
                  onDelete={deleteComment}
                  onReply={handleReply}
                  isLiking={isLikingComment}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};