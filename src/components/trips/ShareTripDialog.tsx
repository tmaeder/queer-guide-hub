import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import { Copy, Trash2, Check, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TripShare {
  id: string;
  trip_id: string;
  token: string;
  permissions: { itinerary: boolean; budget: boolean; notes: boolean; packing: boolean };
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
}

export function ShareTripDialog({ open, onClose, tripId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const [showBudget, setShowBudget] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showPacking, setShowPacking] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  const { data: shares, isLoading } = useQuery({
    queryKey: ['trip-shares', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_shares')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as TripShare[];
    },
    enabled: open && !!tripId,
  });

  const createShare = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('trip_shares')
        .insert({
          trip_id: tripId,
          created_by: user?.id || null,
          permissions: {
            itinerary: true,
            budget: showBudget,
            notes: showNotes,
            packing: showPacking,
          },
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TripShare;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-shares', tripId] });
      setShowBudget(false);
      setShowNotes(false);
      setShowPacking(false);
      setExpiresAt('');
    },
  });

  const deleteShare = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trip_shares').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-shares', tripId] });
    },
  });

  const shareUrl = (token: string) =>
    `${window.location.origin}/trips/shared/${token}`;

  const copyToClipboard = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = shareUrl(token);
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Share Trip</DialogTitle>
      <DialogContent>
        {/* Existing share links */}
        {isLoading ? (
          <Box className="flex justify-center py-4">
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            {(shares || []).length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Active Share Links
                </Typography>
                {(shares || []).map((share) => {
                  const isExpired = share.expires_at && new Date(share.expires_at) < new Date();
                  return (
                    <Card key={share.id} variant="outlined" sx={{ mb: 1, opacity: isExpired ? 0.5 : 1 }}>
                      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                        <Box className="flex items-center gap-2">
                          <Link2 size={14} className="text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                              {shareUrl(share.token)}
                            </Typography>
                            <Box className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                              {share.permissions.budget && <span>Budget</span>}
                              {share.permissions.notes && <span>Notes</span>}
                              {share.permissions.packing && <span>Packing</span>}
                              {share.expires_at && (
                                <span>
                                  {isExpired ? 'Expired' : `Expires ${new Date(share.expires_at).toLocaleDateString()}`}
                                </span>
                              )}
                            </Box>
                          </div>
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(share.token)}
                          >
                            {copied === share.token ? <Check size={14} /> : <Copy size={14} />}
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => deleteShare.mutate(share.id)}
                            sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            )}
          </>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Create new share link */}
        <Typography variant="subtitle2" gutterBottom>
          Create New Share Link
        </Typography>

        <Box className="flex flex-col gap-1 mb-2">
          <FormControlLabel
            control={<Switch checked disabled size="small" />}
            label={<Typography variant="body2">Itinerary (always shared)</Typography>}
          />
          <FormControlLabel
            control={
              <Switch
                checked={showBudget}
                onChange={(e) => setShowBudget(e.target.checked)}
                size="small"
              />
            }
            label={<Typography variant="body2">Budget</Typography>}
          />
          <FormControlLabel
            control={
              <Switch
                checked={showNotes}
                onChange={(e) => setShowNotes(e.target.checked)}
                size="small"
              />
            }
            label={<Typography variant="body2">Notes</Typography>}
          />
          <FormControlLabel
            control={
              <Switch
                checked={showPacking}
                onChange={(e) => setShowPacking(e.target.checked)}
                size="small"
              />
            }
            label={<Typography variant="body2">Packing List</Typography>}
          />
        </Box>

        <TextField
          label="Expires on (optional)"
          type="date"
          fullWidth
          size="small"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          onClick={() => createShare.mutate()}
          disabled={createShare.isPending}
          startIcon={createShare.isPending ? <CircularProgress size={16} /> : <Link2 size={16} />}
        >
          Create Share Link
        </Button>
      </DialogActions>
    </Dialog>
  );
}
