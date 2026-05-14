import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { useCreateCheckoutSession } from '@/hooks/useDonations';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useCurrency';
import { getCurrencySymbol } from '@/lib/currency';
import { toast } from 'sonner';
import { hapticTrigger } from '@/hooks/useHaptics';

const TIP_AMOUNTS = [300, 500, 1000, 2500]; // cents
const FREQUENCY_OPTIONS = ['one_time', 'month', 'year'] as const;

export function DonationForm() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currency, formatPriceCents } = useCurrency();
  const checkout = useCreateCheckoutSession();

  const [selectedTip, setSelectedTip] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [frequency, setFrequency] = useState<(typeof FREQUENCY_OPTIONS)[number]>('one_time');
  const [email, setEmail] = useState(user?.email || '');
  const [donorName, setDonorName] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const amountCents = selectedTip ?? Math.round(parseFloat(customAmount || '0') * 100);
  const isValid = amountCents >= 100 && email.includes('@');

  const handleTipSelect = (amount: number) => {
    hapticTrigger('nudge');
    setSelectedTip(amount);
    setCustomAmount('');
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    setSelectedTip(null);
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    hapticTrigger('success');

    try {
      const url = await checkout.mutateAsync({
        amount: amountCents,
        currency: currency.toLowerCase(),
        donation_type: frequency === 'one_time' ? 'one_time' : 'recurring',
        interval: frequency !== 'one_time' ? frequency : undefined,
        donor_name: donorName || undefined,
        email,
        message: message || undefined,
        is_anonymous: isAnonymous,
      });
      window.location.href = url;
    } catch {
      toast.error(t('donate.error', 'Something went wrong. Please try again.'));
    }
  };

  const fmt = (cents: number) => formatPriceCents(cents);

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        {/* Amount selection */}
        <div>
          <p className="font-semibold text-sm mb-3">
            {t('donate.tipJar', 'Quick amounts')}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {TIP_AMOUNTS.map((amount) => (
              <Button
                key={amount}
                variant={selectedTip === amount ? 'default' : 'outline'}
                onClick={() => handleTipSelect(amount)}
                style={{ height: 44, fontSize: '1rem', fontWeight: 600 }}
              >
                {fmt(amount)}
              </Button>
            ))}
          </div>
        </div>

        {/* Custom amount */}
        <div>
          <Label htmlFor="custom-amount">
            {t('donate.customAmount', 'Custom amount')} ({currency})
          </Label>
          <div className="relative mt-1">
            <div
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none z-10"
            >
              {getCurrencySymbol(currency)}
            </div>
            <Input
              id="custom-amount"
              type="number"
              min="1"
              step="1"
              placeholder="50"
              value={customAmount}
              onChange={(e) => handleCustomAmountChange(e.target.value)}
              style={{ paddingLeft: 28 }}
            />
          </div>
        </div>

        {/* Frequency */}
        <div>
          <p className="font-semibold text-sm mb-3">
            {t('donate.frequency', 'Frequency')}
          </p>
          <div className="grid grid-cols-3 gap-2 p-1 rounded-[10px] bg-muted">
            {FREQUENCY_OPTIONS.map((opt) => (
              <Button
                key={opt}
                variant={frequency === opt ? 'default' : 'ghost'}
                size="sm"
                style={{ height: 36 }}
                onClick={() => setFrequency(opt)}
              >
                {t(
                  `donate.${opt}`,
                  opt === 'one_time' ? 'One-time' : opt === 'month' ? 'Monthly' : 'Yearly',
                )}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Donor info */}
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="donor-email">
              {t('donate.email', 'Email')} *
            </Label>
            <Input
              id="donor-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="donor-name">{t('donate.name', 'Name (optional)')}</Label>
            <Input
              id="donor-name"
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              placeholder={t('donate.namePlaceholder', 'How you want to appear on the donor wall')}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="donor-message">
              {t('donate.message', 'Message (optional)')}
            </Label>
            <Input
              id="donor-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('donate.messagePlaceholder', 'Leave a message of support')}
              className="mt-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="anonymous"
              checked={isAnonymous}
              onCheckedChange={setIsAnonymous}
            />
            <Label htmlFor="anonymous" className="cursor-pointer">
              {t('donate.anonymous', 'Donate anonymously')}
            </Label>
          </div>
        </div>

        {/* Submit */}
        <Button
          style={{ width: '100%', height: 48, fontSize: '1rem', fontWeight: 600 }}
          disabled={!isValid || checkout.isPending}
          onClick={handleSubmit}
        >
          {checkout.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Heart className="h-4 w-4 mr-2" />
          )}
          {isValid
            ? t('donate.cta', 'Donate {{amount}}', { amount: fmt(amountCents) })
            : t('donate.ctaDisabled', 'Enter an amount')}
        </Button>
      </CardContent>
    </Card>
  );
}
