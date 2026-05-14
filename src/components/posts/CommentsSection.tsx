import { useState, useRef, useCallback } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Heart,
  MessageCircle,
  Reply,
  MoreHorizontal,
  Send,
  Trash2,
  Edit,
  AtSign,
  Hash,
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
import { useComments, PostComment, CreateCommentData } from '@/hooks/useComments';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ContentSanitizer } from '@/components/security/ContentSanitizer';

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

const CommentItem = ({
  comment,
  onLike,
  onUnlike,
  onDelete,
  onReply,
  isLiking,
}: CommentItemProps) => {
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
      (comment.mentions as Array<{ username: string }>).forEach((mention) => {
        const mentionRegex = new RegExp(`@${mention.username}`, 'g');
        content = content.replace(
          mentionRegex,
          `<span class="text-primary font-medium">@${mention.username}</span>`,
        );
      });
    }

    // Handle hashtags (simple implementation)
    content = content.replace(/#(\w+)/g, '<span class="text-primary font-medium">#$1</span>');

    return (
      <ContentSanitizer content={content} allowedTags={['span', 'br', 'strong', 'em', 'u', 'a']} />
    );
  };

  return (
    <>
      <div className="flex gap-3 py-3">
        <Avatar>
          <AvatarImage src={comment.profiles?.avatar_url || undefined} />
          <AvatarFallback>
            {comment.profiles?.display_name?.charAt(0)?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <LocalizedLink to={`/user/${comment.user_id}`} style={{ fontWeight: 500, fontSize: '0.875rem' }}>
              {comment.profiles?.display_name || 'Unknown User'}
            </LocalizedLink>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>

          <div className="text-sm mb-2">{renderCommentContent()}</div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLikeToggle}
              disabled={isLiking || !user}

            >
              <Heart
                style={{
                  width: 12,
                  height: 12,
                  marginRight: 4,
                  ...(comment.user_liked && { fill: 'currentColor' }),
                }}
              />
              {comment.likes_count || 0}
            </Button>

            {user && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReply(comment.id, comment.profiles?.display_name || 'User')}

              >
                <Reply style={{ width: 12, height: 12, marginRight: 4 }} />
                Reply
              </Button>
            )}
          </div>
        </div>

        {(isOwnComment || user) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"

                aria-label="Comment actions"
              >
                <MoreHorizontal style={{ width: 12, height: 12 }} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwnComment && (
                <>
                  <DropdownMenuItem>
                    <Edit style={{ width: 12, height: 12, marginRight: 8 }} />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowDeleteDialog(true)}>
                    <Trash2 style={{ width: 12, height: 12, marginRight: 8 }} />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
              {!isOwnComment && <DropdownMenuItem>Report Comment</DropdownMenuItem>}
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
    isLikingComment,
  } = useComments(postId);

  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleReply = useCallback(
    (commentId: string, username: string) => {
      setReplyingTo({ id: commentId, username });
      setNewComment(`@${username} `);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(
          newComment.length + username.length + 2,
          newComment.length + username.length + 2,
        );
      }, 100);
    },
    [newComment],
  );

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
        <CardContent>
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 bg-accent rounded-full" />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="h-3 bg-accent rounded-sm w-1/4" />
                  <div className="h-4 bg-accent rounded-sm w-3/4" />
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
      <CardContent>
        {/* Comments Header */}
        <div className="p-4 border-b">
          <p className="font-medium flex items-center gap-2">
            <MessageCircle style={{ width: 16, height: 16 }} />
            Comments ({comments.length})
          </p>
        </div>

        {/* Add Comment */}
        {user && (
          <div className="p-4 border-b">
            {replyingTo && (
              <div className="mb-2 p-2 bg-accent rounded-sm text-xs text-muted-foreground">
                Replying to <span className="font-medium">{replyingTo.username}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReplyingTo(null);
                    setNewComment('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            <div className="flex gap-3">
              <Avatar>
                <AvatarImage src={user.user_metadata?.avatar_url} />
                <AvatarFallback>
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
                  maxLength={500}
                />

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <AtSign style={{ width: 12, height: 12 }} />
                      <span>mention</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Hash style={{ width: 12, height: 12 }} />
                      <span>tag</span>
                    </div>
                    <span>• Ctrl+Enter to post</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{newComment.length}/500</span>
                    <Button
                      size="sm"
                      onClick={handleSubmitComment}
                      disabled={!newComment.trim() || isCreatingComment}
                    >
                      <Send style={{ width: 12, height: 12, marginRight: 4 }} />
                      {isCreatingComment ? 'Posting...' : 'Post'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comments List */}
        <div className="[&>*]:border-b [&>*]:border-border">
          {comments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageCircle style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.5 }} />
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
