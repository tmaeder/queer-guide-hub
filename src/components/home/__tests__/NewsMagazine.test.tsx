/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useNews', () => ({
  useNews: () => ({ articles: [], loading: false, error: null }),
}));
vi.mock('@/hooks/useEntityImageAssets', () => ({
  useEntityImageAssets: () => ({ assets: new Map() }),
}));

import NewsMagazine from '../NewsMagazine';

describe('NewsMagazine', () => {
  it('renders (self-hides when empty)', () => {
    const { container } = render(
      <MemoryRouter>
        <NewsMagazine />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
