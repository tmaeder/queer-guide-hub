/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { CreateUserDialog } from '../CreateUserDialog';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('CreateUserDialog', () => {
  it('renders nothing when closed', () => {
    render(<CreateUserDialog open={false} onOpenChange={vi.fn()} />, { wrapper });
    expect(screen.queryByText(/Email/i)).toBeNull();
  });

  it('renders form fields when open', () => {
    render(<CreateUserDialog open onOpenChange={vi.fn()} />, { wrapper });
    expect(screen.getAllByText(/Email/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Password/i).length).toBeGreaterThan(0);
  });

  it('Password populated with generated value', () => {
    render(<CreateUserDialog open onOpenChange={vi.fn()} />, { wrapper });
    const inputs = document.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    const passwordInput = Array.from(inputs).find((i) => i.value.length >= 8);
    expect(passwordInput).toBeDefined();
  });
});
