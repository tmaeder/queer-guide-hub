import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h) } }; });
import { DonorWall } from '../DonorWall';
const w = ({ children }: { children: ReactNode }) => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return <QueryClientProvider client={qc}>{children}</QueryClientProvider>; };
describe('DonorWall', () => {
  it('should render loading state', () => { render(<DonorWall />, { wrapper: w }); expect(screen.getByText('Loading donors...')).toBeInTheDocument(); });
});
