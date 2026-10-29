import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Wallet, ChevronDown } from '@/components/icons';

import { listFrom } from '@/hooks/usePageFetchers';
import { useCurrency } from '@/hooks/useCurrency';

interface CurrencyRow {
  code: string;
  symbol: string | null;
}

export function CurrencySelector() {
  const { currency, setCurrency } = useCurrency();
  const { t } = useTranslation();

  const { data: currencies = [] } = useQuery({
    queryKey: ['currencies-list'],
    queryFn: () =>
      listFrom<CurrencyRow>('currencies', 'code, symbol', { col: 'code' }).catch(() => []),
    staleTime: Infinity,
  });

  if (!currencies.length) return null;

  return (
    <div className="inline-flex items-center gap-1">
      <Wallet size={16} className="shrink-0" aria-hidden="true" />
      <div className="relative">
        <select
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          aria-label={t('i18n.selectCurrency', 'Select currency')}
          className="cursor-pointer appearance-none rounded-element bg-transparent py-0 pl-1 pr-6 text-13 text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ height: 36, border: 'none' }}
        >
          {currencies.map((c) => (
            <option key={c.code} value={c.code} className="bg-background text-foreground">
              {c.code}
              {c.symbol && c.symbol !== c.code ? ` (${c.symbol})` : ''}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 opacity-50"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
