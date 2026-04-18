import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Fab from '@mui/material/Fab';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import { Plus, Trash2, ArrowRight, Utensils, Car, Home, Ticket, ShoppingBag, Package, Wallet, Sparkles } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  const theme = useTheme();
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
  const categoryColors: Record<string, string> = {
    food: '#F59E0B', // amber
    transport: '#06B6D4', // cyan
    accommodation: theme.palette.brand?.main || '#DB2777', // brand magenta
    activities: '#10B981', // emerald
    shopping: '#8B5CF6', // violet
    other: theme.palette.text.secondary as string,
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
    const brand = theme.palette.brand?.main || '#DB2777';
    return (
      <>
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 6, md: 10 },
            px: 3,
            border: '1.5px dashed',
            borderColor: 'divider',
            borderRadius: 3,
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 2,
              bgcolor: `${brand}1a`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 1.5,
            }}
          >
            <Wallet size={26} style={{ color: brand }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('trips.budget.emptyTitle')}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: 360, mx: 'auto' }}
          >
            {t('trips.budget.emptyDescription')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="brand" onClick={() => setDialogOpen(true)}>
              <Plus size={16} style={{ marginRight: 6 }} />
              {t('trips.budget.addExpense')}
            </Button>
            <Button variant="outline" onClick={() => setEstimateOpen(true)}>
              <Sparkles size={16} style={{ marginRight: 6 }} />
              {t('trips.budget.estimateCosts', { defaultValue: 'Estimate costs' })}
            </Button>
          </Box>
        </Box>
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
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 700,
                color: 'text.secondary',
                fontSize: '0.7rem',
              }}
            >
              {t('trips.budget.totalSpend')}
            </Typography>
            <Badge variant="secondary">
              {t('trips.budget.membersCount', { count: members.length })}
            </Badge>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 3,
              flexWrap: 'wrap',
            }}
          >
            {Object.keys(summary.totalByCurrency).length > 1 && summary.totalConverted != null ? (
              <>
                <Typography
                  sx={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: { xs: '1.5rem', md: '1.75rem' },
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatAmount(summary.totalConverted, defaultCurrency)}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  ({Object.entries(summary.totalByCurrency)
                    .map(([cur, total]) => formatAmount(total, cur))
                    .join(' + ')})
                </Typography>
              </>
            ) : (
              Object.entries(summary.totalByCurrency).map(([cur, total]) => (
                <Typography
                  key={cur}
                  sx={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: { xs: '1.5rem', md: '1.75rem' },
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatAmount(total, cur)}
                </Typography>
              ))
            )}
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 0.5 }}
          >
            {t('trips.budget.itemsCount', { count: items.length })}
            {summary.unconvertedCount > 0 &&
              ` · ${t('trips.budget.unconvertedItems', { count: summary.unconvertedCount, defaultValue: '{{count}} item(s) skipped (unknown currency)' })}`}
          </Typography>
        </CardContent>
      </Card>

      {/* Pie chart */}
      {chartData.length > 0 && (
        <Card className="mt-3">
          <CardContent>
            <Typography
              variant="caption"
              sx={{
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 700,
                color: 'text.secondary',
                fontSize: '0.7rem',
                display: 'block',
                mb: 1,
              }}
            >
              {t('trips.budget.spendingByCategory')}
            </Typography>
            <Box sx={{ height: 200 }}>
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
            </Box>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.75,
                justifyContent: 'center',
                mt: 2,
              }}
            >
              {chartData.map((d) => (
                <Badge key={d.name} variant="outline">
                  <Box
                    component="span"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                  >
                    <Box
                      component="span"
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: d.color,
                      }}
                    />
                    {d.name}: {formatAmount(d.value, primaryCurrency)}
                  </Box>
                </Badge>
              ))}
            </Box>
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
          <Box key={cat} sx={{ mt: 3 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1.25,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1.25,
                    bgcolor: `${color}1f`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={14} style={{ color }} />
                </Box>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  {categoryLabel(cat)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {Object.entries(catTotal).map(([cur, total]) => (
                  <Typography
                    key={cur}
                    variant="body2"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatAmount(total, cur)}
                  </Typography>
                ))}
              </Box>
            </Box>

            {catItems.map((item) => (
              <Card key={item.id} className="mb-1">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Avatar
                      src={memberAvatar(item.paid_by)}
                      sx={{ width: 32, height: 32, fontSize: 13 }}
                    >
                      {memberName(item.paid_by)[0]?.toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {item.title}
                      </Typography>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          flexWrap: 'wrap',
                          color: 'text.secondary',
                        }}
                      >
                        {item.date && (
                          <Typography variant="caption">{item.date}</Typography>
                        )}
                        <Typography variant="caption">
                          {t('trips.budget.paidBy', {
                            name: memberName(item.paid_by),
                          })}
                        </Typography>
                        {item.split_among.length > 1 && (
                          <Badge variant="outline">
                            {t('trips.budget.splitWays', {
                              count: item.split_among.length,
                            })}
                          </Badge>
                        )}
                      </Box>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatAmount(Number(item.amount), item.currency)}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => setDeleteConfirmId(item.id)}
                      aria-label={t('trips.budget.deleteAria')}
                      sx={{
                        opacity: 0.45,
                        '&:hover': { opacity: 1, color: 'error.main' },
                        transition: 'opacity 0.15s, color 0.15s',
                      }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        );
      })}

      {/* Settlements */}
      {Object.keys(summary.perPersonBalance).length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Divider sx={{ mb: 2 }} />
          <Typography
            variant="caption"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 700,
              color: 'text.secondary',
              fontSize: '0.7rem',
              display: 'block',
              mb: 1,
            }}
          >
            {t('trips.budget.settlements')}
          </Typography>
          {Object.entries(summary.perPersonBalance).map(([cur, settlements]) =>
            settlements.map((s, i) => (
              <Card key={`${cur}-${i}`} className="mb-1">
                <CardContent>
                  <Box className="flex items-center gap-2">
                    <Avatar
                      src={memberAvatar(s.from)}
                      sx={{ width: 24, height: 24, fontSize: 11 }}
                    >
                      {memberName(s.from)[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="body2">{memberName(s.from)}</Typography>
                    <ArrowRight size={14} style={{ color: theme.palette.text.secondary }} />
                    <Avatar
                      src={memberAvatar(s.to)}
                      sx={{ width: 24, height: 24, fontSize: 11 }}
                    >
                      {memberName(s.to)[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="body2">{memberName(s.to)}</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ ml: 'auto' }}>
                      {formatAmount(s.amount, cur)}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            )),
          )}
        </Box>
      )}

      {/* FABs */}
      <Fab
        size="small"
        onClick={() => setEstimateOpen(true)}
        sx={{
          position: 'fixed',
          bottom: 84,
          right: 28,
          bgcolor: 'background.paper',
          color: 'text.primary',
          border: '1px solid',
          borderColor: 'divider',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        aria-label={t('trips.budget.estimateCosts', { defaultValue: 'Estimate costs' })}
      >
        <Sparkles size={18} />
      </Fab>
      <Fab
        size="medium"
        onClick={() => setDialogOpen(true)}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          bgcolor: 'brand.main',
          color: 'white',
          '&:hover': { bgcolor: 'brand.dark' },
        }}
      >
        <Plus size={22} />
      </Fab>

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

      <Box sx={{ mt: 4 }}>
        <Button variant="outline" size="sm" onClick={() => setBundleOpen(true)}>
          <Wallet style={{ width: 14, height: 14, marginRight: 6 }} />
          Bundle bookings
        </Button>
      </Box>

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
