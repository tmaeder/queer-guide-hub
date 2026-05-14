import { useEffect, useState } from 'react';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  usePostTripComment,
  useDeleteTripComment,
  getViewerDisplayName,
  setViewerDisplayName,
  type TripComment,
} from '@/hooks/useTripComments';
import { getViewerFingerprint } from '@/hooks/useTripReactions';

interface Props {
  tripId: string;
  placeId: string;
  comments: TripComment[] | undefined;
  disabled?: boolean;
  isOwner?: boolean;
}

/**
 * Comment thread for a single trip place. Shows existing comments +
 * inline compose box. Anonymous visitors are prompted for a display
 * name once (persisted to localStorage); authenticated users skip it.
 * Authors can delete their own; trip owners can delete any.
 */
export function PlaceCommentThread({ tripId, placeId, comments, disabled, isOwner }: Props) {
  const { user } = useAuth();
  const post = usePostTripComment();
  const del = useDeleteTripComment();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [name, setName] = useState(() => getViewerDisplayName() ?? '');
  const fingerprint = getViewerFingerprint();

  // Logged-in users use their profile name implicitly; still allow override.
  useEffect(() => {
    if (user && !name) {
      // Let them type but default to 'You' so comment posts work even before
      // we load profile display_name. The UI below hides the name field for
      // auth users.
      setName('You');
    }
  }, [user, name]);

  const count = comments?.length ?? 0;

  const handleSubmit = async () => {
    if (!body.trim()) return;
    const finalName = user ? (name || 'You') : name.trim();
    if (!finalName) return;
    try {
      await post.mutateAsync({ tripId, placeId, body, displayName: finalName });
      setBody('');
      if (!user) setViewerDisplayName(finalName);
    } catch {
      // toast handled by caller if desired
    }
  };

  const canDelete = (c: TripComment) => {
    if (isOwner) return true;
    if (user && c.viewer_id === user.id) return true;
    if (!user && c.viewer_fingerprint === fingerprint) return true;
    return false;
  };

  return (
    <div className="mt-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={disabled}
        className="h-6 px-1 text-xs gap-1 text-muted-foreground"
      >
        <MessageCircle size={12} />
        {count > 0 ? `${count} comment${count === 1 ? '' : 's'}` : 'Comment'}
      </Button>

      {open && (
        <div className="mt-1 pl-2" onClick={(e) => e.stopPropagation()}>
          {comments && comments.length > 0 && (
            <div className="flex flex-col gap-1 mb-2">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-1 p-1 bg-muted rounded"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-xs font-bold">{c.display_name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-[13px] whitespace-pre-wrap">{c.body}</p>
                  </div>
                  {canDelete(c) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="delete comment"
                      disabled={del.isPending}
                      onClick={() => del.mutate({ id: c.id, tripId })}
                      className="h-6 w-6 p-0"
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!disabled && (
            <div className="flex flex-col gap-1">
              {!user && (
                <Input
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 60))}
                  maxLength={60}
                  className="h-8 text-[13px]"
                />
              )}
              <div className="flex gap-1 items-end">
                <Textarea
                  placeholder="Add a comment…"
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, 600))}
                  maxLength={600}
                  rows={1}
                  className="flex-1 text-[13px] min-h-8 max-h-24"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!body.trim() || (!user && !name.trim()) || post.isPending}
                  aria-label="Post comment"
                  className="h-7 w-7 p-0 mb-0.5"
                >
                  <Send size={14} />
                </Button>
              </div>
              {post.isError && (
                <span className="text-[11px] text-destructive">
                  Could not post comment.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
