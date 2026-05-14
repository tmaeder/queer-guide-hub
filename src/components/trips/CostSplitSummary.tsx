import { useMemo } from 'react';
import { ArrowRight, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { listFromWhere } from '@/hooks/usePageFetchers';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  computeBalances,
  convertAmount,
  suggestSettlements,
  type ExpenseItem,
} from '@/utils/settleUp';
import { useFxRates } from '@/hooks/useFxRates';
import type { TripMember } from '@/hooks/useTrips';

interface Props {
  tripId: string;
  members: TripMember[];
  defaultCurrency: string;
}

interface BudgetItemRow {
  paid_by: string;
  split_among: string[];
  amount: number;
  currency: string;
}

/**
 * Per-trip balance + suggested settlements.
 *
 * Reads `trip_budget_items` directly (RLS limits to trip members). Only
 * items in the trip's default currency are included — mixed-currency
 * balances need conversion which we don't ship yet; those items just
 * don't contribute.
 */
export function CostSplitSummary({ tripId, members, defaultCurrency }: Props) {
  const { t } = useTranslation();

  const { data: items, isLoading } = useQuery({
    queryKey: ['trip-budget-items', tripId],
    enabled: !!tripId,
    staleTime: 60 * 1000,
    queryFn: () =>
      listFromWhere<BudgetItemRow>(
        'trip_budget_items',
        'paid_by, split_among, amount, currency',
        [{ col: 'trip_id', val: tripId }],
      ),
  });

  const { data: fxRates } = useFxRates();

  const memberLookup = useMemo(() => {
    const m = new Map<string, TripMember>();
    for (const member of members) m.set(member.user_id, member);
    return m;
  }, [members]);

  // Convert every item into the trip's default currency before balancing.
  // Items in unknown currencies (or when fx_rates hasn't loaded) are
  // skipped and counted so the UI can disclose them.
  const { balances, settlements, skippedCount } = useMemo(() => {
    let skipped = 0;
    const expenses: ExpenseItem[] = [];
    const rates = fxRates ?? new Map<string, number>();
    for (const i of items ?? []) {
      const converted = convertAmount(
        Number(i.amount),
        i.currency,
        defaultCurrency,
        rates,
      );
      if (converted == null) {
        skipped += 1;
        continue;
      }
      expenses.push({
        paid_by: i.paid_by,
        split_among: i.split_among ?? [],
        amount: converted,
      });
    }
    const b = computeBalances(expenses);
    const s = suggestSettlements(b);
    return { balances: b, settlements: s, skippedCount: skipped };
  }, [items, defaultCurrency, fxRates]);

  if (isLoading) return null;

  if (balances.length === 0) {
    return null; // Budget tab already shows its own empty state.
  }

  const displayName = (userId: string): string => {
    return memberLookup.get(userId)?.profiles?.display_name || userId.slice(0, 6);
  };

  const avatarFor = (userId: string): string | undefined =>
    memberLookup.get(userId)?.profiles?.avatar_url ?? undefined;

  const fmt = (amount: number): string => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: defaultCurrency,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${defaultCurrency}`;
    }
  };

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Scale size={18} style={{ color: 'var(--primary)' }} />
        <p className="text-base font-bold">
          {t('trips.split.title', 'Settle up')}
        </p>
      </div>

      {/* Per-member balances */}
      <div className="flex flex-col gap-2 mb-4">
        {balances.map((b) => (
          <div key={b.user_id} className="flex items-center gap-3">
            <Avatar className="h-7 w-7">
              <AvatarImage src={avatarFor(b.user_id)} />
              <AvatarFallback>{displayName(b.user_id).slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <p className="flex-1 text-sm">{displayName(b.user_id)}</p>
            <p
              className="text-sm font-bold tabular-nums"
              style={{ color: b.net > 0 ? 'var(--success, #16a34a)' : 'var(--destructive)' }}
            >
              {b.net > 0 ? '+' : ''}
              {fmt(b.net)}
            </p>
          </div>
        ))}
      </div>

      {settlements.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground mb-1">
            {t('trips.split.suggestedTransfers', 'Suggested transfers')}
          </p>
          {settlements.map((s, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-muted text-sm">
              <p className="text-sm">{displayName(s.from_user_id)}</p>
              <ArrowRight size={14} style={{ color: 'var(--muted-foreground)' }} />
              <p className="text-sm">{displayName(s.to_user_id)}</p>
              <div className="flex-1" />
              <p className="text-sm font-bold tabular-nums">{fmt(s.amount)}</p>
            </div>
          ))}
        </div>
      )}

      {skippedCount > 0 && (
        <p className="text-xs text-muted-foreground mt-3 italic">
          {t('trips.split.skipped', {
            count: skippedCount,
            defaultValue: '{{count}} items in other currencies excluded',
          })}
        </p>
      )}
    </div>
  );
}
