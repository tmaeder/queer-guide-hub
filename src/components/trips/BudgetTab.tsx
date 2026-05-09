import { useState } from 'react';
import { Plus, Trash2, ArrowRight, Utensils, Car, Home, Ticket, ShoppingBag, Package, Wallet, Sparkles } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useToast } from '@/hooks/use-toast';
import { useTripBudget, useBudgetMutations, type BudgetItem } from '@/hooks/useTripBudget';
import type { TripMember } from '@/hooks/useTrips';
import { AddBudgetDialog } from './AddBudgetDialog';
import { CostSplitSummary } from './CostSplitSummary';
import { EstimateCostsDialog } from './EstimateCostsDialog';
import { BookingActivitySection } from './BookingActivitySection';
import { BundledCheckoutDialog } from './BundledCheckoutDialog';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const CATEGORY_ICONS: Record<string, typeof Utensils> = {
  food: Utensils,
  transport: Car,
  accommodation: Home,
  activities: Ticket,
  shopping: ShoppingBag,
  other: Package,
};

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

interface Props {
  tripId: string;
  members: TripMember[];
  defaultCurrency: string;
}

export function BudgetTab({ tripId, members, defaultCurrency }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { items, summary, isLoading } = useTripBudget(tripId, defaultCurrency);
  const { deleteBudgetItem } = useBudgetMutations(tripId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { user } = useAuth();

  // Brand-aligned palette (magenta first, then amber, plus a handful of
  // derived hues). No `warning`/`info`/`success` defaults — they clash with
  // the Queer Guide palette.
  const brand = 'hsl(var(--foreground))';
  const categoryColors: Record<string, string> = {
    food: '#F59E0B',
    transport: '#06B6D4',
    accommodation: brand,
    activities: '#10B981',
    shopping: '#8B5CF6',
    other: 'hsl(var(--muted-foreground))',
  };

  const memberName = (userId: string) => {
    const m = members.find((mb) => mb.user_id === userId);
    return m?.profiles?.display_name || t('trips.budget.unknownMember');
  };

  const memberAvatar = (userId: string) => {
    const m = members.find((mb) => mb.user_id === userId);
    return m?.profiles?.avatar_url || undefined;
  };

  const categoryLabel = (cat: string) =>
    t(`trips.budget.category.${cat}`, {
      defaultValue: cat.charAt(0).toUpperCase() + cat.slice(1),
    });

  const handleDelete = (id: string) => {
    deleteBudgetItem.mutate(id, {
      onSuccess: () => toast({ title: t('trips.budget.deleted') }),
      onError: (err) =>
        toast({
          title: t('trips.budget.deleteFailed'),
          description: String(err),
          variant: 'destructive',
        }),
    });
    setDeleteConfirmId(null);
  };

  if (isLoading) return <PageLoadingState count={3} variant="list" />;

  const primaryCurrency = defaultCurrency;
  const chartData = Object.entries(summary.totalByCategory)
    .map(([cat, currencies]) => ({
      name: cat.charAt(0).toUpperCase() + cat.slice(1),
      value: currencies[primaryCurrency] || Object.values(currencies)[0] || 0,
      color: categoryColors[cat] || categoryColors.other,
    }))
    .filter((d) => d.value > 0);

  const itemsByCategory: Record<string, BudgetItem[]> = {};
  for (const item of items) {
    const cat = item.category || 'other';
    if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
    itemsByCategory[cat].push(item);
  }

  if (items.length === 0) {
    return (
      <>
        <div className="text-center py-6 md:py-10 px-3 border-[1.5px] border-dashed border-border rounded-xl">
          <div
            className="w-14 h-14 rounded-lg flex items-center justify-center mx-auto mb-1.5"
            style={{ backgroundColor: `${brand}1a` }}
          >
            <Wallet size={26} style={{ color: brand }} />
          </div>
          <h6 className="font-bold mb-0.5 text-lg">{t('trips.budget.emptyTitle')}</h6>
          <p className="text-sm text-muted-foreground mb-3 max-w-[360px] mx-auto">
            {t('trips.budget.emptyDescription')}
          </p>
          <div className="flex gap-1 justify-center flex-wrap">
            <Button variant="brand" onClick={() => setDialogOpen(true)}>
              <Plus size={16} style={{ marginRight: 6 }} />
              {t('trips.budget.addExpense')}
            </Button>
            <Button variant="outline" onClick={() => setEstimateOpen(true)}>
              <Sparkles size={16} style={{ marginRight: 6 }} />
              {t('trips.budget.estimateCosts', { defaultValue: 'Estimate costs' })}
            </Button>
          </div>
        </div>
        <AddBudgetDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          tripId={tripId}
          members={members}
          defaultCurrency={defaultCurrency}
        />
        <EstimateCostsDialog
          open={estimateOpen}
          onClose={() => setEstimateOpen(false)}
          tripId={tripId}
          members={members}
          currentUserId={user?.id}
        />
      </>
    );
  }

  return (
    <div>
      {/* Summary card */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-1">
            <span className="uppercase tracking-[0.06em] font-bold text-muted-foreground text-[0.7rem]">
              {t('trips.budget.totalSpend')}
            </span>
            <Badge variant="secondary">
              {t('trips.budget.membersCount', { count: members.length })}
            </Badge>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            {Object.keys(summary.totalByCurrency).length > 1 && summary.totalConverted != null ? (
              <>
                <span
                  className="text-[1.5rem] md:text-[1.75rem] font-extrabold tabular-nums"
                >
                  {formatAmount(summary.totalConverted, defaultCurrency)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  ({Object.entries(summary.totalByCurrency)
                    .map(([cur, total]) => formatAmount(total, cur))
                    .join(' + ')})
                </span>
              </>
            ) : (
              Object.entries(summary.totalByCurrency).map(([cur, total]) => (
                <span
                  key={cur}
                  className="text-[1.5rem] md:text-[1.75rem] font-extrabold tabular-nums"
                >
                  {formatAmount(total, cur)}
                </span>
              ))
            )}
          </div>
          <span className="text-xs text-muted-foreground block mt-0.5">
            {t('trips.budget.itemsCount', { count: items.length })}
            {summary.unconvertedCount > 0 &&
              ` · ${t('trips.budget.unconvertedItems', { count: summary.unconvertedCount, defaultValue: '{{count}} item(s) skipped (unknown currency)' })}`}
          </span>
        </CardContent>
      </Card>

      {/* Pie chart */}
      {chartData.length > 0 && (
        <Card className="mt-3">
          <CardContent>
            <span className="uppercase tracking-[0.06em] font-bold text-muted-foreground text-[0.7rem] block mb-1">
              {t('trips.budget.spendingByCategory')}
            </span>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatAmount(value, primaryCurrency)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-[0.375rem] justify-center mt-2">
              {chartData.map((d) => (
                <Badge key={d.name} variant="outline">
                  <span className="inline-flex items-center gap-0.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    {d.name}: {formatAmount(d.value, primaryCurrency)}
                  </span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expenses grouped by category */}
      {Object.entries(itemsByCategory).map(([cat, catItems]) => {
        const Icon = CATEGORY_ICONS[cat] || Package;
        const color = categoryColors[cat] || categoryColors.other;
        const catTotal: Record<string, number> = {};
        for (const item of catItems) {
          catTotal[item.currency] =
            (catTotal[item.currency] || 0) + Number(item.amount);
        }

        return (
          <div key={cat} className="mt-3">
            <div className="flex items-center justify-between mb-[0.3125rem]">
              <div className="flex items-center gap-1">
                <div
                  className="w-7 h-7 rounded-[0.3125rem] flex items-center justify-center"
                  style={{ backgroundColor: `${color}1f` }}
                >
                  <Icon size={14} style={{ color }} />
                </div>
                <span
                  className="font-bold text-sm"
                >
                  {categoryLabel(cat)}
                </span>
              </div>
              <div className="flex gap-1">
                {Object.entries(catTotal).map(([cur, total]) => (
                  <span
                    key={cur}
                    className="text-sm font-bold text-muted-foreground tabular-nums"
                  >
                    {formatAmount(total, cur)}
                  </span>
                ))}
              </div>
            </div>

            {catItems.map((item) => (
              <Card key={item.id} className="mb-1">
                <CardContent>
                  <div className="flex items-center gap-[0.3125rem]">
                    <Avatar className="w-8 h-8 text-[13px]">
                      {memberAvatar(item.paid_by) && (
                        <AvatarImage src={memberAvatar(item.paid_by)} />
                      )}
                      <AvatarFallback>{memberName(item.paid_by)[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{item.title}</p>
                      <div className="flex items-center gap-1 flex-wrap text-muted-foreground">
                        {item.date && <span className="text-xs">{item.date}</span>}
                        <span className="text-xs">
                          {t('trips.budget.paidBy', { name: memberName(item.paid_by) })}
                        </span>
                        {item.split_among.length > 1 && (
                          <Badge variant="outline">
                            {t('trips.budget.splitWays', { count: item.split_among.length })}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-bold tabular-nums">
                      {formatAmount(Number(item.amount), item.currency)}
                    </span>
                    <Button
                      variant="ghost"
                      className="h-7 w-7 p-0 opacity-45 hover:opacity-100 hover:text-destructive transition-[opacity,color] duration-150"
                      onClick={() => setDeleteConfirmId(item.id)}
                      aria-label={t('trips.budget.deleteAria')}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })}

      {/* Settlements */}
      {Object.keys(summary.perPersonBalance).length > 0 && (
        <div className="mt-4">
          <div className="border-t border-border mb-2" />
          <span className="uppercase tracking-[0.06em] font-bold text-muted-foreground text-[0.7rem] block mb-1">
            {t('trips.budget.settlements')}
          </span>
          {Object.entries(summary.perPersonBalance).map(([cur, settlements]) =>
            settlements.map((s, i) => (
              <Card key={`${cur}-${i}`} className="mb-1">
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-6 h-6 text-[11px]">
                      {memberAvatar(s.from) && <AvatarImage src={memberAvatar(s.from)} />}
                      <AvatarFallback>{memberName(s.from)[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{memberName(s.from)}</span>
                    <ArrowRight size={14} className="text-muted-foreground" />
                    <Avatar className="w-6 h-6 text-[11px]">
                      {memberAvatar(s.to) && <AvatarImage src={memberAvatar(s.to)} />}
                      <AvatarFallback>{memberName(s.to)[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{memberName(s.to)}</span>
                    <span className="text-sm font-bold ml-auto">
                      {formatAmount(s.amount, cur)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )),
          )}
        </div>
      )}

      {/* FABs */}
      <Button
        variant="outline"
        className="fixed bottom-[84px] right-7 h-10 w-10 p-0 rounded-full bg-background border-border shadow-md"
        onClick={() => setEstimateOpen(true)}
        aria-label={t('trips.budget.estimateCosts', { defaultValue: 'Estimate costs' })}
      >
        <Sparkles size={18} />
      </Button>
      <Button
        className="fixed bottom-6 right-6 h-14 w-14 p-0 rounded-full text-white shadow-lg hover:opacity-90"
        style={{ backgroundColor: brand }}
        onClick={() => setDialogOpen(true)}
      >
        <Plus size={22} />
      </Button>

      <AddBudgetDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        tripId={tripId}
        members={members}
        defaultCurrency={defaultCurrency}
      />

      <EstimateCostsDialog
        open={estimateOpen}
        onClose={() => setEstimateOpen(false)}
        tripId={tripId}
        members={members}
        currentUserId={user?.id}
      />

      <CostSplitSummary
        tripId={tripId}
        members={members}
        defaultCurrency={defaultCurrency}
      />

      <div className="mt-4">
        <Button variant="outline" size="sm" onClick={() => setBundleOpen(true)}>
          <Wallet style={{ width: 14, height: 14, marginRight: 6 }} />
          Bundle bookings
        </Button>
      </div>

      <BookingActivitySection tripId={tripId} />

      <BundledCheckoutDialog
        open={bundleOpen}
        onOpenChange={setBundleOpen}
        tripId={tripId}
      />

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.budget.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('trips.budget.deleteConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              {t('trips.card.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              {t('trips.card.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
