import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet } from '@/components/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listFrom } from '@/hooks/usePageFetchers';
import { useCurrency } from '@/hooks/useCurrency';

interface CurrencyRow {
  code: string;
  symbol: string | null;
}

export function CurrencySelector() {
  const { currency, setCurrency } = useCurrency();
  const { t } = useTranslation();
  const [optionsReady, setOptionsReady] = useState(false);

  const { data: currencies = [] } = useQuery({
    queryKey: ['currencies-list'],
    queryFn: () =>
      listFrom<CurrencyRow>('currencies', 'code, symbol', { col: 'code' }).catch(() => []),
    staleTime: Infinity,
  });

  if (!currencies.length) return null;

  return (
    <Select
      value={currency}
      onValueChange={setCurrency}
      onOpenChange={(open) => {
        if (open) setOptionsReady(true);
      }}
    >
      <SelectTrigger
        onFocus={() => setOptionsReady(true)}
        onPointerEnter={() => setOptionsReady(true)}
        aria-label={t('i18n.selectCurrency', 'Select currency')}
        // See LanguageSwitcher: `height: 36` is declared intent, and the base
        // 44px min-height in index.css is what actually renders.
        style={{
          width: 'auto',
          minWidth: 0,
          height: 36,
          padding: '0 8px',
          border: 'none',
          background: 'transparent',
        }}
        className="gap-1"
      >
        <Wallet size={16} className="shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* Keep the selected item registered for its label/native value. The
            unopened Radix collection otherwise mounts every option on every
            page. Focus primes all items before closed-menu keyboard typeahead;
            opening or pointer entry primes the same complete collection. */}
        {currencies
          .filter((c) => optionsReady || c.code === currency)
          .map((c) => (
            <SelectItem key={c.code} value={c.code}>
              <span className="text-13">
                {c.code}
                {c.symbol && c.symbol !== c.code ? ` (${c.symbol})` : ''}
              </span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
