import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
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
  const { t } = useTranslation();
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
      toast({ title: t('trips.budget.expenseAdded', 'Expense added') });
      resetAndClose();
    } catch (err) {
      toast({
        title: t('trips.budget.addFailed', 'Failed to add expense'),
        description: String(err),
        variant: 'destructive',
      });
    }
  };

  const canSubmit =
    title.trim().length > 0 && parseFloat(amount) > 0 && paidBy && splitAmong.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('trips.budget.addExpense', 'Add Expense')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2.5 mt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="budget-title">{t('trips.budget.titleLabel', 'Title')}</Label>
            <Input
              id="budget-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('trips.budget.titlePlaceholder', 'e.g. Dinner at Rainbow Cafe')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="budget-amount">{t('trips.budget.amount', 'Amount')}</Label>
              <Input
                id="budget-amount"
                required
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="budget-currency">{t('trips.budget.currency', 'Currency')}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="budget-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="budget-category">{t('trips.budget.category', 'Category')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="budget-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`trips.budget.categories.${c}`, c.charAt(0).toUpperCase() + c.slice(1))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="budget-date">{t('trips.budget.date', 'Date')}</Label>
              <Input
                id="budget-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="budget-paid-by">{t('trips.budget.paidBy', 'Paid by')}</Label>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger id="budget-paid-by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => {
                  const initial = (m.profiles?.display_name || 'U')[0].toUpperCase();
                  return (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      <span className="flex items-center gap-2">
                        <Avatar className="h-5 w-5 text-[11px]">
                          {m.profiles?.avatar_url && (
                            <AvatarImage src={m.profiles.avatar_url} alt="" />
                          )}
                          <AvatarFallback className="text-[11px]">{initial}</AvatarFallback>
                        </Avatar>
                        {m.profiles?.display_name || t('common.unknown', 'Unknown')}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="text-xs text-muted-foreground font-semibold mb-2">
              {t('trips.budget.splitAmong', 'Split among')}
            </p>
            <div className="flex flex-wrap gap-1">
              {members.map((m) => {
                const selected = splitAmong.includes(m.user_id);
                const initial = (m.profiles?.display_name || 'U')[0].toUpperCase();
                return (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => toggleSplitMember(m.user_id)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-sm min-h-[44px] cursor-pointer transition-colors',
                      selected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-muted',
                    )}
                  >
                    <Avatar className="h-6 w-6">
                      {m.profiles?.avatar_url && (
                        <AvatarImage src={m.profiles.avatar_url} alt="" />
                      )}
                      <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                    </Avatar>
                    {m.profiles?.display_name || 'Unknown'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={resetAndClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || addBudgetItem.isPending}>
            {addBudgetItem.isPending && (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-label="Loading" />
            )}
            {t('trips.budget.addExpense', 'Add Expense')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
