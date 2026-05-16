/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { useTagsMock, getTagDetailsFn } = vi.hoisted(() => ({
  useTagsMock: vi.fn(),
  getTagDetailsFn: vi.fn(),
}));

vi.mock('@/hooks/useTags', () => ({ useTags: useTagsMock }));

import TagDetail from '../TagDetail';

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/tags/${slug}`]}>
      <Routes><Route path="/tags/:slug" element={<TagDetail />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useTagsMock.mockReset();
  getTagDetailsFn.mockReset();
});

describe('TagDetail page', () => {
  it('shows loading state', () => {
    useTagsMock.mockReturnValue({ tagDetails: null, getTagDetails: getTagDetailsFn, loading: true, error: null });
    renderAt('queer');
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it('shows error message', () => {
    useTagsMock.mockReturnValue({ tagDetails: null, getTagDetails: getTagDetailsFn, loading: false, error: 'rls' });
    renderAt('queer');
    expect(screen.getByText('rls')).toBeInTheDocument();
  });

  it('shows tag-not-found when no details after load', () => {
    useTagsMock.mockReturnValue({ tagDetails: null, getTagDetails: getTagDetailsFn, loading: false, error: null });
    renderAt('queer');
    expect(screen.getByText(/Tag not found/i)).toBeInTheDocument();
  });

  it('renders tag details with usage breakdown', () => {
    useTagsMock.mockReturnValue({
      tagDetails: {
        name: 'queer',
        total_count: 42,
        usage_by_category: [{ category: 'venues', count: 30 }, { category: 'events', count: 12 }],
      },
      getTagDetails: getTagDetailsFn,
      loading: false,
      error: null,
    });
    renderAt('queer');
    expect(screen.getByRole('heading', { name: '#queer' })).toBeInTheDocument();
    expect(screen.getByText(/42 items/)).toBeInTheDocument();
    expect(screen.getByText('venues')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });
});
