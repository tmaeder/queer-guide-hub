/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { useCMSPageMock } = vi.hoisted(() => ({ useCMSPageMock: vi.fn() }));

vi.mock('@/hooks/useCMSPage', () => ({ useCMSPage: useCMSPageMock }));
vi.mock('dompurify', () => ({
  default: { sanitize: (s: string) => s },
}));

import Page from '../Page';

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/p/${slug}`]}>
      <Routes><Route path="/p/:slug" element={<Page />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => useCMSPageMock.mockReset());

describe('Page (CMS renderer)', () => {
  it('shows loading state', () => {
    useCMSPageMock.mockReturnValue({ data: undefined, isLoading: true });
    renderAt('about');
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('renders not-found message', () => {
    useCMSPageMock.mockReturnValue({ data: { page: null, notFound: true }, isLoading: false });
    renderAt('missing');
    expect(screen.getByText(/Page Not Found/i)).toBeInTheDocument();
  });

  it('renders page with title + sanitized body + tags', () => {
    useCMSPageMock.mockReturnValue({
      data: {
        page: {
          title: 'About',
          subtitle: 'sub',
          body_html: '<p>hello</p>',
          tags: ['queer', 'travel'],
          category: 'guides',
          published_at: '2026-05-15',
        },
        notFound: false,
      },
      isLoading: false,
    });
    renderAt('about');
    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByText('queer')).toBeInTheDocument();
    expect(screen.getByText('guides')).toBeInTheDocument();
  });
});
