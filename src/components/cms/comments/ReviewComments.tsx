/**
 * ReviewComments
 * Threaded review comments panel for a content item.
 * Supports different comment types, resolve/unresolve, and inline replies.
 */

import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Stack,
  Paper,
  CircularProgress,
  Alert,
  Divider,
  Avatar,
  Chip,
  Tooltip,
  Select,
  MenuItem,
  IconButton,
} from '@mui/material';
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  User,
  Check,
  X,
} from 'lucide-react';
import { useCMSComments } from '@/hooks/useCMSComments';
import type { CMSReviewComment, CommentType } from '@/types/cms';

/** Relative time formatter */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/** Badge color and icon for comment types */
function getCommentTypeMeta(type: CommentType): {
  label: string;
  color: 'default' | 'success' | 'error' | 'warning';
  icon: React.ReactNode;
} {
  switch (type) {
    case 'approval':
      return { label: 'Approval', color: 'success', icon: <CheckCircle size={12} /> };
    case 'rejection':
      return { label: 'Rejection', color: 'error', icon: <XCircle size={12} /> };
    case 'change_request':
      return { label: 'Change Request', color: 'warning', icon: <AlertCircle size={12} /> };
    case 'comment':
    default:
      return { label: 'Comment', color: 'default', icon: <MessageSquare size={12} /> };
  }
}

interface ReviewCommentsProps {
  sourceTable: string;
  sourceId: string;
}

export function ReviewComments({ sourceTable, sourceId }: ReviewCommentsProps) {
  const { comments, loading, error, loadComments, addComment, resolveComment, unresolveComment } =
    useCMSComments();

  const [newBody, setNewBody] = useState('');
  const [newType, setNewType] = useState<CommentType>('comment');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  useEffect(() => {
    loadComments(sourceTable, sourceId);
  }, [sourceTable, sourceId, loadComments]);

  const handleSubmit = async () => {
    if (!newBody.trim()) return;
    setIsSubmitting(true);
    const success = await addComment(sourceTable, sourceId, newBody, newType);
    if (success) {
      setNewBody('');
      setNewType('comment');
    }
    setIsSubmitting(false);
  };

  const handleReply = async (parentId: string) => {
    if (!replyBody.trim()) return;
    setIsReplying(true);
    const success = await addComment(sourceTable, sourceId, replyBody, 'comment', parentId);
    if (success) {
      setReplyBody('');
      setReplyTo(null);
    }
    setIsReplying(false);
  };

  const handleResolveToggle = async (comment: CMSReviewComment) => {
    if (comment.resolved) {
      await unresolveComment(comment.id);
    } else {
      await resolveComment(comment.id);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Failed to load comments: {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <MessageSquare size={18} className="text-gray-500" />
        <Typography variant="subtitle1" fontWeight={600}>
          Review Comments
        </Typography>
        <Typography variant="caption" color="text.secondary">
          ({comments.length})
        </Typography>
      </Stack>

      {/* New comment form */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack spacing={1.5}>
          <TextField
            placeholder="Add a comment..."
            multiline
            minRows={2}
            maxRows={6}
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            fullWidth
            size="small"
          />
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Select
              value={newType}
              onChange={(e) => setNewType(e.target.value as CommentType)}
              size="small"
              sx={{ minWidth: 160, fontSize: '0.8rem' }}
            >
              <MenuItem value="comment">Comment</MenuItem>
              <MenuItem value="approval">Approval</MenuItem>
              <MenuItem value="rejection">Rejection</MenuItem>
              <MenuItem value="change_request">Change Request</MenuItem>
            </Select>
            <Button
              variant="contained"
              size="small"
              onClick={handleSubmit}
              disabled={isSubmitting || !newBody.trim()}
              startIcon={
                isSubmitting ? <CircularProgress size={14} color="inherit" /> : undefined
              }
            >
              {isSubmitting ? 'Posting...' : 'Post'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Comments list */}
      {comments.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <MessageSquare size={24} className="text-gray-400 mx-auto mb-2" />
          <Typography variant="body2" color="text.secondary">
            No comments yet. Be the first to leave a review.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              depth={0}
              replyTo={replyTo}
              replyBody={replyBody}
              isReplying={isReplying}
              onReplyToChange={setReplyTo}
              onReplyBodyChange={setReplyBody}
              onReply={handleReply}
              onResolveToggle={handleResolveToggle}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

/** Recursive comment thread renderer */
interface CommentThreadProps {
  comment: CMSReviewComment;
  depth: number;
  replyTo: string | null;
  replyBody: string;
  isReplying: boolean;
  onReplyToChange: (id: string | null) => void;
  onReplyBodyChange: (body: string) => void;
  onReply: (parentId: string) => void;
  onResolveToggle: (comment: CMSReviewComment) => void;
}

function CommentThread({
  comment,
  depth,
  replyTo,
  replyBody,
  isReplying,
  onReplyToChange,
  onReplyBodyChange,
  onReply,
  onResolveToggle,
}: CommentThreadProps) {
  const authorName =
    comment.author?.display_name || comment.author?.email || 'Unknown';
  const initials = authorName
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('');
  const typeMeta = getCommentTypeMeta(comment.comment_type);

  return (
    <Box sx={{ ml: depth > 0 ? 3 : 0 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          opacity: comment.resolved ? 0.6 : 1,
          borderColor: comment.resolved ? 'success.light' : undefined,
          backgroundColor: comment.resolved ? 'rgba(34, 197, 94, 0.04)' : undefined,
        }}
      >
        {/* Header */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Avatar
            sx={{ width: 24, height: 24, fontSize: '0.65rem', bgcolor: 'grey.500' }}
          >
            {initials || <User size={12} />}
          </Avatar>
          <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
            {authorName}
          </Typography>

          <Chip
            size="small"
            label={typeMeta.label}
            color={typeMeta.color}
            icon={<>{typeMeta.icon}</>}
            variant="outlined"
            sx={{ fontSize: '0.65rem', height: 22 }}
          />

          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Clock size={12} className="text-gray-400" />
            <Tooltip title={new Date(comment.created_at).toLocaleString()}>
              <Typography variant="caption" color="text.secondary">
                {formatRelativeTime(comment.created_at)}
              </Typography>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Body */}
        <Typography variant="body2" sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }}>
          {comment.body}
        </Typography>

        {/* Actions */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            variant="text"
            onClick={() =>
              onReplyToChange(replyTo === comment.id ? null : comment.id)
            }
            startIcon={<MessageSquare size={12} />}
            sx={{ fontSize: '0.7rem', textTransform: 'none' }}
          >
            Reply
          </Button>

          <Tooltip title={comment.resolved ? 'Mark as unresolved' : 'Mark as resolved'}>
            <IconButton size="small" onClick={() => onResolveToggle(comment)}>
              {comment.resolved ? (
                <X size={14} className="text-gray-500" />
              ) : (
                <Check size={14} className="text-green-500" />
              )}
            </IconButton>
          </Tooltip>

          {comment.resolved && (
            <Typography variant="caption" color="success.main" fontWeight={600}>
              Resolved
            </Typography>
          )}
        </Stack>

        {/* Inline reply form */}
        {replyTo === comment.id && (
          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Stack spacing={1}>
              <TextField
                placeholder="Write a reply..."
                multiline
                minRows={2}
                maxRows={4}
                value={replyBody}
                onChange={(e) => onReplyBodyChange(e.target.value)}
                fullWidth
                size="small"
                autoFocus
              />
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => {
                    onReplyToChange(null);
                    onReplyBodyChange('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => onReply(comment.id)}
                  disabled={isReplying || !replyBody.trim()}
                  startIcon={
                    isReplying ? <CircularProgress size={12} color="inherit" /> : undefined
                  }
                >
                  {isReplying ? 'Posting...' : 'Reply'}
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}
      </Paper>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              replyTo={replyTo}
              replyBody={replyBody}
              isReplying={isReplying}
              onReplyToChange={onReplyToChange}
              onReplyBodyChange={onReplyBodyChange}
              onReply={onReply}
              onResolveToggle={onResolveToggle}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
