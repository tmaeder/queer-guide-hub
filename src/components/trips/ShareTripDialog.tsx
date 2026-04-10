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
import { Copy, Trash2, Check, Link2, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TripShare {
  id: string;
  trip_id: string;
  token: string;
  permissions: {
    itinerary: boolean;
    budget: boolean;
    notes: boolean;
    packing: boolean;
  };
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
  const { t } = useTranslation();
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
      toast({ title: t('trips.share.created') });
    },
    onError: (err) =>
      toast({
        title: t('trips.share.createFailed'),
        description: String(err),
        variant: 'destructive',
      }),
  });

  const deleteShare = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trip_shares').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-shares', tripId] });
      setDeleteConfirmId(null);
      toast({ title: t('trips.share.deleted') });
    },
    onError: (err) =>
      toast({
        title: t('trips.share.deleteFailed'),
        description: String(err),
        variant: 'destructive',
      }),
  });

  const shareUrl = (token: string) =>
    `${window.location.origin}/trips/shared/${token}`;

  const copyToClipboard = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
    } catch {
      const input = document.createElement('input');
      input.value = shareUrl(token);
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(token);
    toast({ title: t('trips.share.copied') });
    setTimeout(() => setCopied(null), 2000);
  };

  const activeShares = (shares || []).filter(
    (s) => !s.expires_at || new Date(s.expires_at) > new Date(),
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.share.title')}</DialogTitle>
            <DialogDescription>
              {t('trips.share.description')}
            </DialogDescription>
          </DialogHeader>

          {/* Existing shares */}
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            (shares || []).length > 0 && (
              <Box sx={{ mb: 2, mt: 1 }}>
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  gutterBottom
                >
                  {t('trips.share.activeLinks', { count: activeShares.length })}
                </Typography>
                {(shares || []).map((share) => {
                  const isExpired =
                    share.expires_at && new Date(share.expires_at) < new Date();
                  return (
                    <Card
                      key={share.id}
                      className="mb-1"
                      style={{ opacity: isExpired ? 0.5 : 1 }}
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Link2 size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              noWrap
                              sx={{ fontFamily: 'monospace', fontSize: 12 }}
                            >
                              {shareUrl(share.token)}
                            </Typography>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                mt: 0.5,
                                flexWrap: 'wrap',
                              }}
                            >
                              <Badge variant="secondary">
                                {t('trips.tabs.itinerary')}
                              </Badge>
                              {share.permissions.budget && (
                                <Badge variant="outline">
                                  {t('trips.tabs.budget')}
                                </Badge>
                              )}
                              {share.permissions.notes && (
                                <Badge variant="outline">
                                  {t('trips.collaborate.notes')}
                                </Badge>
                              )}
                              {share.permissions.packing && (
                                <Badge variant="outline">
                                  {t('trips.tabs.packing')}
                                </Badge>
                              )}
                              {share.expires_at && (
                                <Typography
                                  variant="caption"
                                  color={isExpired ? 'error' : 'text.secondary'}
                                  sx={{ fontSize: 10 }}
                                >
                                  {isExpired
                                    ? t('trips.share.expired')
                                    : t('trips.share.expiresOn', {
                                        date: new Date(
                                          share.expires_at,
                                        ).toLocaleDateString(),
                                      })}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(share.token)}
                            aria-label={t('trips.share.copyAria')}
                            sx={{
                              minWidth: 40,
                              minHeight: 40,
                              color:
                                copied === share.token ? 'success.main' : undefined,
                            }}
                          >
                            {copied === share.token ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => setDeleteConfirmId(share.id)}
                            aria-label={t('trips.share.deleteAria')}
                            sx={{
                              opacity: 0.5,
                              '&:hover': { opacity: 1, color: 'error.main' },
                              minWidth: 40,
                              minHeight: 40,
                            }}
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            )
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" gutterBottom>
            {t('trips.share.createNew')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {t('trips.share.previewLabel')}
          </Typography>

          {/* Permissions preview */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.25,
              mb: 2,
            }}
          >
            <FormControlLabel
              control={<Switch checked disabled size="small" />}
              label={
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                  <Lock size={12} style={{ opacity: 0.5 }} />
                  <Typography variant="body2">
                    {t('trips.share.itineraryAlways')}
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={showBudget}
                  onChange={(e) => setShowBudget(e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="body2">{t('trips.tabs.budget')}</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={showNotes}
                  onChange={(e) => setShowNotes(e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="body2">{t('trips.collaborate.notes')}</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={showPacking}
                  onChange={(e) => setShowPacking(e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="body2">{t('trips.tabs.packing')}</Typography>}
            />
          </Box>

          <TextField
            label={t('trips.share.expiresLabel')}
            type="date"
            fullWidth
            size="small"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: new Date().toISOString().slice(0, 10) }}
          />

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('trips.share.close')}
            </Button>
            <Button
              variant="brand"
              onClick={() => createShare.mutate()}
              disabled={createShare.isPending}
            >
              {createShare.isPending ? (
                <CircularProgress size={16} sx={{ mr: 1, color: 'inherit' }} />
              ) : (
                <Link2 size={16} style={{ marginRight: 6 }} />
              )}
              {t('trips.share.createButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(o) => !o && setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.share.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('trips.share.deleteConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              {t('trips.card.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteConfirmId && deleteShare.mutate(deleteConfirmId)
              }
            >
              {t('trips.card.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
