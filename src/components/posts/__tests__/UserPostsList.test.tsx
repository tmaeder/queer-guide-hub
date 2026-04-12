import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<object> = { get: (_t, p) => { if (p === 'then') return undefined; return (..._a: unknown[]) => new Proxy(() => {}, h); }, apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h), channel: () => new Proxy(() => {}, h), removeChannel: vi.fn() } }; });
import { UserPostsList } from '../UserPostsList';
const w = ({ children }: { children: ReactNode }) => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>; };
describe('UserPostsList', () => {
  it('should render without crashing', () => { render(<UserPostsList userId="u-1" />, { wrapper: w }); expect(document.body).toBeTruthy(); });
});
