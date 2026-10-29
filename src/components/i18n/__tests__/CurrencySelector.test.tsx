/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => {
    const [currency, setCurrency] = useState('USD');
    return { currency, setCurrency };
  },
}));
vi.mock('@/hooks/usePageFetchers', () => ({ listFrom: vi.fn().mockResolvedValue([]) }));
import { CurrencySelector } from '../CurrencySelector';

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(
    ['currencies-list'],
    [
      { code: 'EUR', symbol: '€', name: 'Euro' },
      { code: 'GBP', symbol: '£', name: 'Pound' },
      { code: 'USD', symbol: '$', name: 'US Dollar' },
    ],
  );
  render(
    <QueryClientProvider client={client}>
      <CurrencySelector />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe('CurrencySelector', () => {
  it('shows every currency and retains a changed selection', async () => {
    const user = setup();
    const select = screen.getByRole('combobox', { name: 'Select currency' });
    expect(select).toHaveValue('USD');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    await user.selectOptions(select, 'EUR');
    expect(select).toHaveValue('EUR');
    expect((screen.getByRole('option', { name: /EUR/ }) as HTMLOptionElement).selected).toBe(true);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('keeps the control keyboard-focusable while changing currency', async () => {
    const user = setup();
    await user.tab();
    const select = screen.getByRole('combobox', { name: 'Select currency' });
    expect(select).toHaveFocus();
    await user.selectOptions(select, 'GBP');
    expect(select).toHaveValue('GBP');
    await user.selectOptions(select, 'USD');
    expect(select).toHaveValue('USD');
  });
});
