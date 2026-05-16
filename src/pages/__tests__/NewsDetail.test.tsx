/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/usePageFetchers', () => ({
  fetchNewsArticleBySlugOrId: vi.fn().mockResolvedValue(null),
  fetchRelatedNews: vi.fn().mockResolvedValue([]),
  fetchNewsCategories: vi.fn().mockResolvedValue([]),
  fetchNewsArticleById: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/hooks/useEntityImageAssets', () => ({ useEntityImageAssets: () => ({ data: {} }) }));

import NewsDetail from '../NewsDetail';

describe('NewsDetail', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/news/n1']}>
        <Routes><Route path="/news/:slug" element={<NewsDetail />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
