/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({ currency: 'USD', setCurrency: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ listFrom: vi.fn().mockResolvedValue([]) }));

import { CurrencySelector } from '../CurrencySelector';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('CurrencySelector', () => {
  it('renders', () => {
    const { container } = render(<CurrencySelector />, { wrapper });
    expect(container).toBeTruthy();
  });
});
