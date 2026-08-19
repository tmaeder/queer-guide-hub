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

// The page now renders AdminArchetypeHeader, which derives its route line from
// useLocation() — so this needs a router even though the page takes no params.
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

  it('renders exactly one h1 — the invariant admin-route-baseline asserts', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('unified')).toBeInTheDocument());
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Data operations');
  });
});
