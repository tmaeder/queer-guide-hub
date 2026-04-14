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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
      <Box sx={{ display: 'flex', gap: 1.5, py: 1.5 }}>
        <Avatar sx={{ height: 32, width: 32 }}>
          <AvatarImage src={comment.profiles?.avatar_url || undefined} />
          <AvatarFallback sx={{ fontSize: '0.75rem' }}>
            {comment.profiles?.display_name?.charAt(0)?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <LocalizedLink to={`/user/${comment.user_id}`} style={{ fontWeight: 500, fontSize: '0.875rem' }}>
              {comment.profiles?.display_name || 'Unknown User'}
            </LocalizedLink>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </Typography>
          </Box>

          <Typography variant="body2" sx={{ mb: 1 }}>
            {renderCommentContent()}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLikeToggle}
              disabled={isLiking || !user}
              sx={{
                height: 24,
                px: 1,
                fontSize: '0.75rem',
                ...(comment.user_liked && { color: 'error.main' }),
              }}
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
                sx={{ height: 24, px: 1, fontSize: '0.75rem', color: 'text.secondary' }}
              >
                <Reply style={{ width: 12, height: 12, marginRight: 4 }} />
                Reply
              </Button>
            )}
          </Box>
        </Box>

        {(isOwnComment || user) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                sx={{ height: 24, width: 24, p: 0 }}
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
      </Box>

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
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                }}
              >
                <Box
                  sx={{ height: 32, width: 32, bgcolor: 'action.hover', borderRadius: '50%' }}
                ></Box>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box
                    sx={{ height: 12, bgcolor: 'action.hover', borderRadius: 1, width: '25%' }}
                  ></Box>
                  <Box
                    sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: '75%' }}
                  ></Box>
                </Box>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent sx={{ p: 0 }}>
        {/* Comments Header */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <MessageCircle style={{ width: 16, height: 16 }} />
            Comments ({comments.length})
          </Typography>
        </Box>

        {/* Add Comment */}
        {user && (
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            {replyingTo && (
              <Box
                sx={{
                  mb: 1,
                  p: 1,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                }}
              >
                Replying to{' '}
                <Box component="span" sx={{ fontWeight: 500 }}>
                  {replyingTo.username}
                </Box>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReplyingTo(null);
                    setNewComment('');
                  }}
                  sx={{ ml: 1, height: 16, px: 0.5 }}
                >
                  Cancel
                </Button>
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Avatar sx={{ height: 32, width: 32 }}>
                <AvatarImage src={user.user_metadata?.avatar_url} />
                <AvatarFallback sx={{ fontSize: '0.75rem' }}>
                  {user.email?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>

              <Box sx={{ flex: 1 }}>
                <Textarea
                  ref={textareaRef}
                  placeholder="Add a comment... Use @ to mention users and # for tags"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={handleKeyPress}
                  sx={{ minHeight: 60, resize: 'none', fontSize: '0.875rem' }}
                  maxLength={500}
                />

                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mt: 1,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <AtSign style={{ width: 12, height: 12 }} />
                      <span>mention</span>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Hash style={{ width: 12, height: 12 }} />
                      <span>tag</span>
                    </Box>
                    <span>• Ctrl+Enter to post</span>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {newComment.length}/500
                    </Typography>
                    <Button
                      size="sm"
                      onClick={handleSubmitComment}
                      disabled={!newComment.trim() || isCreatingComment}
                      sx={{ height: 28 }}
                    >
                      <Send style={{ width: 12, height: 12, marginRight: 4 }} />
                      {isCreatingComment ? 'Posting...' : 'Post'}
                    </Button>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        )}

        {/* Comments List */}
        <Box sx={{ '& > *': { borderBottom: 1, borderColor: 'divider' } }}>
          {comments.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              <MessageCircle
                style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.5 }}
              />
              <Typography variant="body2">No comments yet. Be the first to comment!</Typography>
            </Box>
          ) : (
            <Box sx={{ px: 2 }}>
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
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};
