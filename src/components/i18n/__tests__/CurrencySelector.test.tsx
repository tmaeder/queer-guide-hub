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
  it('shows the current value and all choices on the first pointer opening', async () => {
    const user = setup();
    const trigger = screen.getByRole('combobox', { name: 'Select currency' });
    expect(trigger).toHaveTextContent('USD');
    await user.click(trigger);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    await user.click(screen.getByRole('option', { name: /EUR/ }));
    expect(trigger).toHaveTextContent('EUR');
    await user.click(trigger);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('supports closed-menu typeahead immediately after keyboard focus', async () => {
    const user = setup();
    await user.tab();
    const trigger = screen.getByRole('combobox', { name: 'Select currency' });
    expect(trigger).toHaveFocus();
    await user.keyboard('g');
    expect(trigger).toHaveTextContent('GBP');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });
});
