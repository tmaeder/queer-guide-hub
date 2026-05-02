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
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { Copy, Trash2, Check, Link2, Lock, Calendar, Eye } from 'lucide-react';
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
import {
  fetchTripShares,
  createTripShare,
  deleteTripShare,
} from '@/hooks/useTripShares';

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
  const [icalMenu, setIcalMenu] = useState<{ anchor: HTMLElement; token: string } | null>(null);

  const [showBudget, setShowBudget] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showPacking, setShowPacking] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  const { data: shares, isLoading } = useQuery({
    queryKey: ['trip-shares', tripId],
    queryFn: () => fetchTripShares(tripId),
    enabled: open && !!tripId,
  });

  // Aggregated view counts per share. Cheap server aggregate, refetched
  // every dialog open. Empty result = no views logged yet.
  const { data: viewStats } = useQuery({
    queryKey: ['trip-share-view-stats', tripId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'get_share_view_stats' as never,
        { p_trip_id: tripId } as never,
      );
      if (error) throw error;
      const map = new Map<string, { total: number; views7d: number; lastAt: string | null }>();
      for (const row of (data ?? []) as Array<{
        share_id: string;
        total_views: number;
        views_7d: number;
        last_viewed_at: string | null;
      }>) {
        map.set(row.share_id, {
          total: Number(row.total_views),
          views7d: Number(row.views_7d),
          lastAt: row.last_viewed_at,
        });
      }
      return map;
    },
    enabled: open && !!tripId,
  });

  const createShare = useMutation({
    mutationFn: () =>
      createTripShare({
        tripId,
        createdBy: user?.id || null,
        permissions: {
          itinerary: true,
          budget: showBudget,
          notes: showNotes,
          packing: showPacking,
        },
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
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
    mutationFn: (id: string) => deleteTripShare(id),
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

  /**
   * iCal subscription URL — `webcal://` is the well-known scheme that
   * triggers Apple/Google Calendar to subscribe (with periodic refresh)
   * rather than one-shot import.
   */
  type IcalCategory = 'all' | 'places' | 'events' | 'reservations';

  const icalSubscriptionUrl = (token: string, category: IcalCategory = 'all') => {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
    if (!supabaseUrl) return '';
    const params = new URLSearchParams({ token });
    if (category !== 'all') params.set('category', category);
    const httpUrl = `${supabaseUrl}/functions/v1/trip-ical?${params.toString()}`;
    return httpUrl.replace(/^https?:\/\//, 'webcal://');
  };

  const copyToClipboard = async (text: string, kind: 'share' | 'ical' = 'share') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(text);
    toast({
      title:
        kind === 'ical'
          ? t('trips.share.icalCopied', 'Calendar URL copied')
          : t('trips.share.copied'),
    });
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
                  const stats = viewStats?.get(share.id);
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
                              {stats && stats.total > 0 && (
                                <Box
                                  sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    color: 'text.secondary',
                                    fontSize: 11,
                                  }}
                                  title={
                                    stats.lastAt
                                      ? t('trips.share.lastViewedAt', {
                                          defaultValue: 'Last viewed {{date}}',
                                          date: new Date(stats.lastAt).toLocaleString(),
                                        })
                                      : undefined
                                  }
                                >
                                  <Eye size={11} />
                                  {t('trips.share.viewCount', {
                                    defaultValue: '{{count}} views',
                                    count: stats.total,
                                  })}
                                  {stats.views7d > 0 && stats.views7d !== stats.total && (
                                    <span style={{ opacity: 0.7 }}>
                                      {' '}
                                      ·{' '}
                                      {t('trips.share.views7d', {
                                        defaultValue: '{{count}} this week',
                                        count: stats.views7d,
                                      })}
                                    </span>
                                  )}
                                </Box>
                              )}
                            </Box>
                          </Box>
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(shareUrl(share.token))}
                            aria-label={t('trips.share.copyAria')}
                            sx={{
                              minWidth: 40,
                              minHeight: 40,
                              color:
                                copied === shareUrl(share.token) ? 'success.main' : undefined,
                            }}
                          >
                            {copied === shareUrl(share.token) ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </IconButton>
                          {icalSubscriptionUrl(share.token) && (
                            <IconButton
                              size="small"
                              onClick={(e) =>
                                setIcalMenu({ anchor: e.currentTarget, token: share.token })
                              }
                              aria-label={t(
                                'trips.share.icalAria',
                                'Copy calendar subscription URL',
                              )}
                              sx={{ minWidth: 40, minHeight: 40 }}
                            >
                              <Calendar size={14} />
                            </IconButton>
                          )}
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

      {/* Calendar category menu */}
      <Menu
        anchorEl={icalMenu?.anchor ?? null}
        open={!!icalMenu}
        onClose={() => setIcalMenu(null)}
      >
        {(['all', 'places', 'events', 'reservations'] as const).map((cat) => (
          <MenuItem
            key={cat}
            onClick={() => {
              if (icalMenu) {
                copyToClipboard(icalSubscriptionUrl(icalMenu.token, cat), 'ical');
              }
              setIcalMenu(null);
            }}
          >
            {t(`trips.share.icalCategory.${cat}`, {
              defaultValue: {
                all: 'Subscribe to everything',
                places: 'Itinerary stops only',
                events: 'Events only',
                reservations: 'Reservations only',
              }[cat],
            })}
          </MenuItem>
        ))}
      </Menu>

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
