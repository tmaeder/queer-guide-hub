import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFxRates } from '@/hooks/useFxRates';
import { convertAmount } from '@/utils/settleUp';

export interface BudgetItem {
  id: string;
  trip_id: string;
  place_id: string | null;
  paid_by: string;
  split_among: string[];
  title: string;
  amount: number;
  currency: string;
  category: string | null;
  date: string | null;
  receipt_url: string | null;
  created_at: string;
}

export interface BudgetSummary {
  totalByCategory: Record<string, Record<string, number>>;
  totalByCurrency: Record<string, number>;
  perPersonBalance: Record<string, PersonBalance[]>;
  /** Single converted total in the requested display currency (when provided). */
  totalConverted: number | null;
  /** Per-category converted totals in the display currency (when provided). */
  totalByCategoryConverted: Record<string, number>;
  /** Number of items skipped during conversion (unknown currency). */
  unconvertedCount: number;
}

export interface PersonBalance {
  from: string;
  to: string;
  amount: number;
}

type CreateBudgetInput = Omit<BudgetItem, 'id' | 'created_at'>;
type UpdateBudgetInput = Partial<Omit<BudgetItem, 'id' | 'created_at' | 'trip_id'>> & { id: string };

function computeSummary(
  items: BudgetItem[],
  displayCurrency?: string,
  fxRates?: Map<string, number>,
): BudgetSummary {
  const totalByCategory: Record<string, Record<string, number>> = {};
  const totalByCurrency: Record<string, number> = {};
  const totalByCategoryConverted: Record<string, number> = {};
  let totalConverted: number | null = displayCurrency ? 0 : null;
  let unconvertedCount = 0;
  // netBalance[currency][userId] = net amount (positive = owed money, negative = owes money)
  const netBalance: Record<string, Record<string, number>> = {};

  for (const item of items) {
    const cat = item.category || 'other';
    const cur = item.currency;
    const amt = Number(item.amount);

    if (!totalByCategory[cat]) totalByCategory[cat] = {};
    totalByCategory[cat][cur] = (totalByCategory[cat][cur] || 0) + amt;

    totalByCurrency[cur] = (totalByCurrency[cur] || 0) + amt;

    if (displayCurrency && fxRates) {
      const converted = convertAmount(amt, cur, displayCurrency, fxRates);
      if (converted == null) {
        unconvertedCount += 1;
      } else {
        totalConverted = (totalConverted ?? 0) + converted;
        totalByCategoryConverted[cat] = (totalByCategoryConverted[cat] || 0) + converted;
      }
    }

    if (!netBalance[cur]) netBalance[cur] = {};
    const splitCount = item.split_among.length || 1;
    const perPerson = Number(item.amount) / splitCount;

    // Payer is owed by others
    netBalance[cur][item.paid_by] = (netBalance[cur][item.paid_by] || 0) + Number(item.amount) - perPerson;

    // Each person in split owes their share (except payer already handled)
    for (const userId of item.split_among) {
      if (userId !== item.paid_by) {
        netBalance[cur][userId] = (netBalance[cur][userId] || 0) - perPerson;
      }
    }
  }

  // Simplify debts per currency
  const perPersonBalance: Record<string, PersonBalance[]> = {};
  for (const cur of Object.keys(netBalance)) {
    const balances = { ...netBalance[cur] };
    const settlements: PersonBalance[] = [];

    const debtors = Object.entries(balances)
      .filter(([, v]) => v < -0.01)
      .sort((a, b) => a[1] - b[1]);
    const creditors = Object.entries(balances)
      .filter(([, v]) => v > 0.01)
      .sort((a, b) => b[1] - a[1]);

    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const [debtor, debtAmt] = debtors[i];
      const [creditor, creditAmt] = creditors[j];
      const settle = Math.min(-debtAmt, creditAmt);

      if (settle > 0.01) {
        settlements.push({
          from: debtor,
          to: creditor,
          amount: Math.round(settle * 100) / 100,
        });
      }

      debtors[i] = [debtor, debtAmt + settle];
      creditors[j] = [creditor, creditAmt - settle];

      if (Math.abs(debtors[i][1] as number) < 0.01) i++;
      if (Math.abs(creditors[j][1] as number) < 0.01) j++;
    }

    if (settlements.length > 0) {
      perPersonBalance[cur] = settlements;
    }
  }

  return {
    totalByCategory,
    totalByCurrency,
    perPersonBalance,
    totalConverted,
    totalByCategoryConverted,
    unconvertedCount,
  };
}

export function useTripBudget(tripId: string | undefined, displayCurrency?: string) {
  const query = useQuery({
    queryKey: ['trip-budget', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_budget_items')
        .select('*')
        .eq('trip_id', tripId!)
        .order('date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as BudgetItem[];
    },
    enabled: !!tripId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: fxRates } = useFxRates();

  const summary: BudgetSummary = query.data
    ? computeSummary(query.data, displayCurrency, fxRates ?? undefined)
    : {
        totalByCategory: {},
        totalByCurrency: {},
        perPersonBalance: {},
        totalConverted: displayCurrency ? 0 : null,
        totalByCategoryConverted: {},
        unconvertedCount: 0,
      };

  return { ...query, items: query.data || [], summary };
}

export function useBudgetMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['trip-budget', tripId] });

  const addBudgetItem = useMutation({
    mutationFn: async (input: CreateBudgetInput) => {
      const { data, error } = await supabase
        .from('trip_budget_items')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as BudgetItem;
    },
    onSuccess: invalidate,
  });

  const updateBudgetItem = useMutation({
    mutationFn: async ({ id, ...input }: UpdateBudgetInput) => {
      const { data, error } = await supabase
        .from('trip_budget_items')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as BudgetItem;
    },
    onSuccess: invalidate,
  });

  const deleteBudgetItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trip_budget_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { addBudgetItem, updateBudgetItem, deleteBudgetItem };
}
