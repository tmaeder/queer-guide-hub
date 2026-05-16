/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useVisitorOrigin', () => ({ useVisitorOrigin: () => ({ originIata: null }) }));

import { SpecialOffersSection } from '../SpecialOffersSection';

describe('SpecialOffersSection', () => {
  it('renders', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<QueryClientProvider client={qc}><SpecialOffersSection /></QueryClientProvider>);
    expect(container).toBeTruthy();
  });
});
