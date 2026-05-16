/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TrustTierBadge } from '../TrustTierBadge';

describe('TrustTierBadge', () => {
  it('renders with tier', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<QueryClientProvider client={qc}><TrustTierBadge userId="u1" tier="local" /></QueryClientProvider>);
    expect(container).toBeTruthy();
  });
});
