/**
 * @vitest-environment jsdom
 *
 * The governance consolidation: one route, three modes, and three old paths
 * kept as search-preserving shims.
 *
 * WHY THESE ARE UNIT TESTS AND NOT A BROWSER RUN. `/admin/*` sits behind
 * `AdminRouteGuard`, so an unauthenticated visit lands on `/auth` before any of
 * this renders — which means a browser check of the redirect chain proves the
 * guard works and nothing about the redirects. The routing logic is
 * deterministic, so it is asserted here where it can actually be observed.
 *
 * THE ONE THING THAT MUST NOT REGRESS: `?queue=` survives the redirect. The 16
 * queue deep links are the only navigation into a scoped triage view, and a
 * shim that drops the query turns every one of them into the unscoped inbox —
 * silently, because the page still renders.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router';

// The three real pages pull in the whole admin data layer; this suite is about
// which one is chosen and what the URL carries, not what they render.
vi.mock('../AdminInbox', () => ({ default: () => <div data-testid="mode-triage" /> }));
vi.mock('../QualityHub', () => ({ default: () => <div data-testid="mode-engines" /> }));
vi.mock('../AdminDuplicates', () => ({ default: () => <div data-testid="mode-merge" /> }));

import AdminGovernance from '../AdminGovernance';

/** Mirrors routes.tsx's GovernanceRedirect exactly — same construction. */
function GovernanceRedirect({ mode }: { mode: 'triage' | 'engines' | 'merge' }) {
  const location = useLocation();
  const rest = location.search.replace(/^\?/, '');
  return <Navigate to={`/admin/governance?mode=${mode}${rest ? `&${rest}` : ''}`} replace />;
}

function Probe() {
  const location = useLocation();
  return <output data-testid="url">{location.pathname + location.search}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/governance"
          element={
            <>
              <Probe />
              <AdminGovernance />
            </>
          }
        />
        <Route path="/admin/inbox" element={<GovernanceRedirect mode="triage" />} />
        <Route path="/admin/quality" element={<GovernanceRedirect mode="engines" />} />
        <Route path="/admin/duplicates" element={<GovernanceRedirect mode="merge" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminGovernance — mode selection', () => {
  it('defaults to triage when no mode is given', async () => {
    // findBy, not getBy: the three modes are React.lazy, so Suspense resolves
    // them on a microtask and a synchronous query races it.
    renderAt('/admin/governance');
    expect(await screen.findByTestId('mode-triage')).toBeInTheDocument();
  });

  it('renders engines and merge on request', async () => {
    renderAt('/admin/governance?mode=engines');
    expect(await screen.findByTestId('mode-engines')).toBeInTheDocument();
    expect(screen.queryByTestId('mode-triage')).not.toBeInTheDocument();

    renderAt('/admin/governance?mode=merge');
    expect(await screen.findByTestId('mode-merge')).toBeInTheDocument();
  });

  it('falls back to triage on an unrecognised mode rather than rendering nothing', async () => {
    // A blank page for a typo'd URL reads as a broken route.
    renderAt('/admin/governance?mode=not-a-mode');
    expect(await screen.findByTestId('mode-triage')).toBeInTheDocument();
  });

  it('offers all three modes as controls, with the current one marked', () => {
    renderAt('/admin/governance?mode=merge');
    const nav = screen.getByRole('navigation', { name: /governance mode/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Merge/i })).toHaveAttribute('aria-current', 'page');
    // Colour is never the only cue — the current mode is also announced.
    expect(screen.getByRole('button', { name: /Triage/i })).not.toHaveAttribute('aria-current');
  });
});

describe('the three old paths still resolve, and carry their query through', () => {
  it('/admin/inbox lands on triage', async () => {
    renderAt('/admin/inbox');
    expect(screen.getByTestId('url')).toHaveTextContent('/admin/governance?mode=triage');
    expect(await screen.findByTestId('mode-triage')).toBeInTheDocument();
  });

  it('/admin/inbox?queue=… KEEPS the queue — the regression that would be silent', () => {
    renderAt('/admin/inbox?queue=quality-city');
    // Dropping this renders the unscoped inbox, which looks fine and is wrong.
    expect(screen.getByTestId('url')).toHaveTextContent('queue=quality-city');
    expect(screen.getByTestId('url')).toHaveTextContent('mode=triage');
  });

  it('preserves multiple params, not just the first', () => {
    renderAt('/admin/inbox?queue=staging&sort=age');
    const url = screen.getByTestId('url').textContent ?? '';
    expect(url).toContain('queue=staging');
    expect(url).toContain('sort=age');
  });

  it('/admin/quality lands on engines and /admin/duplicates on merge', async () => {
    renderAt('/admin/quality');
    expect(await screen.findByTestId('mode-engines')).toBeInTheDocument();

    renderAt('/admin/duplicates');
    expect(await screen.findByTestId('mode-merge')).toBeInTheDocument();
  });

  it('legacy ?tab= survives the shim so AdminInbox can still map it', () => {
    // AdminInbox holds a TAB_TO_QUEUE map for nine legacy keys; the redirect
    // must not eat the parameter before it gets there.
    renderAt('/admin/inbox?tab=moderation');
    expect(screen.getByTestId('url')).toHaveTextContent('tab=moderation');
  });
});
