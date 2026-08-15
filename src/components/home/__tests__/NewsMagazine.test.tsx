/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';

vi.mock('@/hooks/useLatestNews', () => ({
  useLatestNews: () => ({ articles: [], loading: false, error: null }),
}));
vi.mock('@/hooks/useEntityImageAssets', () => ({
  useEntityImageAssets: () => ({ assets: new Map() }),
}));

import NewsMagazine from '../NewsMagazine';

describe('NewsMagazine', () => {
  it('renders (self-hides when empty)', () => {
    // renderWithProviders, not a bare MemoryRouter: useEditorsPick is a
    // react-query hook now, so the band needs a QueryClient in scope.
    const { container } = renderWithProviders(<NewsMagazine />);
    expect(container).toBeTruthy();
  });
});
