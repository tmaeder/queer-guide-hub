import { useState } from 'react';
import { useNavigate } from 'react-router';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations } from '@/hooks/useTrips';

const currencies = [
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'CHF', label: 'CHF - Swiss Franc' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
  { value: 'THB', label: 'THB - Thai Baht' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateTripDialog({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { createTrip } = useTripMutations();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('EUR');

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setCurrency('EUR');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) handleClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const trip = await createTrip.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        currency,
      });
      toast({ title: 'Trip created!', description: 'Start adding destinations.' });
      handleClose();
      navigate(`/trips/${trip.id}`);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to create trip.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Trip</DialogTitle>
            <DialogDescription>
              Plan a new adventure. You can add destinations and safety info later.
            </DialogDescription>
          </DialogHeader>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 3 }}>
            <TextField
              label="Trip Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              fullWidth
              autoFocus
              placeholder="e.g. Pride Week Berlin 2026"
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
              placeholder="What's this trip about?"
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="End Date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: startDate || undefined }}
                fullWidth
              />
            </Box>
            <TextField
              label="Currency"
              select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              fullWidth
            >
              {currencies.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || createTrip.isPending}
            >
              {createTrip.isPending && (
                <CircularProgress size={16} sx={{ mr: 1, color: 'inherit' }} />
              )}
              Create Trip
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
