import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import CircularProgress from '@mui/material/CircularProgress';
import type { TripMember } from '@/hooks/useTrips';
import { useBudgetMutations } from '@/hooks/useTripBudget';

const CATEGORIES = ['food', 'transport', 'accommodation', 'activities', 'shopping', 'other'] as const;
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'THB', 'MXN', 'BRL'];

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  members: TripMember[];
  defaultCurrency?: string;
}

export function AddBudgetDialog({ open, onClose, tripId, members, defaultCurrency = 'EUR' }: Props) {
  const { addBudgetItem } = useBudgetMutations(tripId);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [category, setCategory] = useState<string>('other');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = useState(members[0]?.user_id || '');
  const [splitAmong, setSplitAmong] = useState<string[]>(members.map((m) => m.user_id));

  const resetAndClose = () => {
    setTitle('');
    setAmount('');
    setCurrency(defaultCurrency);
    setCategory('other');
    setDate(new Date().toISOString().slice(0, 10));
    setPaidBy(members[0]?.user_id || '');
    setSplitAmong(members.map((m) => m.user_id));
    onClose();
  };

  const toggleSplitMember = (userId: string) => {
    setSplitAmong((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const memberName = (userId: string) => {
    const m = members.find((m) => m.user_id === userId);
    return m?.profiles?.display_name || 'Unknown';
  };

  const handleSubmit = async () => {
    if (!title.trim() || !amount || !paidBy || splitAmong.length === 0) return;
    await addBudgetItem.mutateAsync({
      trip_id: tripId,
      title: title.trim(),
      amount: parseFloat(amount),
      currency,
      category,
      date: date || null,
      paid_by: paidBy,
      split_among: splitAmong,
      place_id: null,
      receipt_url: null,
    });
    resetAndClose();
  };

  const canSubmit = title.trim().length > 0 && parseFloat(amount) > 0 && paidBy && splitAmong.length > 0;

  return (
    <Dialog open={open} onClose={resetAndClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Expense</DialogTitle>
      <DialogContent>
        <Box className="flex flex-col gap-3 pt-1">
          <TextField
            label="Title"
            required
            fullWidth
            size="small"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Dinner at Rainbow Cafe"
          />

          <Box className="grid grid-cols-2 gap-3">
            <TextField
              label="Amount"
              required
              type="number"
              fullWidth
              size="small"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputProps={{ min: 0, step: '0.01' }}
            />
            <TextField
              label="Currency"
              select
              fullWidth
              size="small"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </TextField>
          </Box>

          <Box className="grid grid-cols-2 gap-3">
            <TextField
              label="Category"
              select
              fullWidth
              size="small"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Date"
              type="date"
              fullWidth
              size="small"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>

          <TextField
            label="Paid by"
            select
            required
            fullWidth
            size="small"
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
          >
            {members.map((m) => (
              <MenuItem key={m.user_id} value={m.user_id}>
                <Box className="flex items-center gap-2">
                  <Avatar
                    src={m.profiles?.avatar_url || undefined}
                    sx={{ width: 20, height: 20, fontSize: 11 }}
                  >
                    {(m.profiles?.display_name || 'U')[0].toUpperCase()}
                  </Avatar>
                  {m.profiles?.display_name || 'Unknown'}
                </Box>
              </MenuItem>
            ))}
          </TextField>

          <div>
            <Box className="text-sm font-medium text-muted-foreground mb-1.5">Split among</Box>
            <Box className="flex flex-wrap gap-1">
              {members.map((m) => {
                const selected = splitAmong.includes(m.user_id);
                return (
                  <Chip
                    key={m.user_id}
                    label={m.profiles?.display_name || 'Unknown'}
                    avatar={
                      <Avatar src={m.profiles?.avatar_url || undefined} sx={{ width: 24, height: 24 }}>
                        {(m.profiles?.display_name || 'U')[0].toUpperCase()}
                      </Avatar>
                    }
                    variant={selected ? 'filled' : 'outlined'}
                    color={selected ? 'primary' : 'default'}
                    onClick={() => toggleSplitMember(m.user_id)}
                    sx={{ cursor: 'pointer' }}
                  />
                );
              })}
            </Box>
          </div>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={resetAndClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit || addBudgetItem.isPending}
          startIcon={addBudgetItem.isPending ? <CircularProgress size={16} /> : undefined}
        >
          Add Expense
        </Button>
      </DialogActions>
    </Dialog>
  );
}
