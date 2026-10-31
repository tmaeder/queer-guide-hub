/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/contexts/BreadcrumbContext', () => ({ useBreadcrumbs: vi.fn() }));
vi.mock('@/components/organizations/OrganizationCard', () => ({
  OrganizationCard: ({ org }: { org: { name: string } }) => <div data-testid="org">{org.name}</div>,
}));

type Opts = { role?: string; q?: string; limit?: number; enabled?: boolean };
const calls: Opts[] = [];
const byRole: Record<string, string[]> = {
  support: ['Switchboard'],
  advocacy: ['Stonewall'],
  publisher: ['PinkNews'],
  seller: ['Otherwild'],
  venue: ['Bar Buka'],
  organizer: [],
  community: [],
};
vi.mock('@/hooks/useOrganization', () => ({
  useOrganizationsList: (opts: Opts) => {
    calls.push(opts);
    if (opts.enabled === false) return { data: [], isLoading: false };
    const names = opts.q ? ['Search Hit'] : opts.role ? byRole[opts.role] : byRole.venue;
    return {
      data: names.map((name, i) => ({ id: `${opts.role}-${i}`, name, roles: [opts.role] })),
      isLoading: false,
    };
  },
}));

import Organizations from '../Organizations';

function renderAt(path = '/organizations') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Organizations />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  calls.length = 0;
  vi.useRealTimers();
});

describe('Organizations directory', () => {
  it('opens on an overview of what the lede promises, not on venues', () => {
    // As a flat list, "All" returned 100 venue identities on prod and nothing else.
    renderAt();
    for (const name of ['Support', 'Advocacy', 'News outlets', 'Shops']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.queryByText('Bar Buka')).toBeNull();
    expect(screen.getByText('Switchboard')).toBeInTheDocument();
  });

  it('hides a kind with no organizations instead of offering an empty tab', () => {
    renderAt();
    expect(screen.queryByRole('button', { name: 'Community' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Organisers' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Venues' })).toBeInTheDocument();
  });

  it('still lists venues on the Venues tab', () => {
    renderAt('/organizations?role=venue');
    expect(screen.getByText('Bar Buka')).toBeInTheDocument();
  });

  it('opens a full kind from its overview section', () => {
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: 'All support →' }));
    expect(screen.getByRole('button', { name: 'Support' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('searches by name through the RPC', () => {
    vi.useFakeTimers();
    renderAt();
    fireEvent.change(screen.getByPlaceholderText(/Search organizations/), {
      target: { value: 'swit' },
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(calls.some((c) => c.q === 'swit' && c.enabled !== false)).toBe(true);
    expect(screen.getByText('Search Hit')).toBeInTheDocument();
  });
});
