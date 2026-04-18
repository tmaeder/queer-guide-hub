import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
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
    <Box sx={{ mt: 0.5 }}>
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
        <Box
          sx={{ mt: 0.75, pl: 1 }}
          onClick={(e) => e.stopPropagation()}
        >
          {comments && comments.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1 }}>
              {comments.map((c) => (
                <Box
                  key={c.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 0.75,
                    p: 0.75,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {c.display_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
                      {c.body}
                    </Typography>
                  </Box>
                  {canDelete(c) && (
                    <IconButton
                      size="small"
                      aria-label="delete comment"
                      disabled={del.isPending}
                      onClick={() => del.mutate({ id: c.id, tripId })}
                      sx={{ p: 0.25 }}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {!disabled && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {!user && (
                <TextField
                  size="small"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 60))}
                  inputProps={{ maxLength: 60 }}
                  sx={{ '& .MuiInputBase-input': { fontSize: 13, py: 0.5 } }}
                />
              )}
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-end' }}>
                <TextField
                  size="small"
                  multiline
                  maxRows={3}
                  placeholder="Add a comment…"
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, 600))}
                  inputProps={{ maxLength: 600 }}
                  sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 13 } }}
                />
                <IconButton
                  size="small"
                  onClick={handleSubmit}
                  disabled={!body.trim() || (!user && !name.trim()) || post.isPending}
                  aria-label="Post comment"
                  sx={{ mb: 0.25 }}
                >
                  <Send size={14} />
                </IconButton>
              </Box>
              {post.isError && (
                <Typography variant="caption" color="error.main" sx={{ fontSize: 11 }}>
                  Could not post comment.
                </Typography>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
