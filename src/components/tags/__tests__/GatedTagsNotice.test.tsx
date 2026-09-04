import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

// i18next is NOT initialised under vitest, so the real `t` echoes the
// defaultValue with `{{count}}` UN-INTERPOLATED — measured, not assumed. Other
// suites live with that and match loosely, but here the number IS the feature:
// choosing 14 over 102 is the entire design, and a test that cannot see the
// number cannot catch the component showing the wrong one. This shim does only
// the interpolation, so what is under test remains the component's choice of
// which count to pass.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string; count?: number }) =>
      (opts?.defaultValue ?? key).replace('{{count}}', String(opts?.count ?? '')),
  }),
}));

let authUser: { id: string } | null = null;
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: authUser, session: null, loading: false }),
}));

let counts: { total: number; non_adult: number } = { total: 102, non_adult: 14 };
const rpc = vi.fn();
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: (fn: string) => {
    rpc(fn);
    return Promise.resolve({ data: counts, error: null });
  },
}));

import { GatedTagsNotice } from '../GatedTagsNotice';

const wrap = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  rpc.mockClear();
  authUser = null;
  counts = { total: 102, non_adult: 14 };
});

describe('GatedTagsNotice', () => {
  // THE case the two-count design exists for. Measured on prod 2026-09-04: 102
  // gated terms, 88 of them adult, and SafeMode defaults to ON — so signing in
  // reveals 14. Claiming 102 to a safe-mode reader is false and disprovable in
  // one click.
  it('counts only what signing in actually reveals while safe mode hides adult terms', async () => {
    render(<GatedTagsNotice adultHidden />, { wrapper: wrap });
    expect(await screen.findByText(/14 more terms/i)).toBeInTheDocument();
    expect(screen.queryByText(/102 more terms/i)).not.toBeInTheDocument();
  });

  it('says plainly that safe mode is holding the remainder', async () => {
    render(<GatedTagsNotice adultHidden />, { wrapper: wrap });
    // 102 - 14. Without this the reader is left believing 14 is the whole gap.
    expect(await screen.findByText(/88 further terms stay hidden/i)).toBeInTheDocument();
  });

  it('counts the full set once adult terms are being shown', async () => {
    render(<GatedTagsNotice adultHidden={false} />, { wrapper: wrap });
    expect(await screen.findByText(/102 more terms/i)).toBeInTheDocument();
    // No safe-mode caveat when safe mode is not the thing holding anything.
    expect(screen.queryByText(/stay hidden while safe mode/i)).not.toBeInTheDocument();
  });

  it('renders nothing for a signed-in reader, and does not even ask', async () => {
    authUser = { id: 'u1' };
    const { container } = render(<GatedTagsNotice adultHidden />, { wrapper: wrap });
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    // RLS already showed them the rows; asking would spend a request per visit.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('renders nothing when nothing is gated', async () => {
    // The inverse control. Without it every assertion above passes on a build
    // that renders the notice unconditionally.
    counts = { total: 0, non_adult: 0 };
    const { container } = render(<GatedTagsNotice adultHidden />, { wrapper: wrap });
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when every gated term is adult and safe mode is on', async () => {
    // `total` is non-zero but signing in would add NOTHING to this list, so a
    // "sign in to see more" prompt would be a promise the product cannot keep.
    counts = { total: 88, non_adult: 0 };
    const { container } = render(<GatedTagsNotice adultHidden />, { wrapper: wrap });
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('links to sign-in without nesting a button inside an anchor', async () => {
    render(<GatedTagsNotice adultHidden />, { wrapper: wrap });
    const link = await screen.findByRole('link', { name: /sign in/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('/auth'));
    expect(link.querySelector('button')).toBeNull();
  });
});
