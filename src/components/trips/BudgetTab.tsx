import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Fab from '@mui/material/Fab';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import { Plus, Trash2, ArrowRight, Utensils, Car, Home, Ticket, ShoppingBag, Package, Wallet } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useToast } from '@/hooks/use-toast';
import { useTripBudget, useBudgetMutations, type BudgetItem } from '@/hooks/useTripBudget';
import type { TripMember } from '@/hooks/useTrips';
import { AddBudgetDialog } from './AddBudgetDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
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
  const theme = useTheme();
  const { toast } = useToast();
  const { items, summary, isLoading } = useTripBudget(tripId);
  const { deleteBudgetItem } = useBudgetMutations(tripId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const categoryColors: Record<string, string> = {
    food: theme.palette.warning?.main || '#f59e0b',
    transport: theme.palette.info?.main || theme.palette.primary.main,
    accommodation: theme.palette.brand?.main || '#DB2777',
    activities: theme.palette.success?.main || '#10b981',
    shopping: theme.palette.error?.main || '#ef4444',
    other: theme.palette.text.secondary,
  };

  const memberName = (userId: string) => {
    const m = members.find((mb) => mb.user_id === userId);
    return m?.profiles?.display_name || 'Unknown';
  };

  const memberAvatar = (userId: string) => {
    const m = members.find((mb) => mb.user_id === userId);
    return m?.profiles?.avatar_url || undefined;
  };

  const handleDelete = (id: string) => {
    deleteBudgetItem.mutate(id, {
      onSuccess: () => toast({ title: 'Expense deleted' }),
      onError: (err) => toast({ title: 'Failed to delete expense', description: String(err), variant: 'destructive' }),
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
        <ScrollReveal>
          <Box className="flex flex-col items-center justify-center py-16 text-center">
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <Wallet size={28} style={{ color: theme.palette.text.secondary }} />
            </Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              No expenses yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 280 }}>
              Track spending and split costs with your group
            </Typography>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus size={16} />
              Add Expense
            </Button>
          </Box>
        </ScrollReveal>
        <AddBudgetDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          tripId={tripId}
          members={members}
          defaultCurrency={defaultCurrency}
        />
      </>
    );
  }

  return (
    <div>
      {/* Summary card */}
      <Card>
        <CardContent>
          <Box className="flex items-center justify-between mb-1">
            <Typography variant="subtitle2" color="text.secondary">
              Total Spend
            </Typography>
            <Badge variant="secondary">{members.length} members</Badge>
          </Box>
          <Box className="flex items-center gap-4 flex-wrap">
            {Object.entries(summary.totalByCurrency).map(([cur, total]) => (
              <Typography key={cur} variant="h5" fontWeight={700}>
                {formatAmount(total, cur)}
              </Typography>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Pie chart */}
      {chartData.length > 0 && (
        <Card className="mt-3">
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Spending by Category
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
            <Box className="flex flex-wrap gap-2 justify-center mt-2">
              {chartData.map((d) => (
                <Badge key={d.name} variant="outline">
                  <Box
                    component="span"
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: d.color,
                      display: 'inline-block',
                      mr: 0.5,
                    }}
                  />
                  {d.name}: {formatAmount(d.value, primaryCurrency)}
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
          catTotal[item.currency] = (catTotal[item.currency] || 0) + Number(item.amount);
        }

        return (
          <Box key={cat} sx={{ mt: 3 }}>
            <Box className="flex items-center justify-between mb-1.5">
              <Box className="flex items-center gap-2">
                <Box
                  className="rounded-full flex items-center justify-center"
                  sx={{ width: 28, height: 28, bgcolor: `${color}20` }}
                >
                  <Icon size={14} style={{ color }} />
                </Box>
                <Typography variant="subtitle2" fontWeight={600}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Typography>
              </Box>
              <Box className="flex gap-2">
                {Object.entries(catTotal).map(([cur, total]) => (
                  <Typography key={cur} variant="body2" fontWeight={600} color="text.secondary">
                    {formatAmount(total, cur)}
                  </Typography>
                ))}
              </Box>
            </Box>

            {catItems.map((item) => (
              <Card key={item.id} className="mb-1">
                <CardContent>
                  <Box className="flex items-center gap-2">
                    <Avatar
                      src={memberAvatar(item.paid_by)}
                      sx={{ width: 28, height: 28, fontSize: 12 }}
                    >
                      {memberName(item.paid_by)[0]?.toUpperCase()}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {item.title}
                      </Typography>
                      <Box className="flex items-center gap-2">
                        {item.date && (
                          <Typography variant="caption" color="text.secondary">
                            {item.date}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary">
                          Paid by {memberName(item.paid_by)}
                        </Typography>
                        {item.split_among.length > 1 && (
                          <Badge variant="outline">split {item.split_among.length} ways</Badge>
                        )}
                      </Box>
                    </div>
                    <Typography variant="body2" fontWeight={700}>
                      {formatAmount(Number(item.amount), item.currency)}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => setDeleteConfirmId(item.id)}
                      sx={{ opacity: 0.5, '&:hover': { opacity: 1 }, minWidth: 44, minHeight: 44 }}
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
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Settlements
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

      {/* FAB */}
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

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Expense</DialogTitle>
          </DialogHeader>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Are you sure you want to delete this expense? This cannot be undone.
          </Typography>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
