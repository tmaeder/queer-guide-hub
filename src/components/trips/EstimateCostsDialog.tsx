import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import { Sparkles, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  useCostEstimate,
  type CostSuggestion,
} from '@/hooks/useTripCostEstimate';
import { useBudgetMutations } from '@/hooks/useTripBudget';
import type { TripMember } from '@/hooks/useTrips';

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  members: TripMember[];
  currentUserId: string | undefined;
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

/**
 * Review AI-generated budget suggestions and commit selected ones to
 * `trip_budget_items`. The model only proposes — the user approves.
 * Party size defaults to the trip member count (min 1). Each accepted
 * row is inserted with `paid_by = current user`, split evenly across
 * all members so the cost-split math still works.
 */
export function EstimateCostsDialog({
  open,
  onClose,
  tripId,
  members,
  currentUserId,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const estimate = useCostEstimate();
  const { addBudgetItem } = useBudgetMutations(tripId);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [committing, setCommitting] = useState(false);

  const partySize = Math.max(1, members.length);

  // Auto-run on first open when no data yet.
  useEffect(() => {
    if (open && !estimate.data && !estimate.isPending) {
      estimate.mutate({ tripId, partySize });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pre-select all when data arrives.
  useEffect(() => {
    if (estimate.data) {
      setSelected(new Set(estimate.data.suggestions.map((_, i) => i)));
    }
  }, [estimate.data]);

  const handleClose = () => {
    if (committing) return;
    estimate.reset();
    setSelected(new Set());
    onClose();
  };

  const handleRegenerate = () => {
    setSelected(new Set());
    estimate.mutate({ tripId, partySize });
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleCommit = async () => {
    if (!estimate.data || !currentUserId) return;
    const chosen: CostSuggestion[] = estimate.data.suggestions.filter((_, i) =>
      selected.has(i),
    );
    if (chosen.length === 0) return;

    const splitAmong = members.map((m) => m.user_id);
    setCommitting(true);
    try {
      for (const s of chosen) {
        await addBudgetItem.mutateAsync({
          trip_id: tripId,
          place_id: null,
          paid_by: currentUserId,
          split_among: splitAmong.length > 0 ? splitAmong : [currentUserId],
          title: s.title,
          amount: s.amount,
          currency: s.currency,
          category: s.category,
          date: null,
          receipt_url: null,
        });
      }
      toast({
        title: t('trips.budget.estimate.addedToast', {
          defaultValue: 'Added {{count}} estimated items',
          count: chosen.length,
        }),
      });
      handleClose();
    } catch (err) {
      toast({
        title: t('trips.budget.estimate.failedToast', { defaultValue: 'Could not add items' }),
        description: String((err as Error)?.message ?? err),
        variant: 'destructive',
      });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} />
            {t('trips.budget.estimate.title', { defaultValue: 'Estimate trip costs' })}
          </DialogTitle>
          <DialogDescription>
            {t('trips.budget.estimate.description', {
              defaultValue:
                'AI suggests realistic mid-range totals for your party. Tick the rows you want, then add them to the budget.',
            })}
          </DialogDescription>
        </DialogHeader>

        {estimate.isPending && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4, justifyContent: 'center' }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              {t('trips.budget.estimate.loading', { defaultValue: 'Crunching numbers…' })}
            </Typography>
          </Box>
        )}

        {estimate.isError && (
          <Typography variant="body2" color="error.main" sx={{ py: 2 }}>
            {t('trips.budget.estimate.error', {
              defaultValue: 'Estimate failed. Try again.',
            })}
          </Typography>
        )}

        {estimate.data && estimate.data.suggestions.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {t('trips.budget.estimate.empty', {
              defaultValue: 'No suggestions — add a few stops first.',
            })}
          </Typography>
        )}

        {estimate.data && estimate.data.suggestions.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Badge variant="secondary">
                {t('trips.budget.estimate.partySize', {
                  defaultValue: '{{count}} traveler(s)',
                  count: estimate.data.party_size,
                })}
              </Badge>
              <Badge variant="outline">{estimate.data.currency}</Badge>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {estimate.data.suggestions.map((s, i) => (
                <Box
                  key={i}
                  onClick={() => toggle(i)}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    p: 1.25,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:first-of-type': { borderTop: 'none' },
                  }}
                >
                  <Checkbox
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    size="small"
                    sx={{ p: 0.5, mt: -0.25 }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {s.title}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {formatAmount(s.amount, s.currency)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                      <Badge variant="outline">{s.category}</Badge>
                      <Typography variant="caption" color="text.secondary">
                        {t('trips.budget.estimate.perPerson', {
                          defaultValue: '{{amount}} / person',
                          amount: formatAmount(s.per_person, s.currency),
                        })}
                      </Typography>
                    </Box>
                    {s.notes && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                        {s.notes}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        <DialogFooter>
          {estimate.data && (
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={estimate.isPending || committing}>
              <RefreshCw size={14} style={{ marginRight: 6 }} />
              {t('trips.budget.estimate.regenerate', { defaultValue: 'Regenerate' })}
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} disabled={committing}>
            {t('trips.card.cancel')}
          </Button>
          <Button
            variant="brand"
            onClick={handleCommit}
            disabled={!estimate.data || selected.size === 0 || committing || !currentUserId}
          >
            {committing
              ? t('trips.budget.estimate.adding', { defaultValue: 'Adding…' })
              : t('trips.budget.estimate.addSelected', {
                  defaultValue: 'Add {{count}} to budget',
                  count: selected.size,
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
