import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react';
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
          <div className="flex items-center gap-3 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading" />
            <p className="text-sm text-muted-foreground">
              {t('trips.budget.estimate.loading', { defaultValue: 'Crunching numbers…' })}
            </p>
          </div>
        )}

        {estimate.isError && (
          <p className="text-sm text-destructive py-4">
            {t('trips.budget.estimate.error', {
              defaultValue: 'Estimate failed. Try again.',
            })}
          </p>
        )}

        {estimate.data && estimate.data.suggestions.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            {t('trips.budget.estimate.empty', {
              defaultValue: 'No suggestions — add a few stops first.',
            })}
          </p>
        )}

        {estimate.data && estimate.data.suggestions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary">
                {t('trips.budget.estimate.partySize', {
                  defaultValue: '{{count}} traveler(s)',
                  count: estimate.data.party_size,
                })}
              </Badge>
              <Badge variant="outline">{estimate.data.currency}</Badge>
            </div>
            <div className="flex flex-col gap-1">
              {estimate.data.suggestions.map((s, i) => (
                <div
                  key={i}
                  onClick={() => toggle(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(i);
                    }
                  }}
                  role="checkbox"
                  tabIndex={0}
                  aria-checked={selected.has(i)}
                  className="flex items-start gap-2 p-2.5 border-t border-border cursor-pointer hover:bg-muted first-of-type:border-t-0"
                >
                  <Checkbox
                    checked={selected.has(i)}
                    onCheckedChange={() => toggle(i)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{s.title}</p>
                      <p className="text-sm font-bold tabular-nums">
                        {formatAmount(s.amount, s.currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline">{s.category}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {t('trips.budget.estimate.perPerson', {
                          defaultValue: '{{amount}} / person',
                          amount: formatAmount(s.per_person, s.currency),
                        })}
                      </span>
                    </div>
                    {s.notes && (
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {s.notes}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
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
