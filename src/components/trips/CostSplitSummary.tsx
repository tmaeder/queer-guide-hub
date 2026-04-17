import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import { ArrowRight, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  computeBalances,
  suggestSettlements,
  type ExpenseItem,
} from '@/utils/settleUp';
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
    queryFn: async (): Promise<BudgetItemRow[]> => {
      const { data, error } = await supabase
        .from('trip_budget_items')
        .select('paid_by, split_among, amount, currency')
        .eq('trip_id', tripId);
      if (error) throw error;
      return (data ?? []) as BudgetItemRow[];
    },
  });

  const memberLookup = useMemo(() => {
    const m = new Map<string, TripMember>();
    for (const member of members) m.set(member.user_id, member);
    return m;
  }, [members]);

  const { balances, settlements, skippedCount } = useMemo(() => {
    const eligible = (items ?? []).filter((i) => i.currency === defaultCurrency);
    const skipped = (items ?? []).length - eligible.length;
    const expenses: ExpenseItem[] = eligible.map((i) => ({
      paid_by: i.paid_by,
      split_among: i.split_among ?? [],
      amount: Number(i.amount),
    }));
    const b = computeBalances(expenses);
    const s = suggestSettlements(b);
    return { balances: b, settlements: s, skippedCount: skipped };
  }, [items, defaultCurrency]);

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
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Scale size={18} style={{ color: 'var(--primary)' }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {t('trips.split.title', 'Settle up')}
        </Typography>
      </Box>

      {/* Per-member balances */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
        {balances.map((b) => (
          <Box key={b.user_id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar src={avatarFor(b.user_id)} sx={{ width: 28, height: 28 }}>
              {displayName(b.user_id).slice(0, 1).toUpperCase()}
            </Avatar>
            <Typography sx={{ flex: 1, fontSize: '0.875rem' }}>
              {displayName(b.user_id)}
            </Typography>
            <Typography
              sx={{
                fontSize: '0.875rem',
                fontWeight: 700,
                color: b.net > 0 ? 'success.main' : 'error.main',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {b.net > 0 ? '+' : ''}
              {fmt(b.net)}
            </Typography>
          </Box>
        ))}
      </Box>

      {settlements.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.5 }}>
            {t('trips.split.suggestedTransfers', 'Suggested transfers')}
          </Typography>
          {settlements.map((s, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                bgcolor: 'action.hover',
                fontSize: '0.875rem',
              }}
            >
              <Typography sx={{ fontSize: '0.875rem' }}>
                {displayName(s.from_user_id)}
              </Typography>
              <ArrowRight size={14} style={{ color: 'var(--muted-foreground)' }} />
              <Typography sx={{ fontSize: '0.875rem' }}>{displayName(s.to_user_id)}</Typography>
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(s.amount)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {skippedCount > 0 && (
        <Typography
          sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1.5, fontStyle: 'italic' }}
        >
          {t('trips.split.skipped', {
            count: skippedCount,
            defaultValue: '{{count}} items in other currencies excluded',
          })}
        </Typography>
      )}
    </Box>
  );
}
