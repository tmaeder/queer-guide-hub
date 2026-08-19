/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/admin/pipeline-builder/UnifiedDataOps', () => ({
  default: () => <div data-testid="unified" />,
}));

import AdminPipelines from '../AdminPipelines';

/**
 * A Router is REQUIRED: AdminArchetypeHeader derives its route line from
 * `useLocation()`. Rendering this page bare threw "useLocation() may be used
 * only in the context of a <Router>".
 */
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin/pipelines']}>
      <AdminPipelines />
    </MemoryRouter>,
  );

describe('AdminPipelines', () => {
  it('renders Suspense fallback then UnifiedDataOps', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('unified')).toBeInTheDocument());
  });

  // The regression this page was fixed for. /admin/pipelines rendered zero h1s
  // — the only admin route that never adopted AdminArchetypeHeader — which is
  // what quarantined it from e2e/admin-route-baseline.spec.ts under a wrong
  // diagnosis of a hung renderer. Asserted at the unit level so the heading
  // cannot be dropped again without a fast, local failure.
  //
  // What this canNOT see is the header sitting OUTSIDE the Suspense boundary:
  // the mock above resolves in a microtask, so the fallback is already gone by
  // the time `render` returns and "h1 present while still loading" is not
  // observable here. That placement is load-bearing all the same — it is what
  // keeps the route from being heading-less for as long as the chunk takes —
  // so treat a move of the header back inside the boundary as a regression
  // this file will not catch.
  it('renders exactly one h1', () => {
    renderPage();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Pipelines');
  });
});
