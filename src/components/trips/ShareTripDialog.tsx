import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Trash2, Check, Link2, Lock, Calendar, Eye, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

  const [showBudget, setShowBudget] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showPacking, setShowPacking] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  const { data: shares, isLoading } = useQuery({
    queryKey: ['trip-shares', tripId],
    queryFn: () => fetchTripShares(tripId),
    enabled: open && !!tripId,
  });

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
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            (shares || []).length > 0 && (
              <div className="mb-4 mt-2">
                <p className="text-sm text-muted-foreground mb-2">
                  {t('trips.share.activeLinks', { count: activeShares.length })}
                </p>
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
                        <div className="flex items-center gap-2">
                          <Link2 size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate font-mono" style={{ fontSize: 12 }}>
                              {shareUrl(share.token)}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
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
                                <span
                                  className={isExpired ? 'text-destructive' : 'text-muted-foreground'}
                                  style={{ fontSize: 10 }}
                                >
                                  {isExpired
                                    ? t('trips.share.expired')
                                    : t('trips.share.expiresOn', {
                                        date: new Date(
                                          share.expires_at,
                                        ).toLocaleDateString(),
                                      })}
                                </span>
                              )}
                              {stats && stats.total > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 text-muted-foreground"
                                  style={{ fontSize: 11 }}
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
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-10 w-10 p-0"
                            onClick={() => copyToClipboard(shareUrl(share.token))}
                            aria-label={t('trips.share.copyAria')}
                            style={{
                              color:
                                copied === shareUrl(share.token) ? 'hsl(var(--success))' : undefined,
                            }}
                          >
                            {copied === shareUrl(share.token) ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </Button>
                          {icalSubscriptionUrl(share.token) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-10 w-10 p-0"
                                  aria-label={t(
                                    'trips.share.icalAria',
                                    'Copy calendar subscription URL',
                                  )}
                                >
                                  <Calendar size={14} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {(['all', 'places', 'events', 'reservations'] as const).map((cat) => (
                                  <DropdownMenuItem
                                    key={cat}
                                    onClick={() => {
                                      copyToClipboard(icalSubscriptionUrl(share.token, cat), 'ical');
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
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-10 w-10 p-0 opacity-50 hover:opacity-100 hover:text-destructive"
                            onClick={() => setDeleteConfirmId(share.id)}
                            aria-label={t('trips.share.deleteAria')}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )
          )}

          <hr className="my-4 border-border" />

          <p className="text-sm font-semibold mb-1">{t('trips.share.createNew')}</p>
          <p className="text-xs text-muted-foreground mb-2 block">
            {t('trips.share.previewLabel')}
          </p>

          {/* Permissions preview */}
          <div className="flex flex-col gap-1 mb-4">
            <div className="flex items-center gap-2">
              <Switch checked disabled id="perm-itinerary" />
              <Label htmlFor="perm-itinerary" className="inline-flex items-center gap-1.5">
                <Lock size={12} style={{ opacity: 0.5 }} />
                <span className="text-sm">{t('trips.share.itineraryAlways')}</span>
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={showBudget} onCheckedChange={setShowBudget} id="perm-budget" />
              <Label htmlFor="perm-budget" className="text-sm">
                {t('trips.tabs.budget')}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={showNotes} onCheckedChange={setShowNotes} id="perm-notes" />
              <Label htmlFor="perm-notes" className="text-sm">
                {t('trips.collaborate.notes')}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={showPacking} onCheckedChange={setShowPacking} id="perm-packing" />
              <Label htmlFor="perm-packing" className="text-sm">
                {t('trips.tabs.packing')}
              </Label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="share-expires">{t('trips.share.expiresLabel')}</Label>
            <Input
              id="share-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
          </div>

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
                <Loader2 size={16} className="mr-1 animate-spin" />
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
