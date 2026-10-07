/**
 * @vitest-environment jsdom
 *
 * Guards the fix for a FALSE SAFETY CLAIM, not a copy preference.
 *
 * `GatedContentNotice` told 1,807 cities in non-criminalizing countries that
 * "this destination has heightened legal risk for LGBTQ+ people", because it
 * inferred the reason for the gate from a non-zero count. Since 20261112100000
 * a venue is also gated when `category = 'cruising'`, in every country; the
 * 2026-10-05 import of 55,934 cruising venues made that the dominant reason.
 *
 * The two directions are NOT symmetric, which is why both are asserted:
 * overstating risk in Spain is wrong, understating it in a criminalizing country
 * is dangerous. The absent-field case therefore has its own test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';

// i18next is not initialised under vitest, so the real `t` echoes defaultValue
// with `{{count}}` un-interpolated. Only the interpolation is shimmed; which
// string the component CHOOSES is what is under test.
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

type Counts = {
  venues: number;
  events: number;
  organizations: number;
  queer_villages?: number;
  high_risk?: boolean;
};

let counts: Counts;
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: () => Promise.resolve({ data: counts, error: null }),
}));

import { GatedContentNotice } from '../GatedContentNotice';

const wrap = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

const LEGAL_RISK = /heightened legal risk/i;
const SENSITIVE = /sensitive locations/i;

beforeEach(() => {
  authUser = null;
  counts = { venues: 322, events: 0, organizations: 0, queer_villages: 0, high_risk: false };
});

describe('GatedContentNotice', () => {
  // THE incident. Madrid, 322 gated venues, every one a cruising venue, in a
  // country whose own panel on the same page says "legal since 1979".
  it('does not claim legal risk when the location is not high risk', async () => {
    render(<GatedContentNotice cityId="madrid-uuid" />, { wrapper: wrap });
    expect(await screen.findByText(SENSITIVE)).toBeInTheDocument();
    expect(screen.queryByText(LEGAL_RISK)).not.toBeInTheDocument();
  });

  // The count was never the broken part and must survive the fix: a notice that
  // stops saying how much is hidden is a different regression.
  it('still reports how many places are hidden', async () => {
    render(<GatedContentNotice cityId="madrid-uuid" />, { wrapper: wrap });
    expect(await screen.findByText(/322 places/i)).toBeInTheDocument();
  });

  // Naming the category on a signed-out page advertises it to exactly the
  // audience the gate exists to keep it from — the reason AUTH_ONLY_CATEGORIES
  // hides the filter chip instead of offering it.
  it('never names the gated category to an anonymous reader', async () => {
    const { container } = render(<GatedContentNotice cityId="madrid-uuid" />, { wrapper: wrap });
    await screen.findByText(SENSITIVE);
    expect(container.textContent ?? '').not.toMatch(/cruis/i);
  });

  it('keeps the legal-risk copy where the location really is high risk', async () => {
    counts = { venues: 12, events: 3, organizations: 1, high_risk: true };
    render(<GatedContentNotice countryId="ae-uuid" />, { wrapper: wrap });
    expect(await screen.findByText(LEGAL_RISK)).toBeInTheDocument();
    expect(screen.queryByText(SENSITIVE)).not.toBeInTheDocument();
  });

  // Fail SAFE. An older deployed `gated_count_for_location`, or a response
  // cached from before the migration, returns no `high_risk` at all. Falsy
  // would serve the sensitive copy to a reader in a criminalizing country —
  // the dangerous direction, and the one a truthiness test gets wrong.
  it('falls back to the legal-risk copy when the reason is unknown', async () => {
    counts = { venues: 7, events: 0, organizations: 0 };
    render(<GatedContentNotice countryId="unknown-uuid" />, { wrapper: wrap });
    expect(await screen.findByText(LEGAL_RISK)).toBeInTheDocument();
    expect(screen.queryByText(SENSITIVE)).not.toBeInTheDocument();
  });

  it('renders nothing when nothing is gated', async () => {
    counts = { venues: 0, events: 0, organizations: 0, high_risk: false };
    const { container } = render(<GatedContentNotice cityId="zurich-uuid" />, { wrapper: wrap });
    await Promise.resolve();
    expect(container.textContent).toBe('');
  });

  it('renders nothing for a signed-in reader, who can see the rows anyway', async () => {
    authUser = { id: 'u1' };
    const { container } = render(<GatedContentNotice cityId="madrid-uuid" />, { wrapper: wrap });
    await Promise.resolve();
    expect(container.textContent).toBe('');
  });
});

/**
 * The component can only branch on a field the RPC actually returns, and the
 * RPC is `create or replace` — a later restatement that drops `high_risk`
 * silently returns every reader to the legal-risk copy, which is the fail-safe
 * direction and therefore invisible on every page in Spain. Asserted against
 * the LATEST migration defining the function rather than a pinned filename, so
 * a future redefinition has to keep it.
 */
describe('gated_count_for_location migration', () => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const latest = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find((f) => {
      const sql = readFileSync(join(dir, f), 'utf8');
      return /create or replace function\s+public\.gated_count_for_location/i.test(sql);
    });

  // A zero-match sweep also satisfies "every definition returns high_risk".
  it('finds a migration defining the function', () => {
    expect(latest).toBeTruthy();
  });

  const sql = latest ? readFileSync(join(dir, latest), 'utf8') : '';

  it('returns high_risk from location_is_high_risk, not from a count', () => {
    expect(sql).toMatch(/'high_risk',\s*public\.location_is_high_risk\(p_country_id,\s*p_city_id\)/);
  });

  it('asserts the key exists and is a boolean before committing', () => {
    expect(sql).toMatch(/\?\s*'high_risk'/);
    expect(sql).toMatch(/jsonb_typeof\([^)]*'high_risk'\)\s*<>\s*'boolean'/);
  });

  // Without a gated low-risk city the new branch is unreachable and the
  // agreement check proves nothing about it — a zero there means the probe is
  // measuring nothing, not that the corpus is clean.
  it('carries a positive control for the branch it creates', () => {
    expect(sql).toMatch(/v_low_risk_gated\s*=\s*0/);
  });
});
