import { useEffect, useState, useCallback } from 'react';
import { useCMSComments } from '@/hooks/useCMSComments';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Check, CornerDownRight, MessageSquare } from 'lucide-react';
import type { CMSReviewComment, CommentType } from '@/types/cms';

interface CommentThreadProps {
  sourceTable: string;
  sourceId: string;
  /** Read-only — hide input + actions. */
  readOnly?: boolean;
  /** Filter to specific comment_types (e.g. only `change_request`). */
  filterTypes?: CommentType[];
  /** Default type for new top-level comments. */
  defaultType?: CommentType;
  /** Show empty state hint when there are no comments. */
  emptyHint?: string;
  className?: string;
}

export function CommentThread({
  sourceTable,
  sourceId,
  readOnly = false,
  filterTypes,
  defaultType = 'comment',
  emptyHint = 'No comments yet.',
  className,
}: CommentThreadProps) {
  const { comments, loading, loadComments, addComment, resolveComment, unresolveComment } =
    useCMSComments();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sourceTable && sourceId) {
      loadComments(sourceTable, sourceId);
    }
  }, [sourceTable, sourceId, loadComments]);

  const handleSubmit = useCallback(
    async (parentId?: string, body?: string) => {
      const value = (body ?? draft).trim();
      if (!value) return;
      setSubmitting(true);
      const ok = await addComment(sourceTable, sourceId, value, defaultType, parentId);
      setSubmitting(false);
      if (ok && !parentId) setDraft('');
    },
    [draft, addComment, sourceTable, sourceId, defaultType],
  );

  const visible = filterTypes
    ? comments.filter((c) => filterTypes.includes(c.comment_type))
    : comments;

  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-sm font-medium mb-3">
        <MessageSquare className="size-4" />
        <span>Discussion</span>
        <span className="text-muted-foreground">({visible.length})</span>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!loading && visible.length === 0 && (
        <div className="text-sm text-muted-foreground py-2">{emptyHint}</div>
      )}

      <ul className="space-y-3">
        {visible.map((c) => (
          <CommentNode
            key={c.id}
            comment={c}
            depth={0}
            readOnly={readOnly}
            onReply={(body) => handleSubmit(c.id, body)}
            onResolve={() => resolveComment(c.id)}
            onUnresolve={() => unresolveComment(c.id)}
          />
        ))}
      </ul>

      {!readOnly && (
        <div className="mt-4 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            aria-label="Comment"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => handleSubmit()}
              disabled={submitting || !draft.trim()}
            >
              {submitting ? 'Posting…' : 'Post comment'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface CommentNodeProps {
  comment: CMSReviewComment;
  depth: number;
  readOnly: boolean;
  onReply: (body: string) => void;
  onResolve: () => void;
  onUnresolve: () => void;
}

function CommentNode({ comment, depth, readOnly, onReply, onResolve, onUnresolve }: CommentNodeProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');

  const author = comment.author?.display_name || comment.author?.email || 'Unknown';
  const initials = author.slice(0, 2).toUpperCase();
  const ts = new Date(comment.created_at).toLocaleString();
  const typeLabel: Record<CommentType, string> = {
    comment: '',
    approval: 'Approved',
    rejection: 'Rejected',
    change_request: 'Changes requested',
  };

  return (
    <li className="flex gap-3" style={{ marginLeft: depth * 16 }}>
      <Avatar className="size-7 shrink-0">
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{author}</span>
          <span>·</span>
          <span>{ts}</span>
          {typeLabel[comment.comment_type] && (
            <span className="ml-1 px-1.5 py-0.5 bg-muted text-foreground/80 text-[10px] uppercase tracking-wide">
              {typeLabel[comment.comment_type]}
            </span>
          )}
          {comment.resolved && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-emerald-600">
              <Check className="size-3" />
              resolved
            </span>
          )}
        </div>
        <div className="text-sm whitespace-pre-wrap mt-0.5">{comment.body}</div>

        {!readOnly && (
          <div className="mt-1 flex gap-3 text-xs">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              onClick={() => setReplyOpen((v) => !v)}
            >
              <CornerDownRight className="size-3" />
              Reply
            </button>
            {comment.resolved ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={onUnresolve}
              >
                Unresolve
              </button>
            ) : (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={onResolve}
              >
                Resolve
              </button>
            )}
          </div>
        )}

        {replyOpen && !readOnly && (
          <div className="mt-2 space-y-2">
            <Textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              placeholder="Reply…"
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setReplyOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!replyDraft.trim()}
                onClick={() => {
                  onReply(replyDraft);
                  setReplyDraft('');
                  setReplyOpen(false);
                }}
              >
                Reply
              </Button>
            </div>
          </div>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <ul className="mt-3 space-y-3">
            {comment.replies.map((r) => (
              <CommentNode
                key={r.id}
                comment={r}
                depth={depth + 1}
                readOnly={readOnly}
                onReply={onReply}
                onResolve={onResolve}
                onUnresolve={onUnresolve}
              />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
