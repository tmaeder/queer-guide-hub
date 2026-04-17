import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Avatar from '@mui/material/Avatar';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useBudgetMutations } from '@/hooks/useTripBudget';
import type { TripMember } from '@/hooks/useTrips';

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
  const { toast } = useToast();
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
  const handleSubmit = async () => {
    if (!title.trim() || !amount || !paidBy || splitAmong.length === 0) return;
    try {
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
      toast({ title: 'Expense added' });
      resetAndClose();
    } catch (err) {
      toast({ title: 'Failed to add expense', description: String(err), variant: 'destructive' });
    }
  };

  const canSubmit = title.trim().length > 0 && parseFloat(amount) > 0 && paidBy && splitAmong.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>

        <Box className="flex flex-col gap-2.5 mt-2">
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
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
              Split among
            </Typography>
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
                    sx={{ cursor: 'pointer', minHeight: 44 }}
                  />
                );
              })}
            </Box>
          </div>
        </Box>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || addBudgetItem.isPending}
          >
            {addBudgetItem.isPending && <CircularProgress size={16} sx={{ mr: 1 }} />}
            Add Expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
