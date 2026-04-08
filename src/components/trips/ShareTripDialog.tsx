import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import { Copy, Trash2, Check, Link2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
          permissions: { itinerary: true, budget: showBudget, notes: showNotes, packing: showPacking },
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
      toast({ title: 'Share link created' });
    },
    onError: (err) => toast({ title: 'Failed to create share link', description: String(err), variant: 'destructive' }),
  });

  const deleteShare = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trip_shares').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-shares', tripId] });
      setDeleteConfirmId(null);
      toast({ title: 'Share link deleted' });
    },
    onError: (err) => toast({ title: 'Failed to delete share', description: String(err), variant: 'destructive' }),
  });

  const shareUrl = (token: string) => `${window.location.origin}/trips/shared/${token}`;

  const copyToClipboard = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopied(token);
      toast({ title: 'Link copied!' });
      setTimeout(() => setCopied(null), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = shareUrl(token);
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(token);
      toast({ title: 'Link copied!' });
      setTimeout(() => setCopied(null), 2000);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Trip</DialogTitle>
          </DialogHeader>

          {/* Existing shares */}
          {isLoading ? (
            <Box className="flex justify-center py-4">
              <CircularProgress size={24} />
            </Box>
          ) : (
            <>
              {(shares || []).length > 0 && (
                <Box sx={{ mb: 2, mt: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Active Share Links
                  </Typography>
                  {(shares || []).map((share) => {
                    const isExpired = share.expires_at && new Date(share.expires_at) < new Date();
                    return (
                      <Card key={share.id} className="mb-1" style={{ opacity: isExpired ? 0.5 : 1 }}>
                        <CardContent>
                          <Box className="flex items-center gap-2">
                            <Link2 size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
                            <div className="flex-1 min-w-0">
                              <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                {shareUrl(share.token)}
                              </Typography>
                              <Box className="flex items-center gap-1.5 mt-0.5">
                                {share.permissions.budget && <Badge variant="outline">Budget</Badge>}
                                {share.permissions.notes && <Badge variant="outline">Notes</Badge>}
                                {share.permissions.packing && <Badge variant="outline">Packing</Badge>}
                                {share.expires_at && (
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                                    {isExpired ? 'Expired' : `Expires ${new Date(share.expires_at).toLocaleDateString()}`}
                                  </Typography>
                                )}
                              </Box>
                            </div>
                            <IconButton
                              size="small"
                              onClick={() => copyToClipboard(share.token)}
                              sx={{ minWidth: 44, minHeight: 44 }}
                            >
                              {copied === share.token ? <Check size={14} /> : <Copy size={14} />}
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => setDeleteConfirmId(share.id)}
                              sx={{ opacity: 0.5, '&:hover': { opacity: 1 }, minWidth: 44, minHeight: 44 }}
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

          <Typography variant="subtitle2" gutterBottom>
            Create New Share Link
          </Typography>

          <Box className="flex flex-col gap-1 mb-2">
            <FormControlLabel
              control={<Switch checked disabled size="small" />}
              label={<Typography variant="body2">Itinerary (always shared)</Typography>}
            />
            <FormControlLabel
              control={<Switch checked={showBudget} onChange={(e) => setShowBudget(e.target.checked)} size="small" />}
              label={<Typography variant="body2">Budget</Typography>}
            />
            <FormControlLabel
              control={<Switch checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} size="small" />}
              label={<Typography variant="body2">Notes</Typography>}
            />
            <FormControlLabel
              control={<Switch checked={showPacking} onChange={(e) => setShowPacking(e.target.checked)} size="small" />}
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

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button
              onClick={() => createShare.mutate()}
              disabled={createShare.isPending}
            >
              {createShare.isPending ? <CircularProgress size={16} sx={{ mr: 1 }} /> : <Link2 size={16} style={{ marginRight: 6 }} />}
              Create Share Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Share Link</DialogTitle>
          </DialogHeader>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Are you sure you want to delete this share link? Anyone with it will lose access.
          </Typography>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteShare.mutate(deleteConfirmId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
