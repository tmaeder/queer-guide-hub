/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const navigate = vi.fn();
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigate }));
vi.mock('@/hooks/usePageFetchers', () => ({
  usePersonalitiesByProfession: () => ({ data: [], isLoading: false }),
  // Legacy-URL self-heal. Returns the canonical spelling of the :professionName
  // param; null means "no better spelling", which must NOT trigger a redirect.
  useCanonicalProfession: () => ({ data: null }),
}));

import ProfessionDetail from '../ProfessionDetail';

// The param is :professionName — the component reads useParams().professionName,
// so a route declaring :slug leaves it undefined and only ever renders the
// not-found branch.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/professions/:professionName" element={<ProfessionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProfessionDetail', () => {
  it('renders without crashing', () => {
    const { container } = renderAt('/professions/writer');
    expect(container).toBeTruthy();
  });

  it('does not redirect when the slug is already canonical', () => {
    navigate.mockClear();
    renderAt('/professions/Writer');
    expect(navigate).not.toHaveBeenCalled();
  });
});
