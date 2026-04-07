import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Fab from '@mui/material/Fab';
import Skeleton from '@mui/material/Skeleton';
import Divider from '@mui/material/Divider';
import { Plus, Trash2, ArrowRight, Utensils, Car, Home, Ticket, ShoppingBag, Package } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTripBudget, useBudgetMutations, type BudgetItem } from '@/hooks/useTripBudget';
import type { TripMember } from '@/hooks/useTrips';
import { AddBudgetDialog } from './AddBudgetDialog';

const CATEGORY_COLORS: Record<string, string> = {
  food: '#f97316',
  transport: '#3b82f6',
  accommodation: '#8b5cf6',
  activities: '#10b981',
  shopping: '#ec4899',
  other: '#6b7280',
};

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
  const { items, summary, isLoading } = useTripBudget(tripId);
  const { deleteBudgetItem } = useBudgetMutations(tripId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const memberName = (userId: string) => {
    const m = members.find((m) => m.user_id === userId);
    return m?.profiles?.display_name || 'Unknown';
  };

  const memberAvatar = (userId: string) => {
    const m = members.find((m) => m.user_id === userId);
    return m?.profiles?.avatar_url || undefined;
  };

  if (isLoading) {
    return (
      <Box className="space-y-3">
        <Skeleton variant="rounded" height={80} />
        <Skeleton variant="rounded" height={200} />
      </Box>
    );
  }

  // Build chart data from the primary currency
  const primaryCurrency = defaultCurrency;
  const chartData = Object.entries(summary.totalByCategory).map(([cat, currencies]) => ({
    name: cat.charAt(0).toUpperCase() + cat.slice(1),
    value: currencies[primaryCurrency] || Object.values(currencies)[0] || 0,
    color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.other,
  })).filter((d) => d.value > 0);

  // Group items by category
  const itemsByCategory: Record<string, BudgetItem[]> = {};
  for (const item of items) {
    const cat = item.category || 'other';
    if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
    itemsByCategory[cat].push(item);
  }

  return (
    <div>
      {/* Total spend summary */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Total Spend
          </Typography>
          <Box className="flex items-center gap-4 flex-wrap">
            {Object.entries(summary.totalByCurrency).map(([cur, total]) => (
              <Typography key={cur} variant="h5" fontWeight={700}>
                {formatAmount(total, cur)}
              </Typography>
            ))}
            {Object.keys(summary.totalByCurrency).length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No expenses yet
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Donut chart */}
      {chartData.length > 0 && (
        <Card variant="outlined" sx={{ mb: 3 }}>
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
                  <Tooltip
                    formatter={(value: number) => formatAmount(value, primaryCurrency)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
            <Box className="flex flex-wrap gap-2 justify-center mt-2">
              {chartData.map((d) => (
                <Chip
                  key={d.name}
                  label={`${d.name}: ${formatAmount(d.value, primaryCurrency)}`}
                  size="small"
                  sx={{
                    bgcolor: d.color + '20',
                    color: d.color,
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Expenses grouped by category */}
      {Object.entries(itemsByCategory).map(([cat, catItems]) => {
        const Icon = CATEGORY_ICONS[cat] || Package;
        const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
        const catTotal: Record<string, number> = {};
        for (const item of catItems) {
          catTotal[item.currency] = (catTotal[item.currency] || 0) + Number(item.amount);
        }

        return (
          <Box key={cat} sx={{ mb: 3 }}>
            <Box className="flex items-center justify-between mb-1.5">
              <Box className="flex items-center gap-2">
                <Box
                  className="rounded-full flex items-center justify-center"
                  sx={{ width: 28, height: 28, bgcolor: color + '20' }}
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
              <Card key={item.id} variant="outlined" sx={{ mb: 1 }}>
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Box className="flex items-center gap-2">
                    <Avatar
                      src={memberAvatar(item.paid_by)}
                      sx={{ width: 28, height: 28, fontSize: 12 }}
                    >
                      {memberName(item.paid_by)[0].toUpperCase()}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {item.title}
                      </Typography>
                      <Box className="flex items-center gap-2 text-xs text-muted-foreground">
                        {item.date && <span>{item.date}</span>}
                        <span>Paid by {memberName(item.paid_by)}</span>
                        {item.split_among.length > 1 && (
                          <span>-- split {item.split_among.length} ways</span>
                        )}
                      </Box>
                    </div>
                    <Typography variant="body2" fontWeight={700}>
                      {formatAmount(Number(item.amount), item.currency)}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => deleteBudgetItem.mutate(item.id)}
                      sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
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

      {items.length === 0 && (
        <Box className="text-center py-12">
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            No expenses tracked yet.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Tap the + button to add your first expense.
          </Typography>
        </Box>
      )}

      {/* Settlement section */}
      {Object.keys(summary.perPersonBalance).length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Settlements
          </Typography>
          {Object.entries(summary.perPersonBalance).map(([cur, settlements]) =>
            settlements.map((s, i) => (
              <Card key={`${cur}-${i}`} variant="outlined" sx={{ mb: 1 }}>
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Box className="flex items-center gap-2">
                    <Avatar
                      src={memberAvatar(s.from)}
                      sx={{ width: 24, height: 24, fontSize: 11 }}
                    >
                      {memberName(s.from)[0].toUpperCase()}
                    </Avatar>
                    <Typography variant="body2">
                      {memberName(s.from)}
                    </Typography>
                    <ArrowRight size={14} className="text-muted-foreground" />
                    <Avatar
                      src={memberAvatar(s.to)}
                      sx={{ width: 24, height: 24, fontSize: 11 }}
                    >
                      {memberName(s.to)[0].toUpperCase()}
                    </Avatar>
                    <Typography variant="body2">
                      {memberName(s.to)}
                    </Typography>
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
        color="primary"
        size="medium"
        onClick={() => setDialogOpen(true)}
        sx={{ position: 'fixed', bottom: 24, right: 24 }}
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
    </div>
  );
}
