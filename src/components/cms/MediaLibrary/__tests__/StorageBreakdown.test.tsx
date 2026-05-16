/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { StorageBreakdown } from '../StorageBreakdown';

describe('StorageBreakdown', () => {
  it('renders', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<QueryClientProvider client={qc}><StorageBreakdown /></QueryClientProvider>);
    expect(container).toBeTruthy();
  });
});
