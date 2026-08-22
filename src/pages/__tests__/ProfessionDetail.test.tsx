/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const navigate = vi.fn();

// The mocked hook results MUST be stable references across renders.
// ProfessionDetail's effect lists `personalities` as a dependency and calls
// setProfessionData() with a fresh object, so returning a new `[]` per render
// re-arms the effect forever: the render loop spins until the vitest worker
// exhausts its heap and V8 aborts the whole run. Real react-query hands back the
// same reference until a refetch, so only the test can produce this.
const stub = vi.hoisted(() => ({
  personalities: { data: [] as unknown[], isLoading: false },
  // Legacy-URL self-heal. Returns the canonical spelling of the :professionName
  // param; null means "no better spelling", which must NOT trigger a redirect.
  canonical: { data: null as string | null },
  imageAssets: { assets: new Map<string, unknown>() },
}));

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigate }));
vi.mock('@/hooks/usePageFetchers', () => ({
  usePersonalitiesByProfession: () => stub.personalities,
  useCanonicalProfession: () => stub.canonical,
}));
vi.mock('@/hooks/useEntityImageAssets', () => ({
  useEntityImageAssets: () => stub.imageAssets,
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
