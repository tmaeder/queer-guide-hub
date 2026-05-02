import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useCurrency } from '@/hooks/useCurrency';

interface CurrencyRow {
  code: string;
  symbol: string | null;
}

export function CurrencySelector() {
  const { currency, setCurrency } = useCurrency();

  const { data: currencies = [] } = useQuery({
    queryKey: ['currencies-list'],
    queryFn: async (): Promise<CurrencyRow[]> => {
      const { data, error } = await supabase
        .from('currencies')
        .select('code, symbol')
        .order('code');
      if (error) return [];
      return data || [];
    },
    staleTime: Infinity,
  });

  if (!currencies.length) return null;

  return (
    <Select value={currency} onValueChange={setCurrency}>
      <SelectTrigger
        aria-label="Select currency"
        style={{
          width: 'auto',
          minWidth: 0,
          height: 36,
          padding: '0 8px',
          gap: 4,
          border: 'none',
          background: 'transparent',
        }}
      >
        <Wallet style={{ width: 16, height: 16, flexShrink: 0 }} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {currencies.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            <span className="text-[0.8125rem]">
              {c.code} {c.symbol ? `(${c.symbol})` : ''}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
