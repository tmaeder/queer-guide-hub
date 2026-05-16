/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/usePageFetchers', () => ({ usePersonalitiesByProfession: () => ({ data: [], isLoading: false }) }));

import ProfessionDetail from '../ProfessionDetail';

describe('ProfessionDetail', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/professions/writer']}>
        <Routes><Route path="/professions/:slug" element={<ProfessionDetail />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
